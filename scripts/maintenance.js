import pool from '../db.js';
try {
    const result = await pool.query("DELETE FROM material_views WHERE viewed_at < now()-interval '180 days'");
    console.log('Expired activity rows removed:', result.rowCount);
} finally { await pool.end(); }
