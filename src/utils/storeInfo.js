const mongoose = require('mongoose');
const StoreInfo = require('../models/StoreInfo');
const UnansweredQuestion = require('../models/UnansweredQuestion');

// Store facts for the shop assistant, cached in memory and rebuilt after every admin edit.

const MAX_ENTRIES = 80;      // keeps the assistant prompt (and its cost) small
const MAX_CHARS = 8000;
const MAX_OPEN_QUESTIONS = 500;

const LABELS = { delivery: 'Delivery', payment: 'Payment', returns: 'Returns and exchanges', store: 'The shop', general: 'General' };

// What the assistant knew before this page existed; becomes editable entries on first start.
const DEFAULTS = [
    { category: 'store', title: 'About the shop', answer: 'Trésor Bags (Trésor Outlet Store) is an online shop in Lebanon for premium bags, backpacks, luggage and accessories. Website: tresorbags.com. Prices are in US dollars. Some product types have a discount; the catalog shows the final price.' },
    { category: 'general', title: 'How to order', answer: 'Add bags to the cart, enter the delivery details and pin the location on the map, then pay by Whish transfer and press "Confirm Order". The order is sent to the shop on WhatsApp, and the shop confirms it and arranges delivery.' },
    { category: 'payment', title: 'Payment methods', answer: 'Payment is by Whish transfer to +961 78 987 288.' },
    { category: 'delivery', title: 'Delivery area', answer: 'Delivery is inside Lebanon.' },
    { category: 'store', title: 'Contact', answer: 'WhatsApp +961 78 987 288. Instagram: @tre.sor_lb.' },
];

let cached = null;

// Seed once, so deleting every entry later does not bring the defaults back.
const seed = async () => {
    const flags = mongoose.connection.collection('app_flags');
    const res = await flags.updateOne({ _id: 'storeInfoSeeded' }, { $setOnInsert: { at: new Date() } }, { upsert: true });
    if (res.upsertedCount && !(await StoreInfo.estimatedDocumentCount())) await StoreInfo.insertMany(DEFAULTS);
};

const getText = async () => {
    if (cached !== null) return cached;
    const entries = await StoreInfo.find({ active: true }).sort({ category: 1, createdAt: 1 }).limit(MAX_ENTRIES).lean();
    let text = '';
    for (const e of entries) {
        const line = `- [${LABELS[e.category] || 'General'}] ${e.title}: ${e.answer.replace(/\s+/g, ' ')}\n`;
        if (text.length + line.length > MAX_CHARS) break;
        text += line;
    }
    cached = text.trim();
    return cached;
};

const invalidate = () => { cached = null; };

// Same question, different spelling: lowercase, no punctuation, Arabic letter variants unified.
const normalize = (s) => String(s).toLowerCase()
    .replace(/[ً-ٟـ]/g, '')            // harakat, tatweel
    .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .slice(0, 200);

const logUnanswered = async (question) => {
    const text = String(question || '').trim().slice(0, 300);
    const key = normalize(text);
    if (key.length < 3) return;
    const existing = await UnansweredQuestion.findOne({ key });
    if (existing) {
        existing.count += 1;
        existing.lastAskedAt = new Date();
        if (existing.status === 'answered') existing.status = 'open'; // the answer did not cover it
        await existing.save();
        return;
    }
    if (await UnansweredQuestion.countDocuments({ status: 'open' }) >= MAX_OPEN_QUESTIONS) return;
    await UnansweredQuestion.create({ text, key }).catch(e => { if (e.code !== 11000) throw e; });
};

module.exports = { seed, getText, invalidate, logUnanswered };
