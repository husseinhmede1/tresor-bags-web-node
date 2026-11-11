// The admin's photo cleaner (frontend utils/bagCutout.js) runs an open background-removal model
// in the browser: ISNet "general use" (DIS, Apache-2.0). Browsers can't download it from where
// it is published, so this server fetches it once, checks it is exactly the expected file, keeps
// it on disk and hands it to the admin's browser, which then keeps its own copy.
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const { requireAdmin } = require('../utils/adminAuth');

const MODEL = {
    url: 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx',
    sha256: '60920e99c45464f2ba57bee2ad08c919a52bbf852739e96947fbb4358c0d964a',
    size: 178648008,
};
const FILE = path.join(os.tmpdir(), 'isnet-general-use.onnx');

let fetching = null;
const download = async () => {
    const res = await fetch(MODEL.url, { redirect: 'follow' });
    if (!res.ok || !res.body) throw new Error(`Model download failed (${res.status})`);
    const part = `${FILE}.${process.pid}.part`;
    const hash = crypto.createHash('sha256');
    await new Promise((resolve, reject) => {
        const out = fs.createWriteStream(part);
        Readable.fromWeb(res.body)
            .on('data', (chunk) => hash.update(chunk))
            .on('error', reject)
            .pipe(out)
            .on('finish', resolve)
            .on('error', reject);
    });
    if (hash.digest('hex') !== MODEL.sha256) {
        fs.rmSync(part, { force: true });
        throw new Error('Model download did not match the expected file');
    }
    fs.renameSync(part, FILE);
};
// The server's disk is wiped on restarts, so the model is fetched again when first asked for.
const ensureModel = () => {
    if (fs.existsSync(FILE) && fs.statSync(FILE).size === MODEL.size) return Promise.resolve();
    fetching ??= download().finally(() => { fetching = null; });
    return fetching;
};

const router = express.Router();

router.get('/isnet-general-use.onnx', requireAdmin, async (req, res) => {
    try {
        await ensureModel();
        res.set({
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(MODEL.size),
            'Cache-Control': 'private, max-age=31536000, immutable',
        });
        fs.createReadStream(FILE).pipe(res);
    } catch (e) {
        console.error('Photo cleaner model:', e.message);
        res.status(503).json({ success: false, message: 'The photo cleaner is not available right now, please try again later' });
    }
});

module.exports = router;
