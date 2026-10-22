// The API uses creator display names and comments introduced by migration 004.
// Keep startup and the readiness endpoint on the same required-schema contract.
export const REQUIRED_MIGRATIONS = Object.freeze([
    '001_legacy.sql', '002_catalog.sql', '003_identity_indexes.sql', '004_material_comments.sql',
]);
export async function schemaReady(database) {
    const result = await database.query(
        'SELECT version FROM schema_migrations WHERE version = ANY($1::text[])',
        [REQUIRED_MIGRATIONS],
    );
    const applied = new Set(result.rows.map(row => row.version));
    return REQUIRED_MIGRATIONS.every(version => applied.has(version));
}
