const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../utils/adminAuth');
const {
    videoUploadAuth,
    getAllBags,
    getBagById,
    createBag,
    updateBag,
    deleteBag,
} = require('../controllers/bagController');

router.post('/video-upload', requireAdmin, videoUploadAuth);

router.route('/')
    .get(getAllBags)
    .post(requireAdmin, createBag);

router.route('/:id')
    .get(getBagById)
    .put(requireAdmin, updateBag)
    .delete(requireAdmin, deleteBag);

module.exports = router;