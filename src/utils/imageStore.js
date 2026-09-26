const crypto = require('crypto');

// Images live on ImageKit; MongoDB only keeps their URLs.
// Without the IMAGEKIT_* env vars everything is a no-op and base64 is stored as before.
const UPLOAD_URL = 'https://upload.imagekit.io/api/v1/files/upload';
const API_URL = 'https://api.imagekit.io/v1';

const endpoint = () => (process.env.IMAGEKIT_URL_ENDPOINT || '').replace(/\/+$/, '');
const isConfigured = () => Boolean(process.env.IMAGEKIT_PRIVATE_KEY && endpoint());
const authHeader = () => 'Basic ' + Buffer.from(`${process.env.IMAGEKIT_PRIVATE_KEY}:`).toString('base64');

const isDataUrl = (s) => typeof s === 'string' && s.startsWith('data:');
const isOurs = (s) => typeof s === 'string' && isConfigured() && s.startsWith(endpoint() + '/');

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' };

// Upload one "data:image/...;base64,..." string into `folder`, return its public URL.
const uploadDataUrl = async (dataUrl, folder, name = 'image') => {
    const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl);
    if (!m) throw new Error('Invalid image data');
    const buffer = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]));
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: m[1] }), `${name}.${EXT[m[1]] || 'jpg'}`);
    form.append('fileName', `${name}.${EXT[m[1]] || 'jpg'}`);
    form.append('folder', folder);
    form.append('useUniqueFileName', 'true');

    const r = await fetch(UPLOAD_URL, { method: 'POST', headers: { Authorization: authHeader() }, body: form });
    const json = await r.json().catch(() => ({}));
    if (!r.ok || !json.url) throw new Error(`Image upload failed: ${json.message || r.status}`);
    return json.url;
};

// Replace every data URL in `values` with an uploaded URL; other values pass through.
// `cache` (hash -> url) avoids uploading the same picture twice.
const storeAll = async (values, folder, name, cache = new Map()) => {
    const out = [];
    for (const [i, v] of values.entries()) {
        if (!isConfigured() || !isDataUrl(v)) { out.push(v); continue; }
        const key = crypto.createHash('sha1').update(v).digest('hex');
        if (!cache.has(key)) cache.set(key, await uploadDataUrl(v, folder, `${name}-${i + 1}`));
        out.push(cache.get(key));
    }
    return out;
};

// Upload a bag's new images (in place on `body`) into /bags/<id>.
const storeBagImages = async (body, bagId) => {
    if (!isConfigured()) return;
    const folder = `/bags/${bagId}`;
    const cache = new Map();
    if (isDataUrl(body.mainImage)) [body.mainImage] = await storeAll([body.mainImage], folder, 'main', cache);
    if (Array.isArray(body.sideImages)) body.sideImages = await storeAll(body.sideImages, folder, 'side', cache);
};

// Best-effort delete of our files in `folder` by URL. Errors are logged, never thrown,
// so a hiccup at ImageKit never blocks saving or deleting a product.
const deleteUrls = async (urls, folder) => {
    const wanted = new Set(urls.filter(isOurs).map(u => u.split('?')[0]));
    if (!wanted.size) return;
    try {
        const r = await fetch(`${API_URL}/files/?path=${encodeURIComponent(folder)}&limit=1000`, {
            headers: { Authorization: authHeader() },
        });
        const files = await r.json();
        if (!r.ok) throw new Error(files.message || r.status);
        const fileIds = files.filter(f => wanted.has(f.url)).map(f => f.fileId);
        if (!fileIds.length) return;
        const d = await fetch(`${API_URL}/files/batch/deleteByFileIds`, {
            method: 'POST',
            headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileIds }),
        });
        if (!d.ok) throw new Error((await d.json().catch(() => ({}))).message || d.status);
    } catch (e) {
        console.warn(`ImageKit cleanup in ${folder} failed:`, e.message);
    }
};

module.exports = { isConfigured, isDataUrl, isOurs, uploadDataUrl, storeAll, storeBagImages, deleteUrls };
