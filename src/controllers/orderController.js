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
        const { items, delivery, total, savings } = req.body;
        const confirmToken = crypto.randomBytes(32).toString('hex');
        const order = await Order.create({ items, delivery, total, savings, confirmToken });
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
