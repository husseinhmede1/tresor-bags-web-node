const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../utils/adminAuth');
const c = require('../controllers/infoController');

// Admin only: customers reach this data through the assistant, never directly.
router.use(requireAdmin);
router.get('/unanswered', c.listUnanswered);
router.patch('/unanswered/:id', c.updateUnanswered);
router.route('/').get(c.listInfo).post(c.createInfo);
router.route('/:id').put(c.updateInfo).delete(c.deleteInfo);

module.exports = router;
