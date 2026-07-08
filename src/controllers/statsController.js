const Order = require('../models/Order');
const { periodRange } = require('../utils/dateRange');

// GET /api/stats?period=day|week|month
// Revenue is based on CONFIRMED orders (a confirmed order = payment received),
// bucketed by confirmedAt. Pending is reported all-time since it's always actionable.
const getStats = async (req, res) => {
    try {
        const { period = 'week' } = req.query;
        const { from, bucket } = periodRange(period);

        const confirmedMatch = { status: 'confirmed', confirmedAt: { $gte: from } };

        const [kpiAgg] = await Order.aggregate([
            { $match: confirmedMatch },
            { $group: { _id: null, revenue: { $sum: '$total' }, discounts: { $sum: '$savings' }, count: { $sum: 1 } } },
        ]);
        const revenue = kpiAgg?.revenue || 0;
        const confirmedOrders = kpiAgg?.count || 0;
        const discountsGiven = kpiAgg?.discounts || 0;
        const avgOrderValue = confirmedOrders ? revenue / confirmedOrders : 0;

        const [pendingOrders, cancelledOrders] = await Promise.all([
            Order.countDocuments({ status: 'pending' }),
            Order.countDocuments({ status: 'cancelled', createdAt: { $gte: from } }),
        ]);

        const fmt = bucket === 'hour' ? '%Y-%m-%d %H:00' : '%Y-%m-%d';
        const series = await Order.aggregate([
            { $match: confirmedMatch },
            { $group: { _id: { $dateToString: { format: fmt, date: '$confirmedAt' } }, revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
            { $sort: { _id: 1 } },
        ]);
        const timeseries = series.map((s) => ({ bucket: s._id, revenue: s.revenue, orders: s.orders }));

        const top = await Order.aggregate([
            { $match: confirmedMatch },
            { $unwind: '$items' },
            { $group: { _id: '$items.title', quantity: { $sum: '$items.quantity' }, revenue: { $sum: '$items.subtotal' } } },
            { $sort: { quantity: -1 } },
            { $limit: 6 },
        ]);
        const topSellers = top.map((b) => ({ title: b._id, quantity: b.quantity, revenue: b.revenue }));

        res.json({
            success: true,
            period,
            from,
            kpis: { revenue, confirmedOrders, avgOrderValue, discountsGiven, pendingOrders, cancelledOrders },
            timeseries,
            topSellers,
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = { getStats };
