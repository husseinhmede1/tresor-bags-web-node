const crypto = require('crypto');
const Order = require('../models/Order');
const Bag = require('../models/Bag');

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
        // Deduct stock from each bag
        for (const item of order.items) {
            await Bag.findByIdAndUpdate(item.bagId, {
                $inc: { stock: -item.quantity }
            });
        }
        order.status = 'confirmed';
        order.confirmedAt = new Date();
        await order.save();
        res.json({ success: true, data: order });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = { createOrder, getOrderByToken, confirmOrder };
