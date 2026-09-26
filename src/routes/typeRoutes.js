const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../utils/adminAuth');
const { getAllTypes, getTypeById, createType, updateType, deleteType } = require('../controllers/typeController');

router.route('/').get(getAllTypes).post(requireAdmin, createType);
router.route('/:id').get(getTypeById).put(requireAdmin, updateType).delete(requireAdmin, deleteType);

module.exports = router;
