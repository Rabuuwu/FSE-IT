import 'dotenv/config';
import sql from './db.js';
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { authMiddleware } from './auth.js';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS) || 10;

// Ensure users table exists
async function ensureSchema() {
    try {
        await sql.query(`CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        )`);
        // ensure role column exists for JWT payloads
        await sql.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user'`);
        // resources table for storing user-owned resources
        await sql.query(`CREATE TABLE IF NOT EXISTS resources (
            id SERIAL PRIMARY KEY,
            owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            data JSONB,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        )`);
        console.log('Users table is ready');
    } catch (err) {
        console.error('Error ensuring schema:', err);
        throw err;
    }
}

// POST /register
// Body: { email: string, password: string }
app.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (!email || !password) {
            return res.status(400).json({ error: 'email and password are required' });
        }

        const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

        const inserted = await sql.query(
            'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
            [email, password_hash]
        );

        const user = inserted.rows && inserted.rows[0];
        return res.status(201).json({ id: user.id, email: user.email, created_at: user.created_at });
    } catch (err) {
        // Postgres unique violation code 23505
        if (err && err.code === '23505') {
            return res.status(409).json({ error: 'Email already registered' });
        }
        console.error('Register error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /login
// Body: { email: string, password: string }
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (!email || !password) {
            return res.status(400).json({ error: 'email and password are required' });
        }

        const result = await sql.query('SELECT id, password_hash, role FROM users WHERE email = $1', [email]);
        if (!result.rows || result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const user = result.rows[0];
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const payload = { user_id: user.id, role: user.role || 'user' };
        const secret = process.env.JWT_SECRET || 'dev_jwt_secret_change_me';
        if (!process.env.JWT_SECRET) {
            console.warn('JWT_SECRET is not set — using insecure default secret. Set JWT_SECRET in your .env for production.');
        }

        const token = jwt.sign(payload, secret, { expiresIn: process.env.JWT_EXPIRES_IN || '1h' });

        return res.json({ token });
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// Example protected route to test authMiddleware
app.get('/me', authMiddleware, (req, res) => {
    // req.user is set by authMiddleware
    return res.json({ user: req.user });
});

// GET /resources - returns resources owned by the authenticated user
app.get('/resources', authMiddleware, async (req, res) => {
    try {
        const userId = req.user && req.user.user_id;
        const result = await sql.query(
            'SELECT id, owner_id, data, created_at FROM resources WHERE owner_id = $1 ORDER BY created_at DESC',
            [userId]
        );
        return res.json({ resources: result.rows });
    } catch (err) {
        console.error('GET /resources error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /resources - create a resource owned by the authenticated user
// Body: { data: any }
app.post('/resources', authMiddleware, async (req, res) => {
    try {
        const userId = req.user && req.user.user_id;
        const { data } = req.body || {};

        const inserted = await sql.query(
            'INSERT INTO resources (owner_id, data) VALUES ($1, $2) RETURNING id, owner_id, data, created_at',
            [userId, data || null]
        );

        return res.status(201).json({ resource: inserted.rows[0] });
    } catch (err) {
        console.error('POST /resources error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

async function start() {
    try {
        await ensureSchema();
        // quick DB sanity check
        await sql`SELECT 1`;
        app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
    } catch (err) {
        console.error('Failed to start application:', err);
        process.exit(1);
    }
}

start();
