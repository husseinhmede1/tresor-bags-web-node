const express = require('express');
const router = express.Router();
const { login, check, requireAdmin } = require('../utils/adminAuth');

router.post('/login', login);
router.get('/check', requireAdmin, check);

module.exports = router;
