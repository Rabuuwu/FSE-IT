import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { IncomingMessage, ServerResponse } from 'node:http';
import { PassThrough } from 'node:stream';
import { createApp, start } from '../coreFSE.js';

const env = { JWT_SECRET: 'isolated-test-secret-at-least-32-characters' };
const versions = ['001_legacy.sql', '002_catalog.sql', '003_identity_indexes.sql', '004_material_comments.sql', '005_material_moderation.sql', '006_account_sessions.sql', '007_learning_workspace.sql', '008_account_recovery.sql', '009_content_revisions.sql'];
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
        if (sql.startsWith('SELECT u.id, u.email')) return { rowCount: 1, rows: [{ id: 2, email: 'test@example.invalid', role, session_version: 0 }] };
        if (sql.startsWith('SELECT 1 FROM revoked_tokens')) return {rowCount:0,rows:[]};
        return handler(sql, args);
    });
}

test('readiness rejects 005, recovers after 006, and fails closed on database errors', async () => {
    let applied = versions.slice(0, 5), fail = false;
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
    for (const [path, method, body] of [['/users','GET'], ['/admin/resources','GET'], ['/admin/materials','GET'], ['/admin/overview','GET']]) {
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
test('password session versions revoke old and malformed tokens while allowing legacy version zero', async () => {
    let currentVersion=0;
    const app=createApp(database(async sql=>{
        if(sql.startsWith('SELECT 1 FROM revoked_tokens'))return {rowCount:0,rows:[]};
        assert.match(sql,/^SELECT u.id, u.email/);
        return {rowCount:1,rows:[{id:2,email:'test@example.invalid',role:'user',session_version:currentVersion}]};
    }),env);
    assert.equal((await request(app,'/me','GET',token())).status,200);
    currentVersion=1;
    for(const version of [undefined,0,-1,'1',1.5]) {
        const bearer=jwt.sign({user_id:2,...(version===undefined?{}:{session_version:version})},env.JWT_SECRET);
        assert.equal((await request(app,'/me','GET',bearer)).status,401);
    }
    assert.equal((await request(app,'/me','GET',jwt.sign({user_id:2,session_version:1},env.JWT_SECRET))).status,200);
});

test('new learning and moderation routes require identity and current administrator role',async()=>{
 const app=createApp(authDatabase(()=>assert.fail('private data query before authorization')),env);
 for(const path of ['/learning','/notifications','/account/export','/paths','/preferences'])assert.equal((await request(app,path)).status,401);
 for(const path of ['/admin/reports','/admin/revisions'])assert.equal((await request(app,path,'GET',token())).status,403);
});
test('revoked token cannot authorize a request even at the current session version',async()=>{
 const app=createApp(database(async sql=>sql.startsWith('SELECT u.id')?{rowCount:1,rows:[{id:2,email:'test@example.invalid',role:'user',session_version:0}]}:{rowCount:1,rows:[{}]}),env);
 assert.equal((await request(app,'/me','GET',token())).status,401);
});
