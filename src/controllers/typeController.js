const Type = require('../models/Type');

const getAllTypes = async (req, res) => {
    try {
        const types = await Type.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: types });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

const getTypeById = async (req, res) => {
    try {
        const type = await Type.findById(req.params.id);
        if (!type) return res.status(404).json({ success: false, message: 'Type not found' });
        res.status(200).json({ success: true, data: type });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

const createType = async (req, res) => {
    try {
        const type = await Type.create(req.body);
        res.status(201).json({ success: true, data: type });
    } catch (e) { res.status(400).json({ success: false, message: e.message }); }
};

const updateType = async (req, res) => {
    try {
        const type = await Type.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!type) return res.status(404).json({ success: false, message: 'Type not found' });
        res.status(200).json({ success: true, data: type });
    } catch (e) { res.status(400).json({ success: false, message: e.message }); }
};

const deleteType = async (req, res) => {
    try {
        const type = await Type.findByIdAndDelete(req.params.id);
        if (!type) return res.status(404).json({ success: false, message: 'Type not found' });
        res.status(200).json({ success: true, message: 'Type deleted' });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

module.exports = { getAllTypes, getTypeById, createType, updateType, deleteType };
