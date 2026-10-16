import pool from '../db.js';
// Counts and IDs only. Never dump potentially private legacy JSON to terminal logs.
try {
    const result = await pool.query(`SELECT
      (SELECT count(*) FROM articles)::integer AS original_articles,
      (SELECT count(*) FROM materials WHERE legacy_type='article')::integer AS migrated_articles,
      (SELECT count(*) FROM courses)::integer AS original_courses,
      (SELECT count(*) FROM materials WHERE legacy_type='course')::integer AS migrated_courses,
      (SELECT count(*) FROM course_stages)::integer AS original_stages,
      (SELECT count(*) FROM material_stages ms JOIN materials m ON m.id=ms.material_id WHERE m.legacy_type='course')::integer AS migrated_stages,
      (SELECT count(*) FROM resources)::integer AS private_resources_retained`);
    console.table(result.rows);
    const issues = await pool.query("SELECT id FROM resources WHERE jsonb_typeof(data) IS DISTINCT FROM 'object' OR NOT(data ? 'title' AND data ? 'url') ORDER BY id");
    console.log('Legacy resources requiring review (IDs):', issues.rows.map(row => row.id));
} finally { await pool.end(); }
