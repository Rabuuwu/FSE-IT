import { transaction } from './transaction.js';
import { timingSafeEqual } from 'node:crypto';
import { requireAdmin } from '../auth.js';
import { positiveId, materialInput, listInput, invalid } from './validation.js';

const projection = `m.*,
  COALESCE((SELECT json_agg(t.name ORDER BY t.name) FROM material_tags mt JOIN tags t ON t.id=mt.tag_id WHERE mt.material_id=m.id),'[]') AS tags,
  (SELECT round(avg(score),2) FROM ratings r WHERE r.material_id=m.id) AS average_rating,
  (SELECT count(*)::integer FROM ratings r WHERE r.material_id=m.id) AS rating_count`;
const visible = '(m.published OR m.created_by=$1 OR $2::boolean)';
const argsFor = req => [req.user.user_id, req.user.role === 'admin'];
const notFound = () => Object.assign(new Error('Material not found'), { status: 404 });

async function writeRelations(client, id, input) {
    await client.query('DELETE FROM material_tags WHERE material_id=$1', [id]);
    // Stable tag order reduces deadlock risk when multiple editors create the same tags.
    for (const name of input.tags) {
        const tag = await client.query('INSERT INTO tags(name) VALUES ($1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id', [name]);
        await client.query('INSERT INTO material_tags(material_id,tag_id) VALUES ($1,$2)', [id, tag.rows[0].id]);
    }
    await client.query('DELETE FROM material_stages WHERE material_id=$1', [id]);
    for (const [position, stage] of input.stages.entries()) await client.query('INSERT INTO material_stages(material_id,position,title,content) VALUES ($1,$2,$3,$4)', [id, position, stage.title, stage.content]);
}
function serviceAuth(env) {
    return (req, res, next) => {
        const expected = env.ML_SERVICE_TOKEN;
        const supplied = req.headers.authorization?.replace(/^Bearer /, '');
        if (!expected || expected.length < 32 || !supplied || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return res.status(401).json({ error: 'Service authentication required' });
        next();
    };
}
async function accessible(pool, req, id) {
    const result = await pool.query(`SELECT m.id,m.type,m.published FROM materials m WHERE ${visible} AND m.id=$3`, [...argsFor(req), id]);
    if (!result.rowCount) throw notFound();
    return result.rows[0];
}
export function installCatalog(app, pool, auth, env) {
    app.get('/ready', async (req, res) => {
        try { const result = await pool.query("SELECT 1 FROM schema_migrations WHERE version='003_identity_indexes.sql'"); res.status(result.rowCount ? 200 : 503).json({ ready: !!result.rowCount }); }
        catch { res.status(503).json({ ready: false }); }
    });
    app.get('/materials', auth, async (req, res) => {
        const { page, limit, q, tag, type } = listInput(req.query);
        const args = [...argsFor(req), `%${q.replace(/[\\%_]/g, '\\$&')}%`, tag, type];
        const where = `${visible} AND (m.title ILIKE $3 OR m.description ILIKE $3 OR m.author ILIKE $3)
          AND ($4='' OR EXISTS(SELECT 1 FROM material_tags mt JOIN tags t ON t.id=mt.tag_id WHERE mt.material_id=m.id AND t.name=$4))
          AND ($5='' OR m.type=$5)`;
        const count = await pool.query(`SELECT count(*)::integer AS total FROM materials m WHERE ${where}`, args);
        const result = await pool.query(`SELECT ${projection} FROM materials m WHERE ${where} ORDER BY m.created_at DESC,m.id DESC LIMIT $6 OFFSET $7`, [...args, limit, (page-1)*limit]);
        // List responses omit bodies to keep large courses/articles out of catalogue requests.
        res.json({ items: result.rows.map(({ content, ...item }) => item), total: count.rows[0].total, page, limit });
    });
    app.get('/tags', auth, async (req, res) => {
        const result = await pool.query(`SELECT DISTINCT t.name FROM tags t JOIN material_tags mt ON mt.tag_id=t.id JOIN materials m ON m.id=mt.material_id WHERE ${visible} ORDER BY t.name`, argsFor(req));
        res.json({ tags: result.rows.map(row => row.name) });
    });
    app.get('/materials/:id', auth, async (req, res) => {
        const id = positiveId(req.params.id);
        const result = await pool.query(`SELECT ${projection}, (SELECT score FROM ratings WHERE material_id=m.id AND user_id=$1) AS my_rating FROM materials m WHERE ${visible} AND m.id=$3`, [...argsFor(req), id]);
        if (!result.rowCount) throw notFound();
        const stages = await pool.query('SELECT position,title,content FROM material_stages WHERE material_id=$1 ORDER BY position', [id]);
        res.json({ ...result.rows[0], stages: stages.rows });
    });
    app.post('/materials', auth, requireAdmin, async (req, res) => {
        const input = materialInput(req.body);
        const id = await transaction(pool, async client => {
            const result = await client.query(`INSERT INTO materials(created_by,type,title,description,author,url,content,published) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [req.user.user_id,input.type,input.title,input.description,input.author,input.url,input.content,input.published]);
            await writeRelations(client, result.rows[0].id, input);
            return result.rows[0].id;
        });
        res.status(201).json({ id });
    });
    app.put('/materials/:id', auth, requireAdmin, async (req, res) => {
        const id = positiveId(req.params.id), input = materialInput(req.body);
        if (!Number.isInteger(req.body.revision) || req.body.revision < 1) invalid('revision is required to protect concurrent edits');
        await transaction(pool, async client => {
            // Optimistic concurrency: a second editor cannot silently overwrite newer content.
            const result = await client.query(`UPDATE materials SET type=$2,title=$3,description=$4,author=$5,url=$6,content=$7,published=$8,updated_at=clock_timestamp(),revision=revision+1 WHERE id=$1 AND revision=$9 RETURNING id`, [id,input.type,input.title,input.description,input.author,input.url,input.content,input.published,req.body.revision]);
            if (!result.rowCount) throw Object.assign(new Error('Material changed or was deleted. Reload before saving.'), { status: 409 });
            await writeRelations(client, id, input);
        });
        res.json({ id });
    });
    app.delete('/materials/:id', auth, requireAdmin, async (req, res) => {
        const result = await pool.query('DELETE FROM materials WHERE id=$1 RETURNING id', [positiveId(req.params.id)]);
        if (!result.rowCount) throw notFound();
        res.sendStatus(204);
    });
    app.post('/materials/:id/views', auth, async (req, res) => {
        const id = positiveId(req.params.id);
        const material = await accessible(pool, req, id);
        if (!material.published) return res.sendStatus(204); // Admin preview does not train the model.
        await pool.query(`INSERT INTO material_views(user_id,material_id,kind) VALUES($1,$2,$3)
          ON CONFLICT(user_id,material_id) DO UPDATE SET viewed_at=now(),kind=EXCLUDED.kind WHERE material_views.viewed_at < now()-interval '30 minutes'`, [req.user.user_id,id,['link','pdf'].includes(material.type)?'click':'view']);
        res.sendStatus(204);
    });
    app.put('/materials/:id/rating', auth, async (req, res) => {
        const id = positiveId(req.params.id), score = req.body?.score;
        if (!Number.isInteger(score) || score < 1 || score > 5) invalid('Rating must be an integer from 1 to 5');
        const material = await accessible(pool, req, id);
        if (!material.published) invalid('Only published materials can be rated');
        await pool.query('INSERT INTO ratings(user_id,material_id,score) VALUES($1,$2,$3) ON CONFLICT(user_id,material_id) DO UPDATE SET score=EXCLUDED.score,updated_at=now()', [req.user.user_id,id,score]);
        res.json({ score });
    });
    app.delete('/materials/:id/rating', auth, async (req, res) => {
        const id = positiveId(req.params.id); await accessible(pool,req,id);
        await pool.query('DELETE FROM ratings WHERE user_id=$1 AND material_id=$2',[req.user.user_id,id]);
        res.sendStatus(204);
    });
    app.get('/internal/recommendation-data/:id', serviceAuth(env), async (req, res) => {
        const id = positiveId(req.params.id);
        if (!(await pool.query('SELECT 1 FROM users WHERE id=$1',[id])).rowCount) throw Object.assign(new Error('User not found'),{status:404});
        const materials = await pool.query(`SELECT m.id,m.title,m.description,${projection.split('m.*,')[1]} FROM materials m WHERE m.published`);
        const activity = await pool.query(`SELECT v.material_id,r.score FROM material_views v LEFT JOIN ratings r ON r.user_id=v.user_id AND r.material_id=v.material_id WHERE v.user_id=$1 AND v.viewed_at > now()-interval '180 days'
          UNION SELECT r.material_id,r.score FROM ratings r WHERE r.user_id=$1`,[id]);
        // No emails, tokens, password hashes or other users' activity leave Core.
        res.json({ materials: materials.rows, activity: activity.rows });
    });
    app.get('/recommendations/me', auth, async (req, res) => {
        let ranking;
        if (env.ML_URL && env.ML_SERVICE_TOKEN) {
            try {
                const response = await fetch(`${env.ML_URL.replace(/\/$/,'')}/recommendations/${req.user.user_id}`, { headers: { Authorization: `Bearer ${env.ML_SERVICE_TOKEN}` }, signal: AbortSignal.timeout(4000) });
                if (!response.ok) throw new Error('ML unavailable');
                const data = await response.json();
                if (!Array.isArray(data.items) || !data.items.every(item => Number.isSafeInteger(item.id))) throw new Error('Invalid ranking');
                ranking = { ids: [...new Set(data.items.map(item => item.id))].slice(0,5), mode: data.mode === 'personalized' ? 'personalized' : 'popular' };
            } catch { /* A cold or unavailable ML service must not break catalogue access. */ }
        }
        if (ranking) {
            const result = await pool.query(`SELECT ${projection} FROM materials m WHERE m.published AND m.id=ANY($2::integer[]) AND NOT EXISTS(SELECT 1 FROM material_views v WHERE v.user_id=$1 AND v.material_id=m.id AND v.viewed_at > now()-interval '180 days') AND NOT EXISTS(SELECT 1 FROM ratings r WHERE r.user_id=$1 AND r.material_id=m.id) ORDER BY array_position($2::integer[],m.id)`, [req.user.user_id,ranking.ids]);
            return res.json({ mode: ranking.mode, items: result.rows.map(({content,...item}) => item) });
        }
        const result = await pool.query(`SELECT ${projection} FROM materials m WHERE m.published AND NOT EXISTS(SELECT 1 FROM material_views v WHERE v.user_id=$1 AND v.material_id=m.id AND v.viewed_at > now()-interval '180 days') AND NOT EXISTS(SELECT 1 FROM ratings r WHERE r.user_id=$1 AND r.material_id=m.id) ORDER BY average_rating DESC NULLS LAST,rating_count DESC,m.id LIMIT 5`, [req.user.user_id]);
        res.json({ mode: 'fallback', items: result.rows.map(({content,...item}) => item) });
    });
}
