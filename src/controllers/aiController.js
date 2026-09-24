const Anthropic = require('@anthropic-ai/sdk');
const Type = require('../models/Type');
const Collection = require('../models/Collection');

const MODEL = process.env.AI_MODEL || 'claude-sonnet-5';
const MAX_IMAGES = 8;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

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
        'gender', 'stock', 'supplierPrice', 'supplierCurrency',
        'typeId', 'collectionId', 'notes',
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
        stock: nullable('number'),
        supplierPrice: nullable('number'),
        supplierCurrency: nullable('string'),
        typeId: nullable('string'),
        collectionId: nullable('string'),
        notes: { type: 'string' },
    },
};

const LANGUAGES = { ar: 'Arabic', en: 'English' };

const buildPrompt = ({ language, text, types, collections }) => `
You help a Lebanese bag shop ("Trésor Bags") add products to its website.
The owner buys bags from a Chinese supplier on WeChat. You are given one or more
screenshots of that chat (and maybe pasted text). ALL of them describe ONE single bag:
details may be split across several screenshots, so merge them into one product.
Ignore unrelated chat messages (greetings, other products, payment talk).

Write "title" and "description" in ${LANGUAGES[language]}, translated from the supplier's
language (usually Chinese). Make them sound natural and appealing for shoppers:
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
- stock: only if the supplier states an available quantity.

Classification (pick an id from these lists only, or null if nothing fits):
Types: ${JSON.stringify(types)}
Collections: ${JSON.stringify(collections)}
gender: "Men's", "Women's", "Unisex", or "" if unclear.

Use null for anything not present. Never invent measurements.
"notes": one short line in ${LANGUAGES[language]} telling the owner what is missing
or uncertain (empty string if everything is clear).
${text ? `\nPasted text from the chat:\n"""\n${text}\n"""` : ''}
`.trim();

// Accepts "data:image/png;base64,...." strings.
const toImageBlock = (dataUrl) => {
    const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
    if (!m || !IMAGE_TYPES.includes(m[1])) return null;
    return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } };
};

const parseProduct = async (req, res) => {
    try {
        if (!process.env.ANTHROPIC_API_KEY) {
            return res.status(503).json({ success: false, message: 'AI is not configured on the server (ANTHROPIC_API_KEY missing)' });
        }

        const { images = [], text = '', language = 'ar' } = req.body || {};
        if (!Array.isArray(images) || images.length > MAX_IMAGES) {
            return res.status(400).json({ success: false, message: `Send at most ${MAX_IMAGES} screenshots` });
        }
        const imageBlocks = images.map(toImageBlock);
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

        const response = await getClient().messages.create({
            model: MODEL,
            max_tokens: 2000,
            output_config: { format: { type: 'json_schema', schema: PRODUCT_SCHEMA } },
            messages: [{
                role: 'user',
                content: [
                    ...imageBlocks,
                    {
                        type: 'text',
                        text: buildPrompt({
                            language: LANGUAGES[language] ? language : 'ar',
                            text: cleanText,
                            types: typeList,
                            collections: collectionList,
                        }),
                    },
                ],
            }],
        });

        const textBlock = response.content.find(b => b.type === 'text');
        const data = JSON.parse(textBlock.text);

        // Drop ids the model may have made up.
        if (!typeList.some(t => t.id === data.typeId)) data.typeId = null;
        if (!collectionList.some(c => c.id === data.collectionId)) data.collectionId = null;

        res.status(200).json({ success: true, data });
    } catch (e) {
        console.error('AI parse-product failed:', e.message);
        const status = e.status === 429 ? 429 : 500;
        res.status(status).json({ success: false, message: 'AI could not read the screenshots, please try again' });
    }
};

module.exports = { parseProduct };
