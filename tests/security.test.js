import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { IncomingMessage, ServerResponse } from 'node:http';
import { PassThrough } from 'node:stream';
import { configureApp } from '../server/security.js';

async function withApp(run) {
    const app = express();
    configureApp(app, { JWT_SECRET: 'test-only-security-secret-at-least-32-characters' });
    for (const path of ['/login', '/register', '/ordinary']) app.post(path, (req, res) => res.sendStatus(204));
    app.use((err, req, res, next) => res.status(err.status || 500).json({ error: 'Invalid request' }));
    // Drive the real Express middleware and routing without opening a listening socket.
    // The managed local sandbox forbids listen(); PostgreSQL integration is separate.
    await run((path, options = {}) => new Promise((resolve, reject) => {
        const req = new IncomingMessage(new PassThrough());
        req.url = path;
        req.method = 'POST';
        req.headers = Object.fromEntries(Object.entries(options.headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
        if (options.body !== undefined) req.headers['content-length'] = String(Buffer.byteLength(options.body));
        const res = new ServerResponse(req);
        res.end = () => {
            resolve({ status: res.statusCode, headers: { get: name => res.getHeader(name) ?? null } });
            return res;
        };
        app.handle(req, res, reject);
        if (options.body !== undefined) req.push(Buffer.from(options.body));
        req.push(null);
    }));
}

test('authentication attempts share the strict budget across case and trailing slash aliases', async () => {
    await withApp(async request => {
        const aliases = ['/login', '/LOGIN', '/login/', '/LoGiN/', '/register', '/REGISTER/'];
        for (let attempt = 0; attempt < 20; attempt++) assert.equal((await request(aliases[attempt % aliases.length])).status, 204);
        const denied = await request('/LOGIN/');
        assert.equal(denied.status, 429);
        assert.ok(Number(denied.headers.get('Retry-After')) >= 1);
        assert.equal((await request('/register')).status, 429);
    });
});

test('ordinary API traffic does not consume the authentication budget', async () => {
    await withApp(async request => {
        for (let attempt = 0; attempt < 21; attempt++) assert.equal((await request('/ordinary')).status, 204);
        assert.equal((await request('/login')).status, 204);
    });
});

test('malformed JSON authentication requests are also rate limited', async () => {
    await withApp(async request => {
        const malformed = { headers: { 'Content-Type': 'application/json' }, body: '{' };
        for (let attempt = 0; attempt < 20; attempt++) assert.equal((await request('/login', malformed)).status, 400);
        assert.equal((await request('/login', malformed)).status, 429);
    });
});

test('untrusted origins are rejected and trusted origins receive security headers', async () => {
    await withApp(async request => {
        assert.equal((await request('/login', { headers: { Origin: 'https://untrusted.example' } })).status, 403);
        const allowed = await request('/login', { headers: { Origin: 'http://localhost:5500' } });
        assert.equal(allowed.status, 204);
        assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'http://localhost:5500');
        assert.equal(allowed.headers.get('X-Content-Type-Options'), 'nosniff');
        assert.equal(allowed.headers.get('Cache-Control'), 'no-store');
        assert.match(allowed.headers.get('Vary'), /Origin/);
    });
});
