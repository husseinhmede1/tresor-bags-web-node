const Bag = require('../models/Bag');
const Collection = require('../models/Collection');
const Order = require('../models/Order');
const { isConfigured, storeAll } = require('./imageStore');

// Moves any base64 images still stored in MongoDB to ImageKit and keeps only the URLs.
// Runs on every start but only touches documents that still hold "data:" images,
// so it is safe to interrupt (Render restarts) and simply resumes next time.
const DATA = /^data:/;

const migrateImages = async () => {
    if (!isConfigured()) return;
    const cache = new Map(); // same picture (e.g. a bag's main image copied into orders) -> one upload
    let moved = 0;

    for await (const bag of Bag.find({ $or: [{ mainImage: DATA }, { sideImages: DATA }] }).select('mainImage sideImages').lean().cursor()) {
        const folder = `/bags/${bag._id}`;
        const [mainImage] = await storeAll([bag.mainImage], folder, 'main', cache);
        const sideImages = await storeAll(bag.sideImages || [], folder, 'side', cache);
        // Only write if nobody edited the bag meanwhile.
        await Bag.updateOne({ _id: bag._id, mainImage: bag.mainImage, sideImages: bag.sideImages }, { $set: { mainImage, sideImages } });
        moved++;
    }

    for await (const c of Collection.find({ logo: DATA }).select('logo').lean().cursor()) {
        const [logo] = await storeAll([c.logo], `/collections/${c._id}`, 'logo', cache);
        await Collection.updateOne({ _id: c._id, logo: c.logo }, { $set: { logo } });
        moved++;
    }

    for await (const o of Order.find({ 'items.mainImage': DATA }).select('items').lean().cursor()) {
        const urls = await storeAll(o.items.map(i => i.mainImage), `/orders/${o._id}`, 'item', cache);
        const $set = {};
        urls.forEach((u, i) => { if (u !== o.items[i].mainImage) $set[`items.${i}.mainImage`] = u; });
        await Order.updateOne({ _id: o._id }, { $set });
        moved++;
    }

    if (moved) console.log(`Image migration: moved images of ${moved} documents to ImageKit`);
};

module.exports = () => migrateImages().catch(e => console.error('Image migration stopped:', e.message));
