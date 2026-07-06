const express = require('express');
const router = express.Router();
const { createOrder, getOrderByToken, confirmOrder, cancelOrder } = require('../controllers/orderController');

router.post('/', createOrder);
router.get('/:token', getOrderByToken);
router.patch('/:token/confirm', confirmOrder);
router.patch('/:token/cancel', cancelOrder);

module.exports = router;
