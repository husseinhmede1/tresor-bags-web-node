// Link previews for one bag. Telegram, WhatsApp and similar apps read a page's <meta> tags
// without running JavaScript, so the site's own pages all look the same to them (the general
// Trésor card). Vercel sends those preview robots here instead (see vercel.json in the
// frontend), and this answers with a tiny page that carries the bag's own photo, name and price.
// Normal visitors never reach this route.
const express = require('express');
const mongoose = require('mongoose');
const Bag = require('../models/Bag');

const router = express.Router();
const SITE = 'https://tresorbags.com';
const FALLBACK_IMAGE = `${SITE}/og-image.jpg`;

const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (n) => `$${Number(n).toLocaleString('en-US', Number.isInteger(Number(n)) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// A JPEG of a sensible size: some preview robots don't read WebP, and none need the full photo.
const previewImage = (src) => {
    if (!/^https:\/\//.test(src || '')) return FALLBACK_IMAGE;
    return /^https:\/\/ik\.imagekit\.io\//.test(src) ? `${src.split('?')[0]}?tr=w-1200,f-jpg` : src;
};

const page = ({ title, description, image, url }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:site_name" content="Trésor Bags">
<meta property="og:type" content="product">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(image)}">
<meta name="twitter:card" content="summary_large_image">
</head>
<body>
<h1>${esc(title)}</h1>
<p>${esc(description)}</p>
<p><a href="${SITE}/">Trésor Bags</a></p>
</body>
</html>`;

const general = (url) => page({
    title: 'Trésor Bags | Premium Bags, Backpacks and Luggage in Lebanon',
    description: 'Shop premium backpacks, luggage, bags and accessories in Lebanon. Order online, pay with Whish and get it delivered.',
    image: FALLBACK_IMAGE,
    url,
});

// GET /share/:id
router.get('/:id', async (req, res) => {
    const url = `${SITE}/gallery/${encodeURIComponent(req.params.id)}`;
    res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' });
    try {
        const bag = mongoose.isValidObjectId(req.params.id)
            ? await Bag.findById(req.params.id).select('title description price stock mainImage typeId').populate('typeId', 'discount').lean()
            : null;
        // An unknown bag still gets a valid preview (the shop's), never an error page.
        if (!bag) return res.send(general(`${SITE}/`));

        const discount = bag.typeId?.discount || 0;
        const price = Math.round(bag.price * (1 - discount / 100) * 100) / 100;
        const note = bag.stock > 0 ? (discount > 0 ? ` (${discount}% off)` : '') : ' (pre-order)';
        const text = String(bag.description || '').replace(/\s+/g, ' ').trim();
        res.send(page({
            title: `${bag.title} · ${money(price)}${note}`,
            description: text.length > 180 ? `${text.slice(0, 177)}...` : text || 'Available at Trésor Bags, delivered across Lebanon.',
            image: previewImage(bag.mainImage),
            url,
        }));
    } catch (e) {
        console.warn('Share preview failed:', e.message);
        res.send(general(url));
    }
});

module.exports = router;
