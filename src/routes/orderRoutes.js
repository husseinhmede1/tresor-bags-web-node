const express = require('express');
const router = express.Router();
const { createOrder, getOrderByToken, confirmOrder } = require('../controllers/orderController');

router.post('/', createOrder);
router.get('/:token', getOrderByToken);
router.patch('/:token/confirm', confirmOrder);

module.exports = router;
