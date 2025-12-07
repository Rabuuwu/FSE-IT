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
                console.warn('⚠️  Incorrect users table structure detected; not dropping tables automatically.');
                console.warn('Please run a proper migration or adjust schema manually to avoid data loss.');
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
        
        // Create articles table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS articles (
                id SERIAL PRIMARY KEY,
                author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                summary TEXT,
                type VARCHAR(20) DEFAULT 'article',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
            )
        `);
        console.log('✅ Articles table ready');

        // Create courses table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS courses (
                id SERIAL PRIMARY KEY,
                author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                description TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
            )
        `);
        console.log('✅ Courses table ready');

        // Create course stages table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS course_stages (
                id SERIAL PRIMARY KEY,
                course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
                stage_number INTEGER NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                order_index INTEGER NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
                UNIQUE(course_id, stage_number)
            )
        `);
        console.log('✅ Course stages table ready');

        // Legacy resources table for backwards compatibility
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
        console.error('DELETE /resources/:id error:', err);
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
        console.error('GET /users error:', err);
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
        await pool.query('DELETE FROM resources WHERE owner_id = $1', [userId]);

        // Delete user
        const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        return res.json({ message: 'User deleted' });
    } catch (err) {
        console.error('DELETE /users/:id error:', err);
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
        console.error('GET /admin/resources error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /admin/reset - reset database (admin only) - DANGEROUS
app.post('/admin/reset', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden - Admin only' });
        }

        console.warn('⚠️  ADMIN ACTION: Database reset initiated by', req.user.email);

        // Delete all data while preserving schema
        await pool.query('DELETE FROM resources');
        await pool.query('DELETE FROM users');
        await pool.query('DELETE FROM roles');

        // Reinitialize default roles
        await pool.query(`
            INSERT INTO roles (id, name, description) 
            VALUES 
                (1, 'user', 'Regular user with basic access'),
                (2, 'admin', 'Administrator with full access')
            ON CONFLICT (name) DO NOTHING
        `);

        console.log('✅ Database reset completed');
        return res.json({ message: 'Database reset completed' });
    } catch (err) {
        console.error('POST /admin/reset error:', err);
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
            ORDER BY a.created_at DESC
        `);

        return res.json(result.rows);
    } catch (err) {
        console.error('GET /articles error:', err);
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
            WHERE a.id = $1
        `, [req.params.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Article not found' });
        }

        return res.json(result.rows[0]);
    } catch (err) {
        console.error('GET /articles/:id error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /articles - create article
// Body: { title, content, summary, published }
app.post('/articles', authMiddleware, async (req, res) => {
    try {
        const { title, content, summary, published } = req.body;
        const userId = req.user.user_id;

        if (!title || !content) {
            return res.status(400).json({ error: 'title and content are required' });
        }

        const result = await pool.query(
            `INSERT INTO articles (author_id, title, content, summary, type)
             VALUES ($1, $2, $3, $4, 'article')
             RETURNING id, author_id, title, created_at`,
            [userId, title, content, summary || null]
        );

        return res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('POST /articles error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE /articles/:id - delete article
app.delete('/articles/:id', authMiddleware, async (req, res) => {
    try {
        const articleId = req.params.id;
        const userId = req.user.user_id;

        // Check ownership or admin
        const checkRes = await pool.query(
            'SELECT author_id FROM articles WHERE id = $1',
            [articleId]
        );

        if (checkRes.rows.length === 0) {
            return res.status(404).json({ error: 'Article not found' });
        }

        if (checkRes.rows[0].author_id !== userId && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        await pool.query('DELETE FROM articles WHERE id = $1', [articleId]);
        return res.json({ message: 'Article deleted' });
    } catch (err) {
        console.error('DELETE /articles/:id error:', err);
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
            ORDER BY c.created_at DESC
        `);

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
        console.error('GET /courses error:', err);
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
            WHERE c.id = $1
        `, [req.params.id]);

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
        console.error('GET /courses/:id error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /courses - create course with stages
// Body: { title, description, stages: [{ title, content }, ...] }
app.post('/courses', authMiddleware, async (req, res) => {
    try {
        const { title, description, stages } = req.body;
        const userId = req.user.user_id;

        if (!title || !stages || stages.length === 0) {
            return res.status(400).json({ error: 'title and at least one stage are required' });
        }

        const courseRes = await pool.query(
            `INSERT INTO courses (author_id, title, description)
             VALUES ($1, $2, $3)
             RETURNING id, author_id, title, created_at`,
            [userId, title, description || null]
        );

        const courseId = courseRes.rows[0].id;

        // Insert stages
        for (let i = 0; i < stages.length; i++) {
            const stage = stages[i];
            await pool.query(
                `INSERT INTO course_stages (course_id, stage_number, title, content, order_index)
                 VALUES ($1, $2, $3, $4, $5)`,
                [courseId, i + 1, stage.title || `Stage ${i + 1}`, stage.content || '', i]
            );
        }

        return res.status(201).json({
            ...courseRes.rows[0],
            stages: stages
        });
    } catch (err) {
        console.error('POST /courses error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE /courses/:id - delete course
app.delete('/courses/:id', authMiddleware, async (req, res) => {
    try {
        const courseId = req.params.id;
        const userId = req.user.user_id;

        // Check ownership or admin
        const checkRes = await pool.query(
            'SELECT author_id FROM courses WHERE id = $1',
            [courseId]
        );

        if (checkRes.rows.length === 0) {
            return res.status(404).json({ error: 'Course not found' });
        }

        if (checkRes.rows[0].author_id !== userId && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        // Delete stages first (cascade should handle, but explicit for safety)
        await pool.query('DELETE FROM course_stages WHERE course_id = $1', [courseId]);
        await pool.query('DELETE FROM courses WHERE id = $1', [courseId]);

        return res.json({ message: 'Course deleted' });
    } catch (err) {
        console.error('DELETE /courses/:id error:', err);
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
