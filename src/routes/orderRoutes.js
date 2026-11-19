const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../utils/adminAuth');
const { createOrder, getAllOrders, getWaiting, getOrderByToken, confirmOrder, deliverOrder, cancelOrder } = require('../controllers/orderController');

router.post('/', createOrder);
router.get('/', requireAdmin, getAllOrders);
router.get('/waiting', requireAdmin, getWaiting);
router.get('/:token', requireAdmin, getOrderByToken);
router.patch('/:token/confirm', requireAdmin, confirmOrder);
router.patch('/:token/deliver', requireAdmin, deliverOrder);
router.patch('/:token/cancel', requireAdmin, cancelOrder);

module.exports = router;
