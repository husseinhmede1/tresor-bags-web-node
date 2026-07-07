const express = require('express');
const router = express.Router();
const { getAllCollections, getCollectionById, createCollection, updateCollection, deleteCollection } = require('../controllers/collectionController');

router.route('/').get(getAllCollections).post(createCollection);
router.route('/:id').get(getCollectionById).put(updateCollection).delete(deleteCollection);

module.exports = router;
