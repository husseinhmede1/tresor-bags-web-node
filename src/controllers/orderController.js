const crypto = require('crypto');
const Order = require('../models/Order');
const Bag = require('../models/Bag');
const { periodRange } = require('../utils/dateRange');

// GET /api/orders?status=&period=&page=&limit=
const getAllOrders = async (req, res) => {
    try {
        const { status, period, page = 1, limit = 20 } = req.query;
        const filter = {};
        if (status && ['pending', 'confirmed', 'cancelled'].includes(status)) filter.status = status;
        if (period && period !== 'all') filter.createdAt = { $gte: periodRange(period).from };

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;

        const [orders, total] = await Promise.all([
            Order.find(filter).select('-items.mainImage').sort({ createdAt: -1 }).skip(skip).limit(limitNum),
            Order.countDocuments(filter),
        ]);

        res.json({
            success: true,
            total,
            page: pageNum,
            totalPages: Math.ceil(total / limitNum),
            count: orders.length,
            data: orders,
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const createOrder = async (req, res) => {
    try {
        const { items, delivery } = req.body;
        if (!Array.isArray(items) || !items.length || items.length > 50) {
            return res.status(400).json({ success: false, message: 'Your cart is empty' });
        }
        // Prices come from the database, never from the browser.
        const round = (n) => Math.round(n * 100) / 100;
        const bags = await Bag.find({ _id: { $in: items.map(i => i.bagId) } })
            .select('title price mainImage typeId').populate('typeId', 'discount').lean();
        const byId = new Map(bags.map(b => [String(b._id), b]));
        const clean = [];
        for (const i of items) {
            const bag = byId.get(String(i.bagId));
            const quantity = Math.floor(Number(i.quantity));
            if (!bag || !(quantity >= 1 && quantity <= 99)) {
                return res.status(400).json({ success: false, message: 'Some items in your cart are no longer available, please refresh' });
            }
            const discount = bag.typeId?.discount || 0;
            clean.push({
                bagId: bag._id, title: bag.title, mainImage: bag.mainImage, price: bag.price, discount, quantity,
                subtotal: round(bag.price * (1 - discount / 100) * quantity),
            });
        }
        const total = round(clean.reduce((sum, i) => sum + i.subtotal, 0));
        const savings = round(clean.reduce((sum, i) => sum + i.price * i.quantity, 0) - total);
        const confirmToken = crypto.randomBytes(32).toString('hex');
        const order = await Order.create({ items: clean, delivery, total, savings, confirmToken });
        res.status(201).json({ success: true, data: { orderId: order._id, confirmToken } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const getOrderByToken = async (req, res) => {
    try {
        const order = await Order.findOne({ confirmToken: req.params.token });
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        res.json({ success: true, data: order });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const confirmOrder = async (req, res) => {
    try {
        const order = await Order.findOne({ confirmToken: req.params.token });
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        if (order.status === 'confirmed') {
            return res.json({ success: true, data: order, message: 'Already confirmed' });
        }
        if (order.status === 'cancelled') {
            return res.status(400).json({ success: false, message: 'Order is cancelled' });
        }

        // Validate stock for all items before touching anything
        const insufficient = [];
        for (const item of order.items) {
            const bag = await Bag.findById(item.bagId).select('stock title');
            const available = bag ? bag.stock : 0;
            if (available < item.quantity) {
                insufficient.push({
                    title: item.title,
                    required: item.quantity,
                    available,
                });
            }
        }
        if (insufficient.length > 0) {
            return res.status(400).json({ success: false, message: 'Insufficient stock', insufficient });
        }

        // All good — deduct stock
        for (const item of order.items) {
            await Bag.findByIdAndUpdate(item.bagId, { $inc: { stock: -item.quantity } });
        }
        order.status = 'confirmed';
        order.confirmedAt = new Date();
        await order.save();
        res.json({ success: true, data: order });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const cancelOrder = async (req, res) => {
    try {
        const order = await Order.findOne({ confirmToken: req.params.token });
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        if (order.status === 'cancelled') {
            return res.json({ success: true, data: order, message: 'Already cancelled' });
        }
        if (order.status === 'confirmed') {
            return res.status(400).json({ success: false, message: 'Order already confirmed' });
        }
        order.status = 'cancelled';
        order.cancelledAt = new Date();
        await order.save();
        res.json({ success: true, data: order });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = { createOrder, getAllOrders, getOrderByToken, confirmOrder, cancelOrder };
