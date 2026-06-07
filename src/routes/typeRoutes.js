const express = require('express');
const router = express.Router();
const { getAllTypes, getTypeById, createType, updateType, deleteType } = require('../controllers/typeController');

router.route('/').get(getAllTypes).post(createType);
router.route('/:id').get(getTypeById).put(updateType).delete(deleteType);

module.exports = router;
