export function buildPoolConfig(env = process.env) {
    const mode = (env.PGSSLMODE || '').toLowerCase();
    const sslRequired = env.NODE_ENV === 'production' || env.DATABASE_SSL === 'true' || ['require','verify-full','verify-ca'].includes(mode);
    const max = Number(env.PGPOOL_MAX || 5);
    if (!Number.isInteger(max) || max < 1 || max > 50) throw new Error('PGPOOL_MAX must be 1–50');
    const config = { max, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 };
    if (env.DATABASE_URL?.trim()) {
        const url = new URL(env.DATABASE_URL);
        // pg connection-string SSL options can override the explicit ssl object.
        // Force verified TLS whenever production, environment, or URL requires it.
        const urlMode = url.searchParams.get('sslmode');
        const useTls = sslRequired || (urlMode && urlMode !== 'disable');
        for (const key of ['sslmode','sslcert','sslkey','sslrootcert','uselibpqcompat']) url.searchParams.delete(key);
        config.connectionString = url.href;
        if (useTls) config.ssl = { rejectUnauthorized: true, ...(env.DATABASE_CA ? { ca: env.DATABASE_CA } : {}) };
    } else {
        Object.assign(config, { host:env.PGHOST||env.DB_HOST, port:Number(env.PGPORT||env.DB_PORT||5432), database:env.PGDATABASE||env.DB_NAME, user:env.PGUSER||env.DB_USER, password:env.PGPASSWORD||env.DB_PASSWORD });
        if (sslRequired) config.ssl = { rejectUnauthorized: true, ...(env.DATABASE_CA ? { ca: env.DATABASE_CA } : {}) };
    }
    return config;
}
