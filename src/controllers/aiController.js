const Anthropic = require('@anthropic-ai/sdk');
const Type = require('../models/Type');
const Collection = require('../models/Collection');

const CLAUDE_MODEL = process.env.AI_MODEL || 'claude-opus-5-5';
// How hard Claude thinks before filling the form: "low" is faster, "high" more careful.
const CLAUDE_EFFORT = ['low', 'medium', 'high'].includes(process.env.AI_EFFORT) ? process.env.AI_EFFORT : 'medium';
// The customers' shop assistant: many short questions, answered fast and cheaply.
const ASK_MODEL = process.env.AI_ASK_MODEL || 'claude-haiku-5-5';
// Free-tier Gemini models get "high demand" 503s at times, so fall through a list.
const GEMINI_MODELS = [process.env.GEMINI_MODEL, 'gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest']
    .filter((m, i, a) => m && a.indexOf(m) === i);
const MAX_IMAGES = 20;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// Is any AI configured? AI_PROVIDER=claude|gemini picks explicitly; otherwise whichever key is set.
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
                required: ['number', 'kind', 'plainBackground'],
                properties: {
                    number: { type: 'integer' },
                    kind: { type: 'string', enum: ['screenshot', 'product', 'detail', 'other'] },
                    // A simple supplier-style shot the shop can clean up automatically.
                    plainBackground: { type: 'boolean' },
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
- "product": a real photo of the WHOLE bag standing on its own (any angle, front, side,
  back, top), nothing cut off, not held or worn. These may get their background replaced.
- "detail": a real photo of this bag that is not "product": a close-up, the inside or a
  pocket, a strap or logo detail, or the bag held in a hand or worn.
- "other": anything else (unrelated photos, blank, a different product).
For every image also set "plainBackground": true only for a "product" photo taken on a plain,
simple background (a plain wall, floor or table, like a supplier's studio shot) with no other
objects, people or scenery and no strong shadows; false for everything else (outdoor or room
scenes, advertising photos, photos with people or props, screenshots, details).
Ignore unrelated chat messages (greetings, other products, payment talk).
A screenshot of WeChat Moments often shows several posts (other bags, shoes...). Use only
the post that matches the product photos (same bag, color, model number); ignore the rest.

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

Use null for anything not present. Never invent measurements, weight, capacity or prices:
only use numbers the supplier wrote. If the supplier gives a model or style number
(e.g. 63020618), mention it in "notes".
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

// `images` are { mediaType, data, label? }; each is introduced by its label (default "Image N:").
// The reply is parsed as JSON matching `schema`.
// Thinking counts toward max_tokens, so leave room beyond the JSON itself.
// With `fallbacks`, if the model declines (rare) the server retries on another Claude model.
const askClaude = async (images, prompt, schema = PRODUCT_SCHEMA,
    { model = CLAUDE_MODEL, effort = CLAUDE_EFFORT, fallbacks = true, maxTokens = 16000 } = {}) => {
    const create = fallbacks
        ? (params) => getClient().beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
        : (params) => getClient().messages.create(params);
    const response = await create({
        model,
        max_tokens: maxTokens,
        output_config: { effort, format: { type: 'json_schema', schema } },
        messages: [{
            role: 'user',
            content: [
                ...images.flatMap((i, n) => [
                    { type: 'text', text: i.label || `Image ${n + 1}:` },
                    { type: 'image', source: { type: 'base64', media_type: i.mediaType, data: i.data } },
                ]),
                { type: 'text', text: prompt },
            ],
        }],
    });
    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
        throw Object.assign(new Error(`Claude stopped: ${response.stop_reason}`), { status: 500 });
    }
    const text = response.content.find(b => b.type === 'text')?.text;
    if (!text) throw Object.assign(new Error('Claude: empty response'), { status: 500 });
    return JSON.parse(text);
};

const askGemini = async (images, prompt, schema = PRODUCT_SCHEMA, models = GEMINI_MODELS) => {
    const body = JSON.stringify({
        contents: [{
            parts: [
                ...images.flatMap((i, n) => [
                    { text: i.label || `Image ${n + 1}:` },
                    { inline_data: { mime_type: i.mediaType, data: i.data } },
                ]),
                { text: prompt },
            ],
        }],
        generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema },
    });
    let lastError;
    // Two passes over the model list, with a short pause, to ride out "high demand" spikes.
    const attempts = [...models, ...models];
    for (const [i, model] of attempts.entries()) {
        if (i === models.length) await new Promise(r => setTimeout(r, 2000));
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
        // Filling the form is worth Claude's accuracy when its key is set; Gemini is the backup.
        const providers = [
            process.env.ANTHROPIC_API_KEY && 'claude',
            process.env.GEMINI_API_KEY && 'gemini',
        ].filter(Boolean);
        if (!providers.length) {
            return res.status(503).json({ success: false, message: 'AI is not configured on the server (set GEMINI_API_KEY or ANTHROPIC_API_KEY)' });
        }

        const { images = [], text = '', language = 'en' } = req.body || {};
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
            language: LANGUAGES[language] ? language : 'en',
            text: cleanText,
            types: typeList,
            collections: collectionList,
        });
        let data;
        for (const [i, provider] of providers.entries()) {
            try {
                data = provider === 'claude' ? await askClaude(imageBlocks, prompt) : await askGemini(imageBlocks, prompt);
                break;
            } catch (e) {
                if (i === providers.length - 1) throw e;
                console.warn(`AI parse-product: ${provider} failed (${e.message}), trying ${providers[i + 1]}`);
            }
        }

        // Keep only valid image numbers; main image must be one of the product photos.
        const count = imageBlocks.length;
        data.images = (data.images || []).filter(i => Number.isInteger(i.number) && i.number >= 1 && i.number <= count);
        // Older answers (Gemini backup) may not use "detail"; a main photo can only be a "product".
        const products = data.images.filter(i => i.kind === 'product').map(i => i.number);
        if (!products.includes(data.mainImage)) data.mainImage = products[0] ?? null;

        // Drop ids the model may have made up.
        if (!typeList.some(t => t.id === data.typeId)) data.typeId = null;
        if (!collectionList.some(c => c.id === data.collectionId)) data.collectionId = null;

        res.status(200).json({ success: true, data });
    } catch (e) {
        console.error('AI parse-product failed:', e.message);
        const busy = [429, 503, 529].includes(e.status);
        res.status(busy ? 503 : 500).json({
            success: false,
            message: busy
                ? 'The AI is busy right now, please try again in a minute'
                : 'AI could not read the images, please try again',
        });
    }
};

