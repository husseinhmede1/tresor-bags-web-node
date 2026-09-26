const crypto = require('crypto');
const Bag = require('../models/Bag');

// Search fingerprints (embeddings) for the shop assistant, so it scales past what fits in
// one AI prompt. gemini-embedding-2 puts photos and text in the same space: each bag gets
// a vector of its main photo and one of its text; a customer's photo or question is
// embedded the same way and compared against all bags in memory.

const MODEL = process.env.EMBED_MODEL || 'gemini-embedding-2';
const DIMS = 256;
const THUMB = 384;
const PACE_MS = 800;                 // between embedding calls, to stay inside the free quota
const RETRY_AFTER_QUOTA_MS = 10 * 60 * 1000;

const isEnabled = () => Boolean(process.env.GEMINI_API_KEY);

const embed = async (parts) => {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({ content: { parts }, outputDimensionality: DIMS }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(`Embedding: ${json.error?.message || r.status}`), { status: r.status });
    return json.embedding.values;
};

const imagePart = (mediaType, data) => ({ inline_data: { mime_type: mediaType, data } });

// Main photo as a small JPEG part: resized by ImageKit, or taken from a leftover data URL.
const bagPhotoPart = async (src) => {
    if (typeof src !== 'string') return null;
    const m = /^data:([^;]+);base64,(.+)$/.exec(src);
    if (m) return imagePart(m[1], m[2]);
    if (!src.startsWith('https://')) return null;
    const url = src.startsWith('https://ik.imagekit.io/') ? `${src}?tr=w-${THUMB},f-jpg` : src;
    const r = await fetch(url);
    if (!r.ok) return null;
    return imagePart(r.headers.get('content-type') || 'image/jpeg', Buffer.from(await r.arrayBuffer()).toString('base64'));
};

const bagText = (b) => [
    b.title,
    b.typeId?.title && `Type: ${b.typeId.title} (${b.typeId.category})`,
    b.collectionId?.title && `Collection: ${b.collectionId.title}`,
    b.color && `Color: ${b.color}`,
    b.gender && `For: ${b.gender}`,
    b.capacity && `Capacity: ${b.capacity}`,
    b.description,
].filter(Boolean).join('\n');

// Changes whenever anything the fingerprints are built from changes.
const indexKey = (b) => crypto.createHash('sha1')
    .update([MODEL, DIMS, b.mainImage, bagText(b)].join('|'))
    .digest('hex');

// ---- In-memory vectors ------------------------------------------------------------
let vectors = null;            // Map<bagId, { img: Float32Array|null, txt: Float32Array|null }>

const toVec = (a) => (a && a.length ? Float32Array.from(a) : null);

const loadVectors = async () => {
    if (vectors) return vectors;
    const rows = await Bag.find({ 'aiIndex.key': { $exists: true } }).select('+aiIndex').lean();
    vectors = new Map(rows.map(r => [String(r._id), { img: toVec(r.aiIndex.img), txt: toVec(r.aiIndex.txt) }]));
    return vectors;
};

const cosine = (a, b) => {
    let d = 0, x = 0, y = 0;
    for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; }
    return d / Math.sqrt(x * y || 1);
};

// ---- Indexing queue ---------------------------------------------------------------
const queue = new Set();
let running = false;

const indexOne = async (id) => {
    const b = await Bag.findById(id)
        .select('+aiIndex title description color gender capacity mainImage typeId collectionId')
        .populate('typeId', 'title category')
        .populate('collectionId', 'title')
        .lean();
    if (!b) { vectors?.delete(String(id)); return; }
    const key = indexKey(b);
    if (b.aiIndex?.key === key) return;

    const photo = await bagPhotoPart(b.mainImage).catch(() => null);
    const img = photo ? await embed([photo]) : [];
    await new Promise(r => setTimeout(r, PACE_MS));
    const txt = await embed([{ text: bagText(b) }]);

    await Bag.updateOne({ _id: b._id }, { $set: { aiIndex: { key, img, txt, at: new Date() } } });
    vectors?.set(String(b._id), { img: toVec(img), txt: toVec(txt) });
};

const run = async () => {
    if (running) return;
    running = true;
    let done = 0;
    try {
        while (queue.size) {
            const id = queue.values().next().value;
            try {
                await indexOne(id);
                queue.delete(id);
                done++;
            } catch (e) {
                if (e.status === 429) {
                    console.warn(`Catalog index: free quota reached, resuming in 10 min (${queue.size} left)`);
                    setTimeout(run, RETRY_AFTER_QUOTA_MS);
                    return;
                }
                console.warn(`Catalog index: bag ${id} skipped:`, e.message);
                queue.delete(id);
            }
            await new Promise(r => setTimeout(r, PACE_MS));
        }
        if (done) console.log(`Catalog index: ${done} bags indexed for the shop assistant`);
    } finally {
        running = false;
    }
};

// Queue one bag (after create/update) or, with no id, every bag whose fingerprints are
// missing or stale (on startup).
const reindex = async (id) => {
    if (!isEnabled()) return;
    if (id) {
        queue.add(String(id));
    } else {
        const bags = await Bag.find({})
            .select('+aiIndex title description color gender capacity mainImage typeId collectionId')
            .populate('typeId', 'title category')
            .populate('collectionId', 'title')
            .lean();
        bags.filter(b => b.aiIndex?.key !== indexKey(b)).forEach(b => queue.add(String(b._id)));
    }
    run().catch(e => console.warn('Catalog index stopped:', e.message));
};

const forget = (id) => { vectors?.delete(String(id)); queue.delete(String(id)); };

// ---- Search -----------------------------------------------------------------------
// Returns bag ids ranked by similarity, or null when the index can't be used.
const searchByPhoto = async ({ mediaType, data }, limit) => {
    const vecs = await loadVectors();
    if (!vecs.size) return null;
    const q = await embed([imagePart(mediaType, data)]);
    return [...vecs]
        .filter(([, v]) => v.img)
        .map(([id, v]) => [id, cosine(q, v.img)])
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([id]) => id);
};

const searchByText = async (text, limit) => {
    const vecs = await loadVectors();
    if (!vecs.size) return null;
    const q = await embed([{ text }]);
    // Mostly the text, a little of the photo (helps with colors and looks).
    return [...vecs]
        .map(([id, v]) => [id, (v.txt ? 0.75 * cosine(q, v.txt) : 0) + (v.img ? 0.25 * cosine(q, v.img) : 0)])
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([id]) => id);
};

module.exports = { isEnabled, reindex, forget, searchByPhoto, searchByText, bagPhotoPart };
