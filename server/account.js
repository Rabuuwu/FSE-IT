import bcrypt from 'bcrypt';
import { transaction } from './transaction.js';
import { invalid, text } from './validation.js';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
function bodyFields(body, allowed) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key))) invalid('Invalid account fields');
}
function password(value, name = 'current password', minimum = 1) {
    if (typeof value !== 'string' || value.length < minimum || Buffer.byteLength(value, 'utf8') > 72) invalid(`Invalid ${name}: use ${minimum}–72 characters within 72 UTF-8 bytes`);
    return value;
}
const profile = row => ({ user_id: row.id, email: row.email, display_name: row.display_name, role: row.role });
export function installAccount(app, pool, auth, env) {
    async function locked(client, req) {
        const result = await client.query(`SELECT u.id,u.email,u.display_name,u.password_hash,u.session_version,r.name AS role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1 FOR UPDATE OF u`, [req.user.user_id]);
        const row = result.rows[0];
        if (!row || row.session_version !== req.sessionVersion) fail(401, 'Session expired. Sign in again');
        return row;
    }
    async function checkPassword(row, supplied) {
        if (!await bcrypt.compare(supplied, row.password_hash)) fail(403, 'Current password is incorrect');
    }
    app.get('/account', auth, async (req, res) => {
        const result = await pool.query(`SELECT u.id,u.email,u.display_name,r.name AS role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1`, [req.user.user_id]);
        if (!result.rows[0]) fail(401, 'Account no longer exists');
        res.json({ user: profile(result.rows[0]) });
    });
    app.patch('/account', auth, async (req, res) => {
        bodyFields(req.body, ['display_name','email','current_password']);
        if (req.body.display_name === undefined && req.body.email === undefined) invalid('Provide display_name or email');
        const displayName = req.body.display_name === undefined ? undefined : (text(req.body.display_name, 'display name', 80, false) || null);
        let email;
        if (req.body.email !== undefined) {
            email = text(req.body.email, 'email', 254).toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalid('Invalid email');
        }
        const supplied = req.body.current_password === undefined ? undefined : password(req.body.current_password);
        const user = await transaction(pool, async client => {
            const row = await locked(client, req);
            if (email !== undefined && email !== row.email) {
                if (supplied === undefined) invalid('Current password is required to change email');
                await checkPassword(row, supplied);
            }
            const updated = await client.query('UPDATE users SET display_name=$2,email_verified_at=CASE WHEN email=$3 THEN email_verified_at ELSE NULL END,email=$3 WHERE id=$1 RETURNING id,email,display_name', [row.id,displayName === undefined ? row.display_name : displayName,email ?? row.email]);
            return profile({ ...updated.rows[0], role: row.role });
        });
        res.json({ user });
    });
    app.put('/account/password', auth, async (req, res) => {
        bodyFields(req.body, ['current_password','new_password']);
        const current = password(req.body.current_password), next = password(req.body.new_password, 'new password', 10);
        if (next === current) invalid('New password must differ from current password');
        // Expensive hashing happens before the transaction; the current password and session are rechecked under lock.
        const hash = await bcrypt.hash(next, Number(env.BCRYPT_SALT_ROUNDS || 12));
        await transaction(pool, async client => {
            const row = await locked(client, req);
            await checkPassword(row, current);
            await client.query('UPDATE users SET password_hash=$2,session_version=session_version+1 WHERE id=$1', [row.id,hash]);
        });
        res.json({ message: 'Password changed. Sign in again', reauthenticate: true });
    });
    app.delete('/account', auth, async (req, res) => {
        bodyFields(req.body, ['current_password','confirmation']);
        const current = password(req.body.current_password);
        if (req.body.confirmation !== 'USUŃ KONTO') invalid('Confirm account deletion with USUŃ KONTO');
        await transaction(pool, async client => {
            // Serialize administrator deletion checks across concurrent self-deletions.
            await client.query("SELECT id FROM roles WHERE name='admin' FOR UPDATE");
            const row = await locked(client, req);
            await checkPassword(row, current);
            if (row.role === 'admin') {
                const admins = await client.query("SELECT count(*)::integer AS total FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='admin'");
                if (admins.rows[0].total <= 1) fail(409, 'Cannot delete the last administrator');
            }
            // Preserve published community content; the existing FK clears creator attribution.
            await client.query('DELETE FROM materials WHERE created_by=$1 AND NOT published', [row.id]);
            await client.query('DELETE FROM users WHERE id=$1', [row.id]);
        });
        res.sendStatus(204);
    });
}
