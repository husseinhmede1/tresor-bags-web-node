const express = require('express');
const router = express.Router();
const { parseProduct } = require('../controllers/aiController');

// The admin API has no server-side auth yet, so cap AI calls per IP to stop
// anyone who finds the endpoint from running up the API bill.
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = Number(process.env.AI_RATE_LIMIT) || 60;
const hits = new Map();

const rateLimit = (req, res, next) => {
    const now = Date.now();
    const recent = (hits.get(req.ip) || []).filter(t => now - t < WINDOW_MS);
    if (recent.length >= MAX_PER_WINDOW) {
        return res.status(429).json({ success: false, message: 'Too many AI requests, try again later' });
    }
    recent.push(now);
    hits.set(req.ip, recent);
    next();
};

router.post('/parse-product', rateLimit, parseProduct);

module.exports = router;
