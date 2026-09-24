const Anthropic = require('@anthropic-ai/sdk');
const Type = require('../models/Type');
const Collection = require('../models/Collection');

const CLAUDE_MODEL = process.env.AI_MODEL || 'claude-sonnet-5';
// Free-tier Gemini models get "high demand" 503s at times, so fall through a list.
const GEMINI_MODELS = [process.env.GEMINI_MODEL, 'gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest']
    .filter((m, i, a) => m && a.indexOf(m) === i);
const MAX_IMAGES = 20;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// AI_PROVIDER=claude|gemini picks explicitly; otherwise use whichever key is set (Gemini first, it's free).
const getProvider = () => {
    const p = (process.env.AI_PROVIDER || '').toLowerCase();
    if (p === 'claude' || p === 'gemini') return p;
    if (process.env.GEMINI_API_KEY) return 'gemini';
    if (process.env.ANTHROPIC_API_KEY) return 'claude';
    return null;
};

let client = null;
const getClient = () => {
    if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return client;
};

const nullable = (type) => ({ type: [type, 'null'] });

// Everything the form can be pre-filled with. Unknown values come back as null.
const PRODUCT_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: [
        'title', 'description', 'color', 'capacity', 'weight', 'dimensions',
        'gender', 'supplierPrice', 'supplierCurrency',
        'typeId', 'collectionId', 'notes', 'images', 'mainImage',
    ],
    properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        color: { type: 'string' },
        capacity: nullable('string'),
        weight: nullable('number'),
        dimensions: {
            type: 'object',
            additionalProperties: false,
            required: ['height', 'width', 'depth'],
            properties: {
                height: nullable('number'),
                width: nullable('number'),
                depth: nullable('number'),
            },
        },
        gender: { type: 'string', enum: ["Men's", "Women's", 'Unisex', ''] },
        supplierPrice: nullable('number'),
        supplierCurrency: nullable('string'),
        typeId: nullable('string'),
        collectionId: nullable('string'),
        notes: { type: 'string' },
        // What each uploaded image is, by its 1-based number.
        images: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['number', 'kind'],
                properties: {
                    number: { type: 'integer' },
                    kind: { type: 'string', enum: ['screenshot', 'product', 'other'] },
                },
            },
        },
        mainImage: nullable('integer'),
    },
};

const LANGUAGES = { ar: 'Arabic', en: 'English' };

const buildPrompt = ({ language, text, types, collections }) => `
You help a Lebanese bag shop ("Trésor Bags") add products to its website.
The owner buys bags from a Chinese supplier on WeChat. You are given numbered images
(and maybe pasted text), all about ONE single bag. They are a mix of:
- "screenshot": a WeChat chat or Moments post screenshot (phone UI, text, thumbnail grids).
  Read the product details from these; details may be split across several, so merge them.
- "product": a real standalone photo of the bag itself (not a phone screenshot).
- "other": anything else (unrelated photos, blank, a different product).
Ignore unrelated chat messages (greetings, other products, payment talk).

Write "title" and "description" in ${LANGUAGES[language]}, translated from the supplier's
language (usually Chinese). Make them sound natural and appealing for shoppers:
- Base title/description on what the supplier's text says; use product photos only to
  confirm details like color and style. Never put a Type or Collection name in the title.
- title: short product name, max 80 characters, no prices.
- description: 2–4 short sentences about material, compartments, features, use. Max 1500 characters.
- color: the color(s) in ${LANGUAGES[language]}; if several are offered, join them with ", ".

Numbers:
- dimensions in centimetres (convert if needed). Chinese listings often write size as
  "长x高x宽" or "L×H×W"; map length→width, height→height, width/thickness→depth.
- weight in kilograms (convert grams/斤 if needed).
- capacity as a short string like "20L" if stated.
- supplierPrice / supplierCurrency: the price the supplier quotes and its currency
  code (CNY for 元/¥/RMB, USD for $). This is a purchase cost, not the shop's price.

Classification (pick an id from these lists only, or null if nothing fits):
Types: ${JSON.stringify(types)}
Collections: ${JSON.stringify(collections)}
gender: "Men's", "Women's", "Unisex", or "" if unclear.

Images: classify every image number in "images". "mainImage" is the number of the best
"product" photo to show first on the website (whole bag visible, front view, clean
background), or null if there are no product photos. Never classify a phone screenshot
as "product", even if it shows the bag.

Use null for anything not present. Never invent measurements.
"notes": one short line in ${LANGUAGES[language]} telling the owner what is missing
or uncertain (empty string if everything is clear).
${text ? `\nPasted text from the chat:\n"""\n${text}\n"""` : ''}
`.trim();

