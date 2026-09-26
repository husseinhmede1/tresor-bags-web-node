const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../utils/adminAuth');
const { getAllCollections, getCollectionById, createCollection, updateCollection, deleteCollection } = require('../controllers/collectionController');

router.route('/').get(getAllCollections).post(requireAdmin, createCollection);
router.route('/:id').get(getCollectionById).put(requireAdmin, updateCollection).delete(requireAdmin, deleteCollection);

module.exports = router;
