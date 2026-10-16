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
            const result = await pool.query('SELECT u.id, u.email, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1', [payload.user_id]);
            if (!result.rowCount) return res.status(401).json({ error: 'Account no longer exists' });
            req.user = { user_id: result.rows[0].id, email: result.rows[0].email, role: result.rows[0].role };
            next();
        } catch (err) { next(err); }
    };
}
export function requireAdmin(req, res, next) {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Administrator access required' });
    next();
}
