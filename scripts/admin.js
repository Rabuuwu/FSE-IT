import pool from '../db.js';
// Run explicitly against the intended database; never promotes the first registered account automatically.
const email = process.argv[2]?.trim().toLowerCase();
try {
    if (!email) throw new Error('Usage: npm run admin -- registered-email');
    const result = await pool.query("UPDATE users SET role_id=(SELECT id FROM roles WHERE name='admin') WHERE lower(email)=$1 RETURNING id", [email]);
    if (result.rowCount !== 1) throw new Error('Expected exactly one registered account');
    console.log('Administrator role assigned');
} catch (err) { console.error(err.code || err.message); process.exitCode = 1; }
finally { await pool.end(); }
