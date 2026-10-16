import pool from '../db.js';
import bcrypt from 'bcrypt';
const url=process.env.DATABASE_URL;
try {
    if (!url || !new URL(url).pathname.endsWith('_test')) throw new Error('CI seed requires a database ending in _test');
    const hash=await bcrypt.hash(process.env.E2E_ADMIN_PASSWORD,10);
    await pool.query("INSERT INTO users(email,password_hash,role_id) VALUES($1,$2,(SELECT id FROM roles WHERE name='admin'))", [process.env.E2E_ADMIN_EMAIL,hash]);
    console.log('CI administrator created');
} finally { await pool.end(); }
