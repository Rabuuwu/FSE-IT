import express from 'express';
import { positiveId } from './validation.js';

export function configureApp(app, env) {
    if (!env.JWT_SECRET || env.JWT_SECRET.length < 32 || env.JWT_SECRET === 'dev_jwt_secret_change_me') throw new Error('JWT_SECRET must contain at least 32 characters');
    const rounds = Number(env.BCRYPT_SALT_ROUNDS || 12);
    if (!Number.isInteger(rounds) || rounds < 10 || rounds > 15) throw new Error('BCRYPT_SALT_ROUNDS must be 10–15');
    app.disable('x-powered-by');
    // Set only when the deployment's trusted reverse-proxy hop count is known.
    if (env.TRUST_PROXY_HOPS) app.set('trust proxy', Number(env.TRUST_PROXY_HOPS));
    const origins = (env.CORS_ORIGINS || 'http://localhost:5500,http://127.0.0.1:5500').split(',').map(x => x.trim());
    app.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'same-origin');
        res.setHeader('Cache-Control', 'no-store');
        const origin = req.headers.origin;
        if (origin) {
            if (!origins.includes(origin)) return res.status(403).json({ error: 'Origin not allowed' });
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.vary('Origin');
            res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
        }
        if (req.method === 'OPTIONS') return res.sendStatus(204);
        next();
    });
    app.use(express.json({ limit: '2mb' }));
    const buckets = new Map();
    app.use((req, res, next) => {
        const now = Date.now();
        for (const [key, bucket] of buckets) if (bucket.until <= now) buckets.delete(key);
        const auth = ['/login','/register'].includes(req.path);
        const key = `${req.ip}:${auth ? 'auth' : 'api'}`;
        // Bound memory under a large number of different addresses.
        if (!buckets.has(key) && buckets.size >= 20000) return res.status(429).json({ error: 'Try again later' });
        const bucket = buckets.get(key) || { count: 0, until: now + 60000 };
        bucket.count++; buckets.set(key, bucket);
        if (bucket.count > (auth ? 20 : 300)) {
            res.setHeader('Retry-After', String(Math.ceil((bucket.until - now) / 1000)));
            return res.status(429).json({ error: 'Too many requests. Try again later.' });
        }
        next();
    });
    app.use((req, res, next) => {
        try { for (const segment of req.path.split('/')) if (/^\d/.test(segment)) positiveId(segment); next(); }
        catch (err) { next(err); }
    });
    app.get('/health', (req, res) => res.json({ status: 'ok' }));
}
