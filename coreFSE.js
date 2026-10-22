import { schemaReady } from './server/readiness.js';
import 'dotenv/config';
import pool from './db.js';
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import { createAuthMiddleware } from './auth.js';
import { configureApp } from './server/security.js';
import { installCatalog } from './server/catalog.js';
import { validateLogin, validateCredentials } from './server/validation.js';
import { pathToFileURL } from 'node:url';

export function createApp(database = pool, env = process.env) {
    const app = express();
    const pool = database;
    const DEBUG = env.DEBUG === 'true' && env.NODE_ENV !== 'production';
    const authMiddleware = createAuthMiddleware(pool, env);
    const SALT_ROUNDS = Number(env.BCRYPT_SALT_ROUNDS || 12);
    configureApp(app, env);
    installCatalog(app, pool, authMiddleware, env);
    app.use(['/articles', '/courses'], (req, res, next) => {
        if (['POST', 'PUT', 'DELETE'].includes(req.method)) return res.status(410).json({ error: 'Use the shared /materials API for content changes' });
        next();
    });

    // Root route
    app.get('/', (req, res) => {
        res.json({
            message: 'FSE-IT API Server',
            version: '1.0.0',
            endpoints: {
                'POST /register': 'Register a new user',
                'POST /login': 'Login user',
                'GET /me': 'Get current user info (requires auth)',
                'GET /resources': 'Get user resources (requires auth)',
                'POST /resources': 'Create private legacy resource (requires auth)',
                'GET /materials': 'Shared educational catalogue',
                'GET /recommendations/me': 'Personal recommendations'
            }
        });
    });

    // POST /register
    // Body: { email: string, password: string }
    app.post('/register', async (req, res) => {
        try {
            const { email, password } = validateCredentials(req.body);
            if (!email || !password) {
                return res.status(400).json({ error: 'email and password are required' });
            }

            const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

            const inserted = await pool.query(
                'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
                [email, password_hash]
            );

            const user = inserted.rows && inserted.rows[0];
            return res.status(201).json({ id: user.id, email: user.email, created_at: user.created_at });
        } catch (err) {
            if (err.status) return res.status(err.status).json({ error: err.message });
            // Postgres unique violation code 23505
            if (err && err.code === '23505') {
                return res.status(409).json({ error: 'Email already registered' });
            }
            if (DEBUG) console.error('Register error:', err.message);
            return res.status(500).json({
                error: 'Internal server error',
                details: DEBUG ? err.message : undefined
            });
        }
    });

    // POST /login
    // Body: { email: string, password: string }
    app.post('/login', async (req, res) => {
        try {
            const { email, password } = validateLogin(req.body);
            if (!email || !password) {
                return res.status(400).json({ error: 'email and password are required' });
            }

            const result = await pool.query(`
                SELECT u.id, u.password_hash, u.role_id, r.name as role_name
                FROM users u
                LEFT JOIN roles r ON u.role_id = r.id
                WHERE lower(u.email) = $1
            `, [email]);
            if (!result.rows || result.rows.length === 0) {
                return res.status(401).json({ error: 'Invalid email or password' });
            }

            const user = result.rows[0];
            const match = await bcrypt.compare(password, user.password_hash);
            if (!match) {
                return res.status(401).json({ error: 'Invalid email or password' });
            }

            const payload = { user_id: user.id, role_id: user.role_id, role: user.role_name || 'user' };
            const secret = env.JWT_SECRET;

            const token = jwt.sign(payload, secret, { expiresIn: env.JWT_EXPIRES_IN || '1h' });

            return res.json({ token });
        } catch (err) {
            if (err.status) return res.status(err.status).json({ error: err.message });
            if (DEBUG) console.error('Login error:', err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Example protected route to test authMiddleware
    app.get('/me', authMiddleware, (req, res) => res.json({ user: req.user }));

    // GET /resources - returns resources owned by the authenticated user
    app.get('/resources', authMiddleware, async (req, res) => {
        try {
            const userId = req.user && req.user.user_id;
            const result = await pool.query(
                'SELECT id, owner_id, data, created_at FROM resources WHERE owner_id = $1 ORDER BY created_at DESC',
                [userId]
            );
            return res.json({ resources: result.rows });
        } catch (err) {
            if (err.status) return res.status(err.status).json({ error: err.message });
            if (DEBUG) console.error('GET /resources error:', err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }
    });

    // POST /resources - create a resource owned by the authenticated user
    // Body: { data: any }
    app.post('/resources', authMiddleware, async (req, res) => {
        try {
            const userId = req.user && req.user.user_id;
            const { data } = req.body || {};

            const inserted = await pool.query(
                'INSERT INTO resources (owner_id, data) VALUES ($1, $2) RETURNING id, owner_id, data, created_at',
                [userId, data || null]
            );

            return res.status(201).json({ resource: inserted.rows[0] });
        } catch (err) {
            if (err.status) return res.status(err.status).json({ error: err.message });
            if (DEBUG) console.error('POST /resources error:', err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }
    });

    // DELETE /resources/:id - delete resource (only owner or admin)
    app.delete('/resources/:id', authMiddleware, async (req, res) => {
        try {
            const userId = req.user && req.user.user_id;
            const resourceId = req.params.id;

            // Get resource to check ownership
            const resourceCheck = await pool.query(
                'SELECT owner_id FROM resources WHERE id = $1',
                [resourceId]
            );

            if (resourceCheck.rows.length === 0) {
                return res.status(404).json({ error: 'Resource not found' });
            }

            const resource = resourceCheck.rows[0];

            // Check if user is owner or admin
            if (resource.owner_id !== userId && req.user.role !== 'admin') {
                return res.status(403).json({ error: 'Forbidden' });
            }

            await pool.query('DELETE FROM resources WHERE id = $1', [resourceId]);
            return res.json({ message: 'Resource deleted' });
        } catch (err) {
            if (err.status) return res.status(err.status).json({ error: err.message });
            if (DEBUG) console.error('DELETE /resources/:id error:', err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }
    });

    // ADMIN ROUTES
    // GET /users - get all users (admin only)
    app.get('/users', authMiddleware, async (req, res) => {
        try {
            if (req.user.role !== 'admin') {
                return res.status(403).json({ error: 'Forbidden - Admin only' });
            }

            const result = await pool.query(`
                SELECT u.id, u.email, u.created_at, r.name as role
                FROM users u
                LEFT JOIN roles r ON u.role_id = r.id
                ORDER BY u.created_at DESC
            `);

            return res.json(result.rows);
        } catch (err) {
            if (err.status) return res.status(err.status).json({ error: err.message });
            if (DEBUG) console.error('GET /users error:', err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }
    });

    // DELETE /users/:id - delete user (admin only)
    app.delete('/users/:id', authMiddleware, async (req, res) => {
        try {
            if (req.user.role !== 'admin') {
                return res.status(403).json({ error: 'Forbidden - Admin only' });
            }

            const userId = req.params.id;

            // Prevent deleting self
            if (userId === req.user.user_id.toString()) {
                return res.status(400).json({ error: 'Cannot delete your own account' });
            }

            // Delete user's resources first (CASCADE should handle this, but explicit for safety)

            // Delete user
            const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [userId]);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }

            return res.json({ message: 'User deleted' });
        } catch (err) {
            if (err.status) return res.status(err.status).json({ error: err.message });
            if (DEBUG) console.error('DELETE /users/:id error:', err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }
    });

    // GET /admin/resources - get all resources (admin only)
    app.get('/admin/resources', authMiddleware, async (req, res) => {
        try {
            if (req.user.role !== 'admin') {
                return res.status(403).json({ error: 'Forbidden - Admin only' });
            }

            const result = await pool.query(
                'SELECT id, owner_id, data, created_at FROM resources ORDER BY created_at DESC'
            );

            return res.json(result.rows);
        } catch (err) {
            if (err.status) return res.status(err.status).json({ error: err.message });
            if (DEBUG) console.error('GET /admin/resources error:', err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }
    });

    // ARTICLE ROUTES
    // GET /articles - get all articles
    app.get('/articles', authMiddleware, async (req, res) => {
        try {
            const result = await pool.query(`
                SELECT a.id, a.author_id, a.title, a.content, a.summary, a.created_at, u.email as author_email
                FROM articles a
                JOIN users u ON a.author_id = u.id
                WHERE a.published OR a.author_id = $1 OR $2::boolean ORDER BY a.created_at DESC
            `, [req.user.user_id, req.user.role === 'admin']);

            return res.json(result.rows);
        } catch (err) {
            if (err.status) return res.status(err.status).json({ error: err.message });
            if (DEBUG) console.error('GET /articles error:', err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }
    });

    // GET /articles/:id - get article by ID
    app.get('/articles/:id', authMiddleware, async (req, res) => {
        try {
            const result = await pool.query(`
                SELECT a.id, a.author_id, a.title, a.content, a.summary, a.created_at, u.email as author_email
                FROM articles a
                JOIN users u ON a.author_id = u.id
                WHERE a.id = $1 AND (a.published OR a.author_id = $2 OR $3::boolean)
            `, [req.params.id, req.user.user_id, req.user.role === 'admin']);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Article not found' });
            }

            return res.json(result.rows[0]);
        } catch (err) {
            if (err.status) return res.status(err.status).json({ error: err.message });
            console.error('GET /articles/:id error:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }
    });

    // COURSE ROUTES
    // GET /courses - get all courses
    app.get('/courses', authMiddleware, async (req, res) => {
        try {
            const result = await pool.query(`
                SELECT c.id, c.author_id, c.title, c.description, c.created_at, u.email as author_email
                FROM courses c
                JOIN users u ON c.author_id = u.id
                WHERE c.published OR c.author_id = $1 OR $2::boolean ORDER BY c.created_at DESC
            `, [req.user.user_id, req.user.role === 'admin']);

            // Get stages for each course
            const courses = await Promise.all(result.rows.map(async (course) => {
                const stagesRes = await pool.query(
                    `SELECT id, title, content, stage_number FROM course_stages
                     WHERE course_id = $1 ORDER BY stage_number ASC`,
                    [course.id]
                );
                return {
                    ...course,
                    stages: stagesRes.rows
                };
            }));

            return res.json(courses);
        } catch (err) {
            if (err.status) return res.status(err.status).json({ error: err.message });
            if (DEBUG) console.error('GET /courses/:id error:', err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }
    });

    // GET /courses/:id - get course by ID with stages
    app.get('/courses/:id', authMiddleware, async (req, res) => {
        try {
            const result = await pool.query(`
                SELECT c.id, c.author_id, c.title, c.description, c.created_at, u.email as author_email
                FROM courses c
                JOIN users u ON c.author_id = u.id
                WHERE c.id = $1 AND (c.published OR c.author_id = $2 OR $3::boolean)
            `, [req.params.id, req.user.user_id, req.user.role === 'admin']);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Course not found' });
            }

            const course = result.rows[0];

            // Get stages
            const stagesRes = await pool.query(
                `SELECT id, title, content, stage_number FROM course_stages
                 WHERE course_id = $1 ORDER BY stage_number ASC`,
                [course.id]
            );

            return res.json({
                ...course,
                stages: stagesRes.rows
            });
        } catch (err) {
            if (err.status) return res.status(err.status).json({ error: err.message });
            console.error('GET /courses/:id error:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }
    });

    app.use((err, req, res, next) => {
        if (res.headersSent) return next(err);
        const status = err.status || (err.code === '23505' ? 409 : 500);
        if (status >= 500) console.error('API error:', err.code || err.name);
        res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
    });
    return app;
}

export async function start(database = pool, env = process.env) {
    if (!await schemaReady(database)) throw new Error('Run npm run migrate before starting the API');
    const app = createApp(database, env);
    const server = app.listen(Number(env.PORT || 3000), () => console.log('FSE-IT API ready'));
    const stop = () => server.close(() => database.end().then(() => process.exit(0)));
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
    return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    start().catch(err => { console.error('Startup failed:', err.code || err.message); process.exitCode = 1; pool.end(); });
}