// Accepts "data:image/png;base64,...." strings.
const parseDataUrl = (dataUrl) => {
    const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
    if (!m || !IMAGE_TYPES.includes(m[1])) return null;
    return { mediaType: m[1], data: m[2] };
};

const askClaude = async (images, prompt) => {
    const response = await getClient().messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 2000,
        output_config: { format: { type: 'json_schema', schema: PRODUCT_SCHEMA } },
        messages: [{
            role: 'user',
            content: [
                ...images.flatMap((i, n) => [
                    { type: 'text', text: `Image ${n + 1}:` },
                    { type: 'image', source: { type: 'base64', media_type: i.mediaType, data: i.data } },
                ]),
                { type: 'text', text: prompt },
            ],
        }],
    });
    return JSON.parse(response.content.find(b => b.type === 'text').text);
};

const askGemini = async (images, prompt) => {
    const body = JSON.stringify({
        contents: [{
            parts: [
                ...images.flatMap((i, n) => [
                    { text: `Image ${n + 1}:` },
                    { inline_data: { mime_type: i.mediaType, data: i.data } },
                ]),
                { text: prompt },
            ],
        }],
        generationConfig: { responseMimeType: 'application/json', responseJsonSchema: PRODUCT_SCHEMA },
    });
    let lastError;
    // Two passes over the model list, with a short pause, to ride out "high demand" spikes.
    const attempts = [...GEMINI_MODELS, ...GEMINI_MODELS];
    for (const [i, model] of attempts.entries()) {
        if (i === GEMINI_MODELS.length) await new Promise(r => setTimeout(r, 2000));
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
            body,
        });
        const json = await r.json().catch(() => ({}));
        if (r.ok) {
            const text = json.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('');
            if (text) return JSON.parse(text);
            lastError = Object.assign(new Error(`Gemini ${model}: empty response`), { status: 500 });
            continue;
        }
        lastError = Object.assign(new Error(`Gemini ${model}: ${json.error?.message || r.status}`), { status: r.status });
        console.warn(lastError.message);
        // Busy / quota / retired model: try the next one. Anything else (bad key, bad request) won't get better.
        if (![404, 429, 500, 503].includes(r.status)) break;
    }
    throw lastError;
};

const parseProduct = async (req, res) => {
    try {
        const provider = getProvider();
        if (!provider) {
            return res.status(503).json({ success: false, message: 'AI is not configured on the server (set GEMINI_API_KEY or ANTHROPIC_API_KEY)' });
        }

        const { images = [], text = '', language = 'ar' } = req.body || {};
        if (!Array.isArray(images) || images.length > MAX_IMAGES) {
            return res.status(400).json({ success: false, message: `Send at most ${MAX_IMAGES} screenshots` });
        }
        const imageBlocks = images.map(parseDataUrl);
        if (imageBlocks.some(b => !b)) {
            return res.status(400).json({ success: false, message: 'Screenshots must be JPEG, PNG, WebP or GIF images' });
        }
        const cleanText = String(text).slice(0, 8000).trim();
        if (!imageBlocks.length && !cleanText) {
            return res.status(400).json({ success: false, message: 'Add at least one screenshot or some text' });
        }

        const [types, collections] = await Promise.all([
            Type.find({}, 'title category').lean(),
            Collection.find({}, 'title').lean(),
        ]);
        const typeList = types.map(t => ({ id: String(t._id), title: t.title, category: t.category }));
        const collectionList = collections.map(c => ({ id: String(c._id), title: c.title }));

        const prompt = buildPrompt({
            language: LANGUAGES[language] ? language : 'ar',
            text: cleanText,
            types: typeList,
            collections: collectionList,
        });
        const data = provider === 'gemini'
            ? await askGemini(imageBlocks, prompt)
            : await askClaude(imageBlocks, prompt);

        // Keep only valid image numbers; main image must be one of the product photos.
        const count = imageBlocks.length;
        data.images = (data.images || []).filter(i => Number.isInteger(i.number) && i.number >= 1 && i.number <= count);
        const products = data.images.filter(i => i.kind === 'product').map(i => i.number);
        if (!products.includes(data.mainImage)) data.mainImage = products[0] ?? null;

        // Drop ids the model may have made up.
        if (!typeList.some(t => t.id === data.typeId)) data.typeId = null;
        if (!collectionList.some(c => c.id === data.collectionId)) data.collectionId = null;

        res.status(200).json({ success: true, data });
    } catch (e) {
        console.error('AI parse-product failed:', e.message);
        const busy = [429, 503].includes(e.status);
        res.status(busy ? 503 : 500).json({
            success: false,
            message: busy
                ? 'The AI is busy right now, please try again in a minute'
                : 'AI could not read the images, please try again',
        });
    }
};

module.exports = { parseProduct };
