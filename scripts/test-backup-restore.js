// Only synthetic fixtures in unique schemas of explicitly configured test databases.
// Never falls back to DATABASE_URL; never drops or rewrites an existing schema.
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import pg from 'pg';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { migrate } from './migrate.js';
import { createAuthMiddleware } from '../auth.js';
const run = promisify(execFile);
function testUrl(name) {
    const raw = process.env[name];
    if (!raw) throw Error(`Set ${name} explicitly to a dedicated database ending in _test`);
    const url = new URL(raw);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.pathname.endsWith('_test')) throw Error(`${name} must be a dedicated PostgreSQL database ending in _test`);
    return url;
}
function pgEnvironment(url) {
    // Credentials stay out of argv and logs. Do not inherit database-selection
    // variables or service files that could override the explicitly selected DB.
    return { PATH: process.env.PATH, HOME: process.env.HOME, PGHOST: url.hostname,
        PGPORT: url.port || '5432', PGUSER: decodeURIComponent(url.username),
        PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
        PGSSLMODE: url.searchParams.get('sslmode') || 'prefer', PGOPTIONS: '-c timezone=UTC' };
}
async function snapshot(pool, schema) {
    const tables = (await pool.query('SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename', [schema])).rows;
    const data = {};
    for (const { tablename } of tables) {
        const quoted = '"' + tablename.replaceAll('"', '""') + '"';
        data[tablename] = (await pool.query(`SELECT row_to_json(t) AS row FROM ${quoted} t`)).rows.map(({ row }) => JSON.stringify(row)).sort();
    }
    return data;
}
const started = Date.now();
let sourceRoot, targetRoot, source, target, directory;
const schema = `restore_${randomUUID().replaceAll('-', '')}`;
let sourceCreated = false, targetCreated = false;
try {
    const from = testUrl('TEST_DATABASE_URL'), to = testUrl('TEST_RESTORE_DATABASE_URL');
    assert.notEqual(`${from.hostname}:${from.port || 5432}${from.pathname}`, `${to.hostname}:${to.port || 5432}${to.pathname}`, 'Restore must use a different test database');
    sourceRoot = new pg.Pool({ connectionString: from.href });
    targetRoot = new pg.Pool({ connectionString: to.href });
    await sourceRoot.query(`CREATE SCHEMA ${schema}`); sourceCreated = true;
    source = new pg.Pool({ connectionString: from.href, options: `-c search_path=${schema} -c timezone=UTC` });
    target = new pg.Pool({ connectionString: to.href, options: `-c search_path=${schema} -c timezone=UTC` });
    await migrate(source);
    const password = 'synthetic-restore-only-password';
    const hash = await bcrypt.hash(password, 10);
    const id = (await source.query("INSERT INTO users(email,password_hash,display_name) VALUES('restore@example.invalid',$1,'Restore Fixture') RETURNING id", [hash])).rows[0].id;
    await source.query("INSERT INTO resources(owner_id,data) VALUES($1,'{\"nested\":[1,2,3],\"private\":true}'::jsonb)", [id]);
    const material = (await source.query("INSERT INTO materials(created_by,type,title,description,author,content,published) VALUES($1,'course','Restore course','Fixture','Synthetic author','<preserve> zażółć',false) RETURNING id", [id])).rows[0].id;
    await source.query("INSERT INTO material_stages(material_id,position,title,content) VALUES($1,0,'First','First content'),($1,1,'Second','Second content')", [material]);
    await source.query("INSERT INTO material_comments(material_id,user_id,body) VALUES($1,$2,'Synthetic comment')", [material,id]);
    const before = await snapshot(source, schema);
    directory = await mkdtemp(join(tmpdir(), 'fse-restore-'));
    const archive = join(directory, 'synthetic.dump');
    await run('pg_dump', ['--format=custom', `--schema=${schema}`, '--no-owner', '--no-privileges', `--file=${archive}`], { env: pgEnvironment(from) });
    // CREATE SCHEMA during restore fails on collision; --clean is deliberately absent.
    assert.equal((await targetRoot.query('SELECT 1 FROM pg_namespace WHERE nspname=$1',[schema])).rowCount,0);
    targetCreated = true; // pg_restore may create part of the owned schema before failing.
    const restore = file => run('pg_restore', ['--single-transaction', '--exit-on-error', '--no-owner', '--no-privileges', '--dbname=' + decodeURIComponent(to.pathname.slice(1)), file], { env: pgEnvironment(to) });
    const bytes = await readFile(archive);
    const corrupted = join(directory, 'truncated.dump');
    await writeFile(corrupted, bytes.subarray(0, Math.floor(bytes.length / 2)), { mode: 0o600 });
    await assert.rejects(restore(corrupted), error => Number.isInteger(error.code) && error.code !== 0);
    assert.equal((await targetRoot.query('SELECT 1 FROM pg_namespace WHERE nspname=$1',[schema])).rowCount,0, 'Failed restore must not leave a partial schema');
    // Retry the valid archive only after proving the failed transaction left an empty target.
    await restore(archive);
    assert.deepEqual(await snapshot(target, schema), before);
    const user = (await target.query('SELECT password_hash FROM users WHERE id=$1',[id])).rows[0];
    assert.equal(await bcrypt.compare(password, user.password_hash), true);
    const secret = 'synthetic-restored-auth-secret-at-least-32';
    const req = { headers: { authorization: 'Bearer ' + jwt.sign({ user_id: id }, secret) } };
    await new Promise((resolve, reject) => createAuthMiddleware(target, { JWT_SECRET: secret })(req, { status: () => ({ json: () => reject(Error('restored authentication rejected')) }) }, err => err ? reject(err) : resolve()));
    assert.equal(req.user.user_id, id);
    assert.equal(req.user.role, 'user');
    console.log(`PASS: truncated archive fails atomically, valid archive retry, pg_dump/pg_restore, exact ${Object.keys(before).length}-table snapshot, password verification and current-role authentication; ${Date.now()-started}ms`);
} catch (error) {
    // Never echo connection strings, child stderr or fixture credential values.
    console.error('Backup/restore rehearsal failed:', typeof error.code === 'string' ? error.code : error.name);
    process.exitCode = 1;
} finally {
    if (source) await source.end();
    if (target) await target.end();
    if (sourceCreated) await sourceRoot.query(`DROP SCHEMA ${schema} CASCADE`);
    if (targetCreated) await targetRoot.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    if (sourceRoot) await sourceRoot.end();
    if (targetRoot) await targetRoot.end();
    if (directory) await rm(directory, { recursive: true, force: true });
}
