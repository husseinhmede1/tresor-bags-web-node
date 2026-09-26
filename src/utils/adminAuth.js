const crypto = require('crypto');

// Admin login: one password kept in Render's environment (ADMIN_PASSWORD), exchanged for a
// signed token that expires. Protected routes check the token on every request.
// AUTH_SECRET signs the tokens; changing it (or the password) logs every device out.

const TOKEN_DAYS = 30;

const secret = () => process.env.AUTH_SECRET || '';
const isConfigured = () => Boolean(process.env.ADMIN_PASSWORD && secret().length >= 32);

const b64url = (buf) => Buffer.from(buf).toString('base64url');
// Tied to the password too, so changing ADMIN_PASSWORD invalidates old tokens.
const sign = (payload) => crypto
    .createHmac('sha256', secret() + '|' + process.env.ADMIN_PASSWORD)
    .update(payload)
    .digest('base64url');

const safeEqual = (a, b) => {
    const x = crypto.createHash('sha256').update(String(a)).digest();
    const y = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(x, y);
};

const issueToken = () => {
    const payload = b64url(JSON.stringify({ role: 'admin', exp: Date.now() + TOKEN_DAYS * 864e5 }));
    return { token: `${payload}.${sign(payload)}`, expiresInDays: TOKEN_DAYS };
};

const verifyToken = (token) => {
    const [payload, sig] = String(token || '').split('.');
    if (!payload || !sig || !safeEqual(sig, sign(payload))) return false;
    try {
        const { role, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
        return role === 'admin' && exp > Date.now();
    } catch {
        return false;
    }
};

// Slow down password guessing: 10 attempts per 15 minutes per IP.
const attempts = new Map();
const LOGIN_WINDOW = 15 * 60 * 1000;
const LOGIN_MAX = 10;

// POST /api/auth/login { password }
const login = (req, res) => {
    if (!isConfigured()) {
        return res.status(503).json({ success: false, message: 'Admin login is not set up on the server yet' });
    }
    const now = Date.now();
    const recent = (attempts.get(req.ip) || []).filter(t => now - t < LOGIN_WINDOW);
    if (recent.length >= LOGIN_MAX) {
        return res.status(429).json({ success: false, message: 'Too many attempts, try again in 15 minutes' });
    }
    if (!safeEqual(req.body?.password || '', process.env.ADMIN_PASSWORD)) {
        recent.push(now);
        attempts.set(req.ip, recent);
        return res.status(401).json({ success: false, message: 'Wrong password' });
    }
    attempts.delete(req.ip);
    res.json({ success: true, data: issueToken() });
};

// GET /api/auth/check: lets the admin pages confirm a stored token is still valid.
const check = (req, res) => res.json({ success: true });

// Middleware for admin-only routes: "Authorization: Bearer <token>".
const requireAdmin = (req, res, next) => {
    if (!isConfigured()) {
        return res.status(503).json({ success: false, message: 'Admin login is not set up on the server yet' });
    }
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!verifyToken(token)) {
        return res.status(401).json({ success: false, message: 'Please log in again' });
    }
    next();
};

module.exports = { login, check, requireAdmin };
