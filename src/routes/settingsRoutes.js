const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { requireAdmin } = require('../utils/adminAuth');

// Admin settings shared by every device, kept in one document of the app_flags collection.
const VIDEO_QUALITIES = ['saver', 'balanced', 'high'];
const DEFAULTS = { videoQuality: 'balanced' };
const doc = () => mongoose.connection.collection('app_flags');

router.use(requireAdmin);

router.get('/', async (req, res) => {
    try {
        const saved = await doc().findOne({ _id: 'settings' });
        res.json({ success: true, data: { ...DEFAULTS, ...(saved?.values || {}) } });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/', async (req, res) => {
    try {
        const values = {};
        if (req.body?.videoQuality !== undefined) {
            if (!VIDEO_QUALITIES.includes(req.body.videoQuality)) {
                return res.status(400).json({ success: false, message: 'Unknown video quality' });
            }
            values['values.videoQuality'] = req.body.videoQuality;
        }
        if (Object.keys(values).length) {
            await doc().updateOne({ _id: 'settings' }, { $set: { ...values, at: new Date() } }, { upsert: true });
        }
        const saved = await doc().findOne({ _id: 'settings' });
        res.json({ success: true, data: { ...DEFAULTS, ...(saved?.values || {}) } });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
