const express = require('express');
const router = express.Router();
const Bag = require('../models/Bag');

// GET /sitemap.xml: every public page, so search engines find each bag.
// Served at tresorbags.com/sitemap.xml through a Vercel rewrite.
const SITE = 'https://tresorbags.com';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

router.get('/sitemap.xml', async (req, res) => {
    try {
        const bags = await Bag.find({}).select('_id updatedAt').sort({ updatedAt: -1 }).lean();
        const urls = [
            { loc: `${SITE}/`, lastmod: bags[0]?.updatedAt },
            { loc: `${SITE}/privacy` },
            ...bags.map(b => ({ loc: `${SITE}/gallery/${b._id}`, lastmod: b.updatedAt })),
        ];
        const xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
            + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            + urls.map(u => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString().slice(0, 10)}</lastmod>` : ''}</url>`).join('\n')
            + '\n</urlset>\n';
        res.set('Cache-Control', 'public, max-age=3600').type('application/xml').send(xml);
    } catch (e) {
        res.status(500).type('text/plain').send('Sitemap unavailable');
    }
});

module.exports = router;
