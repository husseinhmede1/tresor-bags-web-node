/**
 * One-time backfill: give every bag a valid productCategory.
 *
 * Any bag whose productCategory is missing, null, empty, or not one of the
 * four valid values gets set to a default (so it shows up under the storefront
 * category filter and passes the now-required model validation on future edits).
 *
 * Safe to run repeatedly (idempotent): it only touches bags that need it.
 *
 * Usage (run where MongoDB Atlas is reachable — e.g. Render Shell or a
 * whitelisted machine; MONGO_URI must be set in the environment):
 *
 *     node src/scripts/backfillProductCategory.js            # defaults to "Bags"
 *     node src/scripts/backfillProductCategory.js Accessories # choose the default
 */
const mongoose = require('mongoose');

const VALID = ['Luggage', 'Backpacks', 'Bags', 'Accessories'];

(async () => {
    const uri = process.env.MONGO_URI;
    if (!uri) {
        console.error('MONGO_URI is not set. Aborting.');
        process.exit(1);
    }

    const fallback = process.argv[2] || 'Bags';
    if (!VALID.includes(fallback)) {
        console.error(`Default "${fallback}" is not one of: ${VALID.join(', ')}`);
        process.exit(1);
    }

    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    const bags = mongoose.connection.collection('bags');

    const needsFix = { productCategory: { $nin: VALID } };
    const before = await bags.countDocuments(needsFix);
    console.log(`Bags with missing/invalid productCategory: ${before}`);

    if (before > 0) {
        const res = await bags.updateMany(needsFix, { $set: { productCategory: fallback } });
        console.log(`Updated ${res.modifiedCount} bag(s) to "${fallback}".`);
    } else {
        console.log('Nothing to backfill.');
    }

    await mongoose.disconnect();
    console.log('Done.');
})().catch((e) => {
    console.error('Backfill failed:', e.message);
    process.exit(1);
});
