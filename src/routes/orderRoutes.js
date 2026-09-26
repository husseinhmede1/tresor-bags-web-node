const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../utils/adminAuth');
const { createOrder, getAllOrders, getOrderByToken, confirmOrder, cancelOrder } = require('../controllers/orderController');

router.post('/', createOrder);
router.get('/', requireAdmin, getAllOrders);
router.get('/:token', requireAdmin, getOrderByToken);
router.patch('/:token/confirm', requireAdmin, confirmOrder);
router.patch('/:token/cancel', requireAdmin, cancelOrder);

module.exports = router;
