const mongoose = require('mongoose');

// One document for the whole shop: what the admin chose for the site itself.
// `season` is the occasion the home page is decorated for ('' = none) and `seasonUntil` its
// last day, as YYYY-MM-DD in Lebanon ('' = until the admin changes it).
const SEASONS = ['christmas', 'ramadan', 'fitr', 'easter', 'independence'];

const siteSettingSchema = new mongoose.Schema(
    {
        key: { type: String, default: 'site', unique: true },
        season: { type: String, enum: ['', ...SEASONS], default: '' },
        seasonUntil: { type: String, default: '', match: [/^(\d{4}-\d{2}-\d{2})?$/, 'Not a date'] },
    },
    { timestamps: true }
);

module.exports = mongoose.model('SiteSetting', siteSettingSchema);
module.exports.SEASONS = SEASONS;
