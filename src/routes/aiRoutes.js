const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../utils/adminAuth');
const { parseProduct } = require('../controllers/aiController');

const { askShop } = require('../controllers/askController');

// Simple per-IP limiter (in memory; resets on restart).
const WINDOW_MS = 60 * 60 * 1000;
const limiter = (max, message) => {
    const hits = new Map();
    return (req, res, next) => {
        const now = Date.now();
        const recent = (hits.get(req.ip) || []).filter(t => now - t < WINDOW_MS);
        if (recent.length >= max) return res.status(429).json({ success: false, message });
        recent.push(now);
        hits.set(req.ip, recent);
        if (hits.size > 5000) hits.delete(hits.keys().next().value);
        next();
    };
};

// The admin API has no server-side auth yet, so cap AI calls per IP to stop
// anyone who finds the endpoint from running up the API bill.
router.post('/parse-product',
    requireAdmin,
    limiter(Number(process.env.AI_RATE_LIMIT) || 60, 'Too many AI requests, try again later'),
    parseProduct);

// Public shop assistant: no per-visitor limit (the shop's choice). Usage shows on the admin
// Stats page ("Ask Trésor").
router.post('/ask', askShop);

module.exports = router;
