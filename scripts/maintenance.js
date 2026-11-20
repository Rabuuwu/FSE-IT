import pool from '../db.js';
try {
    const result = await pool.query("DELETE FROM material_views WHERE viewed_at < now()-interval '180 days'");
    await pool.query('DELETE FROM revoked_tokens WHERE expires_at<now()');
    await pool.query('DELETE FROM account_actions WHERE expires_at<now()');
    console.log('Expired activity rows removed:', result.rowCount);
} finally { await pool.end(); }
