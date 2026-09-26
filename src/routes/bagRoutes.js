const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../utils/adminAuth');
const {
    getAllBags,
    getBagById,
    createBag,
    updateBag,
    deleteBag,
} = require('../controllers/bagController');

router.route('/')
    .get(getAllBags)
    .post(requireAdmin, createBag);

router.route('/:id')
    .get(getBagById)
    .put(requireAdmin, updateBag)
    .delete(requireAdmin, deleteBag);

module.exports = router;