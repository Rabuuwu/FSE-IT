import jwt from 'jsonwebtoken';

export function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers['authorization'] || req.headers['Authorization'];
        if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing or malformed Authorization header' });
        }

        const token = authHeader.split(' ')[1];
        const secret = process.env.JWT_SECRET || 'dev_jwt_secret_change_me';

        let payload;
        try {
            payload = jwt.verify(token, secret);
        } catch (err) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        req.user = { user_id: payload.user_id, role: payload.role };
        return next();
    } catch (err) {
        console.error('authMiddleware error:', err);
        return res.status(401).json({ error: 'Unauthorized' });
    }
}
