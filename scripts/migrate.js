import { readdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
export async function migrate(database) {
    // Explicit test pools must not load production configuration or create a default pool.
    if (!database) database = (await import('../db.js')).default;
    const client = await database.connect();
    try {
        await client.query("SELECT pg_advisory_lock(741002)");
        await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
        for (const file of (await readdir(new URL('../migrations/', import.meta.url))).filter(x => x.endsWith('.sql')).sort()) {
            if ((await client.query('SELECT 1 FROM schema_migrations WHERE version=$1', [file])).rowCount) continue;
            await client.query('BEGIN');
            try {
                await client.query(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
                await client.query('INSERT INTO schema_migrations(version) VALUES ($1)', [file]);
                await client.query('COMMIT');
                console.log('Applied migration:', file);
            } catch (err) { await client.query('ROLLBACK'); throw err; }
        }
    } finally { await client.query('SELECT pg_advisory_unlock(741002)'); client.release(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const { default: pool } = await import('../db.js');
    migrate(pool).catch(err => { console.error('Migration failed:', err.code || err.message); process.exitCode = 1; }).finally(() => pool.end());
}
