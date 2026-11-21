const SiteSetting = require('../models/SiteSetting');

// Today's date in Lebanon, as YYYY-MM-DD: an occasion ends with its last day there.
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Beirut' }).format(new Date());

// The setting is read on every visit to the shop, so it is kept in memory: the database is
// asked once a minute at most, and straight away after the admin saves.
const KEEP_MS = 60 * 1000;
let kept = null;        // { season, seasonUntil }
let keptAt = 0;
const load = async () => {
    if (!kept || Date.now() - keptAt > KEEP_MS) {
        const doc = await SiteSetting.findOne({ key: 'site' }).lean();
        kept = { season: doc?.season || '', seasonUntil: doc?.seasonUntil || '' };
        keptAt = Date.now();
    }
    return kept;
};

// What the shop's pages are told: the occasion in force today, or null. Never throws: the
// shop must load even if this can't be read.
const currentSeason = async () => {
    try {
        const { season, seasonUntil } = await load();
        if (!season || (seasonUntil && seasonUntil < today())) return null;
        return { name: season, until: seasonUntil || null };
    } catch (e) {
        console.warn('Could not read the site setting:', e.message);
        return null;
    }
};

// GET /api/settings  (admin)
const getSettings = async (req, res) => {
    try {
        keptAt = 0;
        const s = await load();
        res.json({ success: true, data: { ...s, ended: Boolean(s.season && s.seasonUntil && s.seasonUntil < today()) } });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

// PUT /api/settings  { season, seasonUntil }  (admin)
const updateSettings = async (req, res) => {
    try {
        const season = String(req.body.season || '');
        const seasonUntil = season ? String(req.body.seasonUntil || '') : '';
        if (season && !SiteSetting.SEASONS.includes(season)) {
            return res.status(400).json({ success: false, message: 'Unknown occasion' });
        }
        if (seasonUntil && (!/^\d{4}-\d{2}-\d{2}$/.test(seasonUntil) || Number.isNaN(Date.parse(seasonUntil)))) {
            return res.status(400).json({ success: false, message: 'The last day is not a valid date' });
        }
        if (seasonUntil && seasonUntil < today()) {
            return res.status(400).json({ success: false, message: 'The last day is already past' });
        }
        await SiteSetting.findOneAndUpdate({ key: 'site' }, { season, seasonUntil }, { upsert: true, runValidators: true, setDefaultsOnInsert: true });
        kept = { season, seasonUntil };
        keptAt = Date.now();
        res.json({ success: true, data: { season, seasonUntil, ended: false } });
    } catch (e) {
        res.status(400).json({ success: false, message: e.message });
    }
};

module.exports = { currentSeason, getSettings, updateSettings };
