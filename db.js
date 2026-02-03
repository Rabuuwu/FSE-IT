import pg from 'pg'

const { Pool } = pg;

function buildPoolConfig() {
	const connectionString = process.env.DATABASE_URL;

	if (connectionString && connectionString.trim()) {
		return {
			connectionString,
			ssl: shouldUseSsl() ? { rejectUnauthorized: false } : undefined
		};
	}

	const host = process.env.PGHOST || process.env.DB_HOST;
	const port = Number(process.env.PGPORT || process.env.DB_PORT || 5432);
	const database = process.env.PGDATABASE || process.env.DB_NAME;
	const user = process.env.PGUSER || process.env.DB_USER;
	const password = process.env.PGPASSWORD || process.env.DB_PASSWORD;

	return {
		host,
		port,
		database,
		user,
		password,
		ssl: shouldUseSsl() ? { rejectUnauthorized: false } : undefined
	};
}

function shouldUseSsl() {
	const sslMode = (process.env.PGSSLMODE || '').toLowerCase();
	if (sslMode === 'require' || sslMode === 'verify-full') return true;
	if ((process.env.DATABASE_SSL || '').toLowerCase() === 'true') return true;
	return process.env.NODE_ENV === 'production';
}

const pool = new Pool(buildPoolConfig());

export default pool;