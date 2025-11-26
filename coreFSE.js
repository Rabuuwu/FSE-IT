import 'dotenv/config';
import pool from './db.js';
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { authMiddleware } from './auth.js';

const app = express();

// CORS middleware for production deployment
app.use((req, res, next) => {
    // Allow requests from your Netlify domain and localhost for development
    const allowedOrigins = [
        'https://fse-it.netlify.app', // Alternative domain if you change it
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:5500', // Live Server default port
        'http://127.0.0.1:5500',
        'http://localhost:8080',
        'http://127.0.0.1:8080'
    ];
    
    const origin = req.headers.origin;
    console.log(`CORS: Request from origin: ${origin}`);
    
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        console.log(`CORS: Allowed origin ${origin}`);
    } else {
        // For production, allow the main Netlify domain as fallback
        res.setHeader('Access-Control-Allow-Origin', 'https://fse-it.netlify.app');
        console.log(`CORS: Unknown origin ${origin}, using default Netlify domain`);
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        console.log('CORS: Handling preflight OPTIONS request');
        res.status(200).end();
        return;
    }
    
    next();
});

app.use(express.json());

const PORT = process.env.PORT || 3000;
const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS) || 10;

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
            'POST /resources': 'Create user resource (requires auth)'
        }
    });
});

// Ensure users table exists
async function ensureSchema() {
    try {
        console.log('Setting up database schema...');
        
        // Check if users table exists and has correct structure
        const tableCheck = await pool.query(`
            SELECT column_name, data_type
            FROM information_schema.columns 
            WHERE table_name = 'users'
        `);
        
        if (tableCheck.rows.length > 0) {
            console.log('Users table exists, checking structure...');
            const columns = tableCheck.rows.map(row => row.column_name);
            console.log('Existing columns:', columns);
            
            // Check if password_hash column exists or role is not integer
            const roleColumn = tableCheck.rows.find(row => row.column_name === 'role');
            if (!columns.includes('password_hash') || (roleColumn && roleColumn.data_type !== 'integer')) {
                console.log('⚠️  Incorrect table structure, recreating tables...');
                await pool.query('DROP TABLE IF EXISTS resources CASCADE');
                await pool.query('DROP TABLE IF EXISTS users CASCADE');
                await pool.query('DROP TABLE IF EXISTS roles CASCADE');
                console.log('Old tables dropped');
            }
        }
        
        // Create roles table first
        await pool.query(`
            CREATE TABLE IF NOT EXISTS roles (
                id SERIAL PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                description TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
            )
        `);
        console.log('✅ Roles table ready');
        
        // Insert default roles if they don't exist
        await pool.query(`
            INSERT INTO roles (id, name, description) 
            VALUES 
                (1, 'user', 'Regular user with basic access'),
                (2, 'admin', 'Administrator with full access')
            ON CONFLICT (name) DO NOTHING
        `);
        console.log('✅ Default roles inserted');
        
        // Create users table with role as foreign key
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role_id INTEGER DEFAULT 1 REFERENCES roles(id),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
            )
        `);
        console.log('✅ Users table ready');
        
        // Create resources table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS resources (
                id SERIAL PRIMARY KEY,
                owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                data JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
            )
        `);
        console.log('✅ Resources table ready');
        
        console.log('✅ Schema setup complete');
    } catch (err) {
        console.error('❌ Error ensuring schema:', err);
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

        const inserted = await pool.query(
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
        console.error('Error details:', {
            message: err.message,
            code: err.code,
            detail: err.detail,
            stack: err.stack
        });
        return res.status(500).json({ 
            error: 'Internal server error',
            details: process.env.NODE_ENV === 'production' ? undefined : err.message 
        });
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

        const result = await pool.query(`
            SELECT u.id, u.password_hash, u.role_id, r.name as role_name 
            FROM users u 
            LEFT JOIN roles r ON u.role_id = r.id 
            WHERE u.email = $1
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
        const result = await pool.query(
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

        const inserted = await pool.query(
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
        console.log('Starting FSE-IT API Server...');
        console.log('DATABASE_URL configured:', !!process.env.DATABASE_URL);
        console.log('PORT:', PORT);
        
        // Test database connection first
        console.log('Testing database connection...');
        const testResult = await pool.query('SELECT NOW() as current_time');
        console.log('Database connected successfully at:', testResult.rows[0].current_time);
        
        // Create schema tables
        await ensureSchema();
        
        // Start listening
        app.listen(PORT, () => {
            console.log(`✅ Server listening on port ${PORT}`);
            console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
        });
    } catch (err) {
        console.error('❌ Failed to start application:', err);
        console.error('Error details:', {
            message: err.message,
            code: err.code,
            stack: err.stack
        });
        
        // Check if it's a database connection error
        if (err.message && err.message.includes('ENOTFOUND')) {
            console.error('⚠️  DATABASE CONNECTION ERROR: Cannot connect to database');
            console.error('   Please check DATABASE_URL environment variable');
        }
        
        process.exit(1);
    }
}

start();
