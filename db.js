import 'dotenv/config';
import pg from 'pg';
import { buildPoolConfig } from './server/database-config.js';

const pool = new pg.Pool(buildPoolConfig());
pool.on('error', err => console.error('Idle database connection error:', err.code));
export default pool;
