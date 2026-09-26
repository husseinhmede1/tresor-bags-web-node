const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../utils/adminAuth');
const { getStats } = require('../controllers/statsController');

router.get('/', requireAdmin, getStats);

module.exports = router;
