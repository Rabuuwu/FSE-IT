import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

// Never fall back to DATABASE_URL. Use a unique schema in an explicitly named test DB.
const url=process.env.TEST_DATABASE_URL;
if(!url || !new URL(url).pathname.endsWith('_test')) throw new Error('Set TEST_DATABASE_URL to a dedicated database ending in _test');
process.env.DATABASE_URL=url;
const {default:pg}=await import('pg');
const {createApp}=await import('../coreFSE.js');
const {migrate}=await import('../scripts/migrate.js');
const {default:defaultPool}=await import('../db.js');
const root=new pg.Pool({connectionString:url});
const schema=`test_${randomUUID().replaceAll('-','')}`;
await root.query(`CREATE SCHEMA ${schema}`);
const pool=new pg.Pool({connectionString:url,options:`-c search_path=${schema}`,max:5});
const env={JWT_SECRET:'integration-secret-at-least-32-characters',BCRYPT_SALT_ROUNDS:'10',ML_SERVICE_TOKEN:'integration-service-secret-at-least-32'};
let server,base;
const request=async(path,method='GET',body,token)=>{
    const response=await fetch(base+path,{method,headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,body:await response.json().catch(()=>null)};
};
let admin,user;
const draft={type:'article',title:'Python basics',description:'Learn',author:'Teacher',content:'# Python',tags:['Python'],published:false};
test.before(async()=>{
    await pool.query(await readFile(new URL('../migrations/001_legacy.sql',import.meta.url),'utf8'));
    const oldUser=(await pool.query("INSERT INTO users(email,password_hash) VALUES('legacy@example.com','preserved-hash') RETURNING id")).rows[0].id;
    await pool.query("INSERT INTO articles(author_id,title,content) VALUES($1,'Legacy article','<original>')",[oldUser]);
    const course=(await pool.query("INSERT INTO courses(author_id,title) VALUES($1,'Legacy course') RETURNING id",[oldUser])).rows[0].id;
    await pool.query("INSERT INTO course_stages(course_id,stage_number,title,content,order_index) VALUES($1,1,'First','Original content',0)",[course]);
    await pool.query("INSERT INTO resources(owner_id,data) VALUES($1,'[1,2,3]'::jsonb)",[oldUser]);
    await migrate(pool);await migrate(pool); // Running migrations twice must be harmless.
    server=createApp(pool,env).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}`;
    for(const email of ['admin@example.com','user@example.com'])assert.equal((await request('/register','POST',{email,password:'test-password-long'})).status,201);
    await pool.query("UPDATE users SET role_id=2 WHERE email='admin@example.com'");
    admin=(await request('/login','POST',{email:'admin@example.com',password:'test-password-long'})).body.token;
    user=(await request('/login','POST',{email:'user@example.com',password:'test-password-long'})).body.token;
});
test.after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));await pool.end();await root.query(`DROP SCHEMA ${schema} CASCADE`);await root.end();await defaultPool.end();});
test('migration preserves legacy authors, private JSON, bodies and course stages as drafts',async()=>{
    const materials=(await pool.query('SELECT * FROM materials WHERE legacy_type IS NOT NULL ORDER BY id')).rows;
    assert.equal(materials.length,2);
    assert.ok(materials.every(item=>item.published===false));
    assert.equal(materials.find(item=>item.type==='article').content,'<original>');
    assert.equal((await pool.query('SELECT content FROM material_stages')).rows[0].content,'Original content');
    assert.deepEqual((await pool.query('SELECT data FROM resources')).rows[0].data,[1,2,3]);
    assert.equal((await pool.query('SELECT count(*)::integer AS n FROM articles')).rows[0].n,1);
});
test('database failure in a later course stage leaves no partial course or tags',async()=>{
    await pool.query(`CREATE FUNCTION fail_stage() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.title='FAIL' THEN RAISE EXCEPTION 'stage rejected'; END IF; RETURN NEW; END $$`);
    await pool.query('CREATE TRIGGER fail_stage BEFORE INSERT ON material_stages FOR EACH ROW EXECUTE FUNCTION fail_stage()');
    try {
        const response=await request('/materials','POST',{...draft,title:'Must roll back',type:'course',stages:[{title:'First',content:'ok'},{title:'FAIL',content:'ok'}]},admin);
        assert.equal(response.status,500);
        assert.equal((await pool.query("SELECT 1 FROM materials WHERE title='Must roll back'")).rowCount,0);
    } finally { await pool.query('DROP TRIGGER fail_stage ON material_stages');await pool.query('DROP FUNCTION fail_stage()'); }
});
test('registration hashes passwords, validates duplicates, and /me resolves current roles',async()=>{
    const result=await pool.query("SELECT password_hash FROM users WHERE email='user@example.com'");
    assert.notEqual(result.rows[0].password_hash,'test-password-long');
    const {default:bcrypt}=await import('bcrypt');assert.equal(await bcrypt.compare('test-password-long',result.rows[0].password_hash),true);
    assert.equal((await request('/register','POST',{email:'USER@example.com',password:'test-password-long'})).status,409);
    assert.equal((await request('/me','GET',undefined,admin)).body.user.role,'admin');
    assert.equal((await request('/me')).status,401);
    assert.equal((await request('/materials','POST',draft,user)).status,403);
});
test('drafts stay hidden, CRUD filters work, course edits are atomic and stale edits fail',async()=>{
    const created=await request('/materials','POST',draft,admin);assert.equal(created.status,201);const id=created.body.id;
    assert.equal((await request(`/materials/${id}`,'GET',undefined,user)).status,404);
    assert.equal((await request('/materials?q=Python','GET',undefined,user)).body.total,0);
    const loaded=(await request(`/materials/${id}`,'GET',undefined,admin)).body;
    assert.equal((await request(`/materials/${id}`,'PUT',{...loaded,published:true},admin)).status,200);
    assert.equal((await request(`/materials/${id}`,'PUT',{...loaded,published:true},admin)).status,409);
    assert.equal((await request('/materials?tag=python','GET',undefined,user)).body.total,1);
    const revision=(await request(`/materials/${id}`,'GET',undefined,admin)).body.revision;
    assert.equal((await request(`/materials/${id}`,'PUT',{...draft,type:'course',revision,stages:[{title:'Bad',content:''}]},admin)).status,400);
    assert.equal((await request(`/materials/${id}`,'GET',undefined,admin)).body.type,'article');
    assert.equal((await request(`/materials/${id}`,'DELETE',undefined,admin)).status,204);
});
test('views deduplicate, concurrent ratings upsert, and fallback excludes viewed content',async()=>{
    const id=(await request('/materials','POST',{...draft,published:true},admin)).body.id;
    assert.equal((await request(`/materials/${id}/rating`,'PUT',{score:6},user)).status,400);
    await Promise.all([request(`/materials/${id}/rating`,'PUT',{score:4},user),request(`/materials/${id}/rating`,'PUT',{score:5},user)]);
    assert.equal((await pool.query('SELECT * FROM ratings WHERE material_id=$1',[id])).rowCount,1);
    await request(`/materials/${id}/views`,'POST',undefined,user);
    const before=(await pool.query('SELECT viewed_at FROM material_views WHERE material_id=$1',[id])).rows[0].viewed_at.toISOString();
    await request(`/materials/${id}/views`,'POST',undefined,user);
    assert.equal((await pool.query('SELECT viewed_at FROM material_views WHERE material_id=$1',[id])).rows[0].viewed_at.toISOString(),before);
    assert.ok(!(await request('/recommendations/me','GET',undefined,user)).body.items.some(item=>item.id===id));
    assert.equal((await request('/internal/recommendation-data/2','GET',undefined,user)).status,401);
    assert.equal((await request(`/materials/${id}/rating`,'DELETE',undefined,user)).status,204);
});
test('revoked administrator and deleted user lose access with the original tokens',async()=>{
    await pool.query("UPDATE users SET role_id=1 WHERE email='admin@example.com'");
    assert.equal((await request('/materials','POST',draft,admin)).status,403);
    await pool.query("DELETE FROM users WHERE email='user@example.com'");
    assert.equal((await request('/me','GET',undefined,user)).status,401);
    assert.equal((await request('/admin/reset','POST',{},admin)).status,404);
});
