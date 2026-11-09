const StoreInfo = require('../models/StoreInfo');
const UnansweredQuestion = require('../models/UnansweredQuestion');
const storeInfo = require('../utils/storeInfo');

// Admin "Info" page: the facts the assistant answers from, and the questions it could not answer.

const pick = (body) => {
    const out = {};
    for (const k of ['title', 'answer', 'category', 'active']) if (body?.[k] !== undefined) out[k] = body[k];
    return out;
};

const listInfo = async (req, res) => {
    try {
        const data = await StoreInfo.find({}).sort({ category: 1, createdAt: 1 }).lean();
        res.json({ success: true, data });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

const createInfo = async (req, res) => {
    try {
        const info = await StoreInfo.create(pick(req.body));
        storeInfo.invalidate();
        // Answering from the "unanswered" list closes that question.
        if (req.body?.questionId) {
            await UnansweredQuestion.findByIdAndUpdate(req.body.questionId, { status: 'answered' }).catch(() => {});
        }
        res.status(201).json({ success: true, data: info });
    } catch (e) { res.status(400).json({ success: false, message: e.message }); }
};

const updateInfo = async (req, res) => {
    try {
        const info = await StoreInfo.findByIdAndUpdate(req.params.id, pick(req.body), { new: true, runValidators: true });
        if (!info) return res.status(404).json({ success: false, message: 'Entry not found' });
        storeInfo.invalidate();
        res.json({ success: true, data: info });
    } catch (e) { res.status(400).json({ success: false, message: e.message }); }
};

const deleteInfo = async (req, res) => {
    try {
        const info = await StoreInfo.findByIdAndDelete(req.params.id);
        if (!info) return res.status(404).json({ success: false, message: 'Entry not found' });
        storeInfo.invalidate();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

const listUnanswered = async (req, res) => {
    try {
        const status = ['open', 'answered', 'ignored'].includes(req.query.status) ? req.query.status : 'open';
        const data = await UnansweredQuestion.find({ status })
            .select('text count lastAskedAt status')
            .sort({ count: -1, lastAskedAt: -1 })
            .limit(200)
            .lean();
        res.json({ success: true, data });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

const updateUnanswered = async (req, res) => {
    try {
        const status = req.body?.status;
        if (!['open', 'answered', 'ignored'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }
        const q = await UnansweredQuestion.findByIdAndUpdate(req.params.id, { status }, { new: true });
        if (!q) return res.status(404).json({ success: false, message: 'Question not found' });
        res.json({ success: true, data: q });
    } catch (e) { res.status(400).json({ success: false, message: e.message }); }
};

module.exports = { listInfo, createInfo, updateInfo, deleteInfo, listUnanswered, updateUnanswered };
