const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../utils/adminAuth');
const { getSettings, updateSettings } = require('../controllers/settingController');

// Admin only. The shop's pages learn the occasion with the bags they load anyway.
router.use(requireAdmin);
router.route('/').get(getSettings).put(updateSettings);

module.exports = router;
