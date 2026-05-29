const express = require('express');
const router = express.Router();
const {
    getAllBags,
    getBagById,
    createBag,
    updateBag,
    deleteBag,
} = require('../controllers/bagController');

router.route('/')
    .get(getAllBags)
    .post(createBag);

router.route('/:id')
    .get(getBagById)
    .put(updateBag)
    .delete(deleteBag);

module.exports = router;