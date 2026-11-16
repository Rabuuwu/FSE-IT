import jwt from 'jsonwebtoken';

export function createAuthMiddleware(pool, env = process.env) {
    return async (req, res, next) => {
        const header = req.headers.authorization;
        if (typeof header !== 'string' || !/^Bearer \S+$/.test(header)) return res.status(401).json({ error: 'Missing or malformed Authorization header' });
        let payload;
        try { payload = jwt.verify(header.slice(7), env.JWT_SECRET, { algorithms: ['HS256'] }); }
        catch { return res.status(401).json({ error: 'Invalid or expired token' }); }
        if (!Number.isSafeInteger(payload.user_id) || payload.user_id < 1) return res.status(401).json({ error: 'Invalid token' });
        try {
            // Resolve current role on every request: old tokens cannot retain revoked permissions.
            const result = await pool.query('SELECT u.id, u.email, u.session_version, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1', [payload.user_id]);
            if (!result.rowCount) return res.status(401).json({ error: 'Account no longer exists' });
            const version = payload.session_version === undefined ? 0 : payload.session_version;
            if (!Number.isSafeInteger(version) || version < 0 || version !== (result.rows[0].session_version ?? 0)) return res.status(401).json({ error: 'Session expired. Sign in again' });
            req.sessionVersion = version;
            req.user = { user_id: result.rows[0].id, email: result.rows[0].email, role: result.rows[0].role };
            next();
        } catch (err) { next(err); }
    };
}
export function requireAdmin(req, res, next) {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Administrator access required' });
    next();
}

// A supplied token must still pass full verification; anonymous access is allowed only without a header.
export function createOptionalAuthMiddleware(auth) {
    return (req, res, next) => req.headers.authorization === undefined ? next() : auth(req, res, next);
}
