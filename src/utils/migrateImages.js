const mongoose = require('mongoose');
const Bag = require('../models/Bag');
const Collection = require('../models/Collection');
const Order = require('../models/Order');
const { isConfigured, storeAll } = require('./imageStore');

// Moves any base64 images still stored in MongoDB to ImageKit and keeps only the URLs.
// Runs on every start but only touches documents that still hold "data:" images,
// so it is safe to interrupt (Render restarts) and simply resumes next time.
const DATA = /^data:/;

// Keep the original base64 in "image_backups" before replacing it, in case anything goes wrong.
// Once the site looks right, that collection can be dropped from Atlas.
const backup = (model, doc) =>
    mongoose.connection.collection('image_backups').insertOne({ model, docId: doc._id, doc, at: new Date() });

const migrateImages = async () => {
    if (!isConfigured()) return;
    const cache = new Map(); // same picture (e.g. a bag's main image copied into orders) -> one upload
    let moved = 0;

    for await (const bag of Bag.find({ $or: [{ mainImage: DATA }, { sideImages: DATA }] }).select('mainImage sideImages').lean().cursor()) {
        await backup('Bag', bag);
        const folder = `/bags/${bag._id}`;
        const [mainImage] = await storeAll([bag.mainImage], folder, 'main', cache);
        const sideImages = await storeAll(bag.sideImages || [], folder, 'side', cache);
        // Only write if nobody edited the bag meanwhile.
        await Bag.updateOne({ _id: bag._id, mainImage: bag.mainImage, sideImages: bag.sideImages }, { $set: { mainImage, sideImages } });
        moved++;
    }

    for await (const c of Collection.find({ logo: DATA }).select('logo').lean().cursor()) {
        await backup('Collection', c);
        const [logo] = await storeAll([c.logo], `/collections/${c._id}`, 'logo', cache);
        await Collection.updateOne({ _id: c._id, logo: c.logo }, { $set: { logo } });
        moved++;
    }

    for await (const o of Order.find({ 'items.mainImage': DATA }).select('items').lean().cursor()) {
        await backup('Order', o);
        const urls = await storeAll(o.items.map(i => i.mainImage), `/orders/${o._id}`, 'item', cache);
        const $set = {};
        urls.forEach((u, i) => { if (u !== o.items[i].mainImage) $set[`items.${i}.mainImage`] = u; });
        await Order.updateOne({ _id: o._id }, { $set });
        moved++;
    }

    if (moved) console.log(`Image migration: moved images of ${moved} documents to ImageKit`);
};

module.exports = () => migrateImages().catch(e => console.error('Image migration stopped:', e.message));