// Shared with the customer-facing assistant (askController).
// Lite models first: they have larger free quotas and answer faster, which suits short customer questions.
const LITE_FIRST = [...GEMINI_MODELS.filter(m => m.includes('lite')), ...GEMINI_MODELS.filter(m => !m.includes('lite'))];
// Claude Haiku first when its key is set (medium effort: careful but quick; AI_ASK_PROVIDER=gemini turns it off),
// Gemini as the backup. Haiku has no server-side fallback on a refusal, so Gemini covers that too.
const askAI = async (images, prompt, schema, { lite = false } = {}) => {
    const providers = [
        process.env.ANTHROPIC_API_KEY && process.env.AI_ASK_PROVIDER !== 'gemini' && 'claude',
        process.env.GEMINI_API_KEY && 'gemini',
    ].filter(Boolean);
    if (!providers.length) throw Object.assign(new Error('AI is not configured'), { status: 503 });
    for (const [i, provider] of providers.entries()) {
        try {
            return provider === 'claude'
                ? await askClaude(images, prompt, schema, { model: ASK_MODEL, effort: 'medium', fallbacks: false, maxTokens: 8000 })
                : await askGemini(images, prompt, schema, lite ? LITE_FIRST : GEMINI_MODELS);
        } catch (e) {
            if (i === providers.length - 1) throw e;
            console.warn(`AI ask: ${provider} failed (${e.message}), trying ${providers[i + 1]}`);
        }
    }
};

module.exports = { parseProduct, askAI, getProvider, parseDataUrl };
