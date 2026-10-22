import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { IncomingMessage, ServerResponse } from 'node:http';
import { PassThrough } from 'node:stream';
import { createApp, start } from '../coreFSE.js';

const env = { JWT_SECRET: 'isolated-test-secret-at-least-32-characters' };
const versions = ['001_legacy.sql', '002_catalog.sql', '003_identity_indexes.sql', '004_material_comments.sql'];
const token = (id = 2, role = 'admin') => jwt.sign({ user_id: id, role }, env.JWT_SECRET);
// These tests execute real routing/auth/error middleware with a controlled database double.
// They do not establish PostgreSQL query correctness, isolation or migration success.
function request(app, path, method = 'GET', bearer, body) {
    return new Promise((resolve, reject) => {
        const req = new IncomingMessage(new PassThrough());
        req.url = path; req.method = method;
        req.headers = bearer ? { authorization: `Bearer ${bearer}` } : {};
        const raw = body === undefined ? undefined : JSON.stringify(body);
        if (raw !== undefined) Object.assign(req.headers, { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(raw)) });
        const res = new ServerResponse(req);
        const chunks = [];
        res.write = chunk => { chunks.push(Buffer.from(chunk)); return true; };
        res.end = chunk => {
            if (chunk) chunks.push(Buffer.from(chunk));
            const text = Buffer.concat(chunks).toString();
            resolve({ status: res.statusCode, body: text ? JSON.parse(text) : null });
            return res;
        };
        app.handle(req, res, reject);
        if (raw !== undefined) req.push(Buffer.from(raw));
        req.push(null);
    });
}
function database(handler) {
    return { query: handler };
}
function authDatabase(handler, role = 'user') {
    return database(async (sql, args) => {
        if (sql.startsWith('SELECT u.id, u.email')) return { rowCount: 1, rows: [{ id: 2, email: 'test@example.invalid', role }] };
        return handler(sql, args);
    });
}

test('readiness rejects 003, recovers after 004, and fails closed on database errors', async () => {
    let applied = versions.slice(0, 3), fail = false;
    const app = createApp(database(async () => {
        if (fail) throw Error('database unavailable');
        return { rowCount: applied.length, rows: applied.map(version => ({ version })) };
    }), env);
    assert.deepEqual(await request(app, '/ready'), { status: 503, body: { ready: false } });
    applied = versions;
    assert.deepEqual(await request(app, '/ready'), { status: 200, body: { ready: true } });
    fail = true;
    assert.deepEqual(await request(app, '/ready'), { status: 503, body: { ready: false } });
});
test('startup rejects schema 003 before creating a listening server', async () => {
    await assert.rejects(start(database(async () => ({ rows: versions.slice(0, 3).map(version => ({ version })) })), env), /Run npm run migrate/);
});
test('missing, malformed, expired and invalid-subject tokens never reach database', async () => {
    const app = createApp(database(() => assert.fail('unauthorized database access')), env);
    for (const bearer of [undefined, 'invalid', jwt.sign({ user_id: 2 }, env.JWT_SECRET, { expiresIn: -1 }), token('2')]) {
        assert.equal((await request(app, '/me', 'GET', bearer)).status, 401);
    }
});
test('deleted accounts are refused even when their token is valid', async () => {
    const app = createApp(database(async () => ({ rowCount: 0, rows: [] })), env);
    assert.equal((await request(app, '/me', 'GET', token())).status, 401);
});
test('current database role overrides the administrator role in an old token', async () => {
    const app = createApp(authDatabase(() => assert.fail('privileged query executed')), env);
    for (const [path, method, body] of [['/users','GET'], ['/admin/resources','GET'], ['/materials','POST',{}], ['/materials/1','DELETE']]) {
        assert.equal((await request(app, path, method, token(), body)).status, 403);
    }
});
test('another user cannot delete an owned legacy resource', async () => {
    const app = createApp(authDatabase(async sql => {
        assert.match(sql, /^SELECT owner_id FROM resources/);
        return { rows: [{ owner_id: 99 }] };
    }), env);
    assert.equal((await request(app, '/resources/42', 'DELETE', token())).status, 403);
});
test('owner can delete own resource and a missing resource returns 404', async () => {
    let exists = true, deleted = false;
    const app = createApp(authDatabase(async sql => {
        if (sql.startsWith('SELECT owner_id')) return { rows: exists ? [{ owner_id: 2 }] : [] };
        assert.match(sql, /^DELETE FROM resources/); deleted = true; return { rows: [] };
    }), env);
    assert.equal((await request(app, '/resources/42', 'DELETE', token())).status, 200);
    assert.equal(deleted, true); exists = false;
    assert.equal((await request(app, '/resources/42', 'DELETE', token())).status, 404);
});
test('inaccessible material prevents comments, views and ratings from reaching writes', async () => {
    const app = createApp(authDatabase(async sql => {
        assert.match(sql, /^SELECT m.id,m.type,m.published/);
        return { rowCount: 0, rows: [] };
    }), env);
    for (const [suffix, method, body] of [['comments','GET'], ['comments','POST',{body:'test'}], ['views','POST'], ['rating','PUT',{score:4}], ['rating','DELETE']]) {
        assert.equal((await request(app, `/materials/42/${suffix}`, method, token(), body)).status, 404);
    }
});
test('rating deletion scopes the mutation to the authenticated user', async () => {
    let deleted = false;
    const app = createApp(authDatabase(async (sql, args) => {
        if (sql.startsWith('SELECT m.id')) return { rowCount: 1, rows: [{ id: 42, published: true }] };
        assert.match(sql, /DELETE FROM ratings WHERE user_id=\$1 AND material_id=\$2/);
        assert.deepEqual(args, [2, 42]); deleted = true; return { rows: [] };
    }), env);
    assert.equal((await request(app, '/materials/42/rating', 'DELETE', token())).status, 204);
    assert.equal(deleted, true);
});
test('database failure returns generic error without database detail', async () => {
    const app = createApp(authDatabase(async () => { throw Error('sensitive internal detail'); }), env);
    assert.deepEqual(await request(app, '/materials', 'GET', token()), { status: 500, body: { error: 'Internal server error' } });
});
