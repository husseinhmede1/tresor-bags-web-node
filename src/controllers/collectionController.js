const mongoose = require('mongoose');
const Collection = require('../models/Collection');
const { storeAll, deleteUrls } = require('../utils/imageStore');
const catalogIndex = require('../utils/catalogIndex');

// Upload a new logo (data URL) to ImageKit, in place on `body`.
const storeLogo = async (body, id) => {
    if (body.logo) [body.logo] = await storeAll([body.logo], `/collections/${id}`, 'logo');
};

// GET /api/collections
const getAllCollections = async (req, res) => {
    try {
        const { search } = req.query;
        const filter = {};
        if (search) filter.title = { $regex: search, $options: 'i' };
        const collections = await Collection.find(filter).sort({ createdAt: -1 });
        res.status(200).json({ success: true, count: collections.length, data: collections });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// GET /api/collections/:id
const getCollectionById = async (req, res) => {
    try {
        const collection = await Collection.findById(req.params.id);
        if (!collection) return res.status(404).json({ success: false, message: 'Collection not found' });
        res.status(200).json({ success: true, data: collection });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// POST /api/collections
const createCollection = async (req, res) => {
    try {
        const _id = new mongoose.Types.ObjectId();
        await storeLogo(req.body, _id);
        const collection = await Collection.create({ ...req.body, _id });
        res.status(201).json({ success: true, data: collection });
    } catch (e) { res.status(400).json({ success: false, message: e.message }); }
};

// PUT /api/collections/:id
const updateCollection = async (req, res) => {
    try {
        const old = await Collection.findById(req.params.id).select('logo').lean();
        if (!old) return res.status(404).json({ success: false, message: 'Collection not found' });
        await storeLogo(req.body, req.params.id);
        const collection = await Collection.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!collection) return res.status(404).json({ success: false, message: 'Collection not found' });
        res.status(200).json({ success: true, data: collection });
        catalogIndex.reindex().catch(() => {}); // bags show the collection name
        if (old.logo && old.logo !== collection.logo) deleteUrls([old.logo], `/collections/${collection._id}`);
    } catch (e) { res.status(400).json({ success: false, message: e.message }); }
};

// DELETE /api/collections/:id
const deleteCollection = async (req, res) => {
    try {
        const collection = await Collection.findByIdAndDelete(req.params.id);
        if (!collection) return res.status(404).json({ success: false, message: 'Collection not found' });
        res.status(200).json({ success: true, message: 'Collection deleted' });
        if (collection.logo) deleteUrls([collection.logo], `/collections/${collection._id}`);
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

module.exports = { getAllCollections, getCollectionById, createCollection, updateCollection, deleteCollection };
