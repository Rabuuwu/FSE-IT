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
const editing = material => ({...draft,...material,published:false,publication_status:'private'});
async function publish(body=draft, owner=admin) {
    const created=await request('/materials','POST',editing(body),owner); assert.equal(created.status,201);
    const id=created.body.id;
    let material=(await request(`/materials/${id}`,'GET',undefined,owner)).body;
    assert.equal((await request(`/materials/${id}/submit`,'POST',{revision:material.revision},owner)).status,200);
    material=(await request(`/materials/${id}`,'GET',undefined,owner)).body;
    assert.equal((await request(`/admin/materials/${id}/review`,'POST',{revision:material.revision,decision:'approve'},admin)).status,200);
    return id;
}
const draft={type:'article',title:'Python basics',description:'Learn',author:'Teacher',content:'# Python',tags:['Python'],published:false};
test.before(async()=>{
    await pool.query(await readFile(new URL('../migrations/001_legacy.sql',import.meta.url),'utf8'));
    const oldUser=(await pool.query("INSERT INTO users(email,password_hash) VALUES('legacy@example.com','preserved-hash') RETURNING id")).rows[0].id;
    await pool.query("INSERT INTO articles(author_id,title,content) VALUES($1,'Legacy article','<original>')",[oldUser]);
    const course=(await pool.query("INSERT INTO courses(author_id,title) VALUES($1,'Legacy course') RETURNING id",[oldUser])).rows[0].id;
    await pool.query("INSERT INTO course_stages(course_id,stage_number,title,content,order_index) VALUES($1,1,'First','Original content',0)",[course]);
    await pool.query("INSERT INTO resources(owner_id,data) VALUES($1,'[1,2,3]'::jsonb)",[oldUser]);
    await migrate(pool);await migrate(pool); // Running migrations twice must be harmless.
    server=createApp(pool,env).listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});base=`http://127.0.0.1:${server.address().port}`;
    for(const email of ['admin@example.com','user@example.com'])assert.equal((await request('/register','POST',{email,password:'test-password-long'})).status,201);
    await pool.query("UPDATE users SET role_id=2 WHERE email='admin@example.com'");
    admin=(await request('/login','POST',{email:'admin@example.com',password:'test-password-long'})).body.token;
    user=(await request('/login','POST',{email:'user@example.com',password:'test-password-long'})).body.token;
});
// Each scenario gets an independent server and in-memory request budgets; the
// limiter itself has dedicated tests and is never disabled in integration runs.
test.beforeEach(async()=>{
    if(server)await new Promise(resolve=>server.close(resolve));
    server=createApp(pool,env).listen(0,'127.0.0.1');
    await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
    base=`http://127.0.0.1:${server.address().port}`;
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
        const response=await request('/materials','POST',{...draft,title:'Must roll back',type:'course',tags:['RollbackUniqueTag'],stages:[{title:'First',content:'ok'},{title:'FAIL',content:'ok'}]},admin);
        assert.equal(response.status,500);
        assert.equal((await pool.query("SELECT 1 FROM materials WHERE title='Must roll back'")).rowCount,0);
        assert.equal((await pool.query("SELECT 1 FROM tags WHERE name='rollbackuniquetag'")).rowCount,0);
    } finally { await pool.query('DROP TRIGGER fail_stage ON material_stages');await pool.query('DROP FUNCTION fail_stage()'); }
});
test('registration hashes passwords, validates duplicates, and /me resolves current roles',async()=>{
    const result=await pool.query("SELECT password_hash FROM users WHERE email='user@example.com'");
    assert.notEqual(result.rows[0].password_hash,'test-password-long');
    const {default:bcrypt}=await import('bcrypt');assert.equal(await bcrypt.compare('test-password-long',result.rows[0].password_hash),true);
    assert.equal((await request('/register','POST',{email:'USER@example.com',password:'test-password-long'})).status,409);
    assert.equal((await request('/me','GET',undefined,admin)).body.user.role,'admin');
    assert.equal((await request('/me')).status,401);
    const own=await request('/materials','POST',{...draft,title:'Personal authorization draft',tags:['personal']},user); assert.equal(own.status,201);
    assert.equal((await request(`/materials/${own.body.id}`,'GET',undefined,user)).body.publication_status,'private');
});
test('drafts stay hidden, CRUD filters work, course edits are atomic and stale edits fail',async()=>{
    const created=await request('/materials','POST',draft,admin);assert.equal(created.status,201);const id=created.body.id;
    assert.equal((await request(`/materials/${id}`,'GET',undefined,user)).status,404);
    assert.equal((await request('/materials?q=Python','GET',undefined,user)).body.total,0);
    const loaded=(await request(`/materials/${id}`,'GET',undefined,admin)).body;
    assert.equal((await request(`/materials/${id}/submit`,'POST',{revision:loaded.revision},admin)).status,200);
    const pending=(await request(`/materials/${id}`,'GET',undefined,admin)).body;
    assert.equal((await request(`/admin/materials/${id}/review`,'POST',{revision:pending.revision,decision:'approve'},admin)).status,200);
    const hidden=(await request('/materials','POST',{...draft,title:'Private creator draft'},admin)).body.id;
    const creatorId=(await request('/me','GET',undefined,admin)).body.user.user_id;
    assert.equal((await request(`/creators/${creatorId}`)).status,200);
    assert.equal((await request('/creators/1%20OR%201=1','GET',undefined,user)).status,400);
    const profile=await request(`/creators/${creatorId}`,'GET',undefined,user);
    assert.equal(profile.status,200);
    assert.equal(profile.body.total,1);
    assert.deepEqual(profile.body.items.map(item=>item.id),[id]);
    assert.equal(profile.body.items[0].content,undefined);
    assert.equal(profile.body.creator.email,undefined);
    assert.notEqual(profile.body.items[0].id,hidden);
    assert.equal((await request(`/materials/${id}`,'PUT',editing(loaded),admin)).status,409);
    assert.equal((await request('/materials?tag=python','GET',undefined,user)).body.total,1);
    const revision=(await request(`/materials/${id}`,'GET',undefined,admin)).body.revision;
    assert.equal((await request(`/materials/${id}`,'PUT',{...draft,type:'course',revision,stages:[{title:'Bad',content:''}]},admin)).status,400);
    assert.equal((await request(`/materials/${id}`,'GET',undefined,admin)).body.type,'article');
    assert.equal((await request(`/materials/${id}`,'DELETE',undefined,admin)).status,204);
});
test('views deduplicate, concurrent ratings upsert, and fallback excludes viewed content',async()=>{
    const id=await publish();
    assert.equal((await request(`/materials/${id}/rating`,'PUT',{score:6},user)).status,400);
    const ratings=await Promise.all([request(`/materials/${id}/rating`,'PUT',{score:4},user),request(`/materials/${id}/rating`,'PUT',{score:5},user)]);
    assert.deepEqual(ratings.map(result=>result.status),[200,200]);
    assert.equal((await pool.query('SELECT * FROM ratings WHERE material_id=$1',[id])).rowCount,1);
    await request(`/materials/${id}/views`,'POST',undefined,user);
    const before=(await pool.query('SELECT viewed_at FROM material_views WHERE material_id=$1',[id])).rows[0].viewed_at.toISOString();
    await request(`/materials/${id}/views`,'POST',undefined,user);
    assert.equal((await pool.query('SELECT viewed_at FROM material_views WHERE material_id=$1',[id])).rows[0].viewed_at.toISOString(),before);
    assert.ok(!(await request('/recommendations/me','GET',undefined,user)).body.items.some(item=>item.id===id));
    assert.equal((await request('/internal/recommendation-data/2','GET',undefined,user)).status,401);
    assert.equal((await request(`/materials/${id}/rating`,'DELETE',undefined,user)).status,204);
});
test('published material has persistent, validated comments with public display names only',async()=>{
    await pool.query("UPDATE users SET display_name='Administrator Test' WHERE email='admin@example.com'");
    const id=await publish({...draft,title:'Commentable material'});
    assert.equal((await request(`/materials/${id}/comments`)).status,200);
    assert.equal((await request(`/materials/${id}/comments`,'GET',undefined,user)).body.items.length,0);
    assert.equal((await request(`/materials/${id}/comments`,'POST',{body:'   '},user)).status,400);
    const created=await request(`/materials/${id}/comments`,'POST',{body:'Przydatne ćwiczenie.'},user);
    assert.equal(created.status,201);assert.equal(created.body.author,'Użytkownik'); // User display names are not inferred from email.
    const result=await request(`/materials/${id}/comments`,'GET',undefined,user);
    assert.equal(result.body.items[0].body,'Przydatne ćwiczenie.');
    assert.equal(result.body.items[0].author,'Użytkownik');
    await pool.query("UPDATE users SET display_name='Konto Testowe' WHERE email='user@example.com'");
    assert.equal((await request(`/materials/${id}/comments`,'GET',undefined,user)).body.items[0].author,'Konto Testowe');
});
test('migration 004 failure rolls back DDL and retry recovers readiness',async()=>{
    const isolated=`test_${randomUUID().replaceAll('-','')}`;
    await root.query(`CREATE SCHEMA ${isolated}`);
    const db=new pg.Pool({connectionString:url,options:`-c search_path=${isolated}`});
    let localServer;
    try {
        await db.query('CREATE TABLE schema_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
        for(const file of ['001_legacy.sql','002_catalog.sql','003_identity_indexes.sql']) {
            await db.query(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
            await db.query('INSERT INTO schema_migrations(version) VALUES($1)',[file]);
        }
        localServer=createApp(db,env).listen(0,'127.0.0.1');
        await new Promise((resolve,reject)=>{localServer.once('listening',resolve);localServer.once('error',reject);});
        const ready=()=>fetch(`http://127.0.0.1:${localServer.address().port}/ready`);
        assert.equal((await ready()).status,503);
        // Reproduce a conflicting pre-existing constraint. The column added before
        // the error must disappear with the transaction, and 004 must stay unapplied.
        await db.query('ALTER TABLE users ADD CONSTRAINT users_display_name_length_check CHECK(true)');
        await assert.rejects(migrate(db),error=>error.code==='42710');
        assert.equal((await db.query("SELECT 1 FROM schema_migrations WHERE version='004_material_comments.sql'")).rowCount,0);
        assert.equal((await db.query("SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name='users' AND column_name='display_name'",[isolated])).rowCount,0);
        assert.equal((await ready()).status,503);
        await db.query('ALTER TABLE users DROP CONSTRAINT users_display_name_length_check');
        await migrate(db); await migrate(db);
        assert.equal((await ready()).status,200);
        assert.equal((await db.query("SELECT 1 FROM information_schema.tables WHERE table_schema=$1 AND table_name='material_comments'",[isolated])).rowCount,1);
    } finally {
        if(localServer)await new Promise(resolve=>localServer.close(resolve));
        await db.end(); await root.query(`DROP SCHEMA ${isolated} CASCADE`);
    }
});
test('migration 005 preserves publication choices and enforces synchronized publication flags',async()=>{
    const isolated=`test_${randomUUID().replaceAll('-','')}`;
    await root.query(`CREATE SCHEMA ${isolated}`);
    const db=new pg.Pool({connectionString:url,options:`-c search_path=${isolated}`});
    try {
        await db.query('CREATE TABLE schema_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
        for(const file of ['001_legacy.sql','002_catalog.sql','003_identity_indexes.sql','004_material_comments.sql']) {
            await db.query(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
            await db.query('INSERT INTO schema_migrations(version) VALUES($1)',[file]);
        }
        await db.query("INSERT INTO materials(type,title,content,published) VALUES('article','Existing private','private',false),('article','Existing public','public',true)");
        await migrate(db);await migrate(db);
        const rows=(await db.query('SELECT title,published,publication_status FROM materials ORDER BY id')).rows;
        assert.deepEqual(rows,[{title:'Existing private',published:false,publication_status:'private'},{title:'Existing public',published:true,publication_status:'published'}]);
        await assert.rejects(db.query("UPDATE materials SET published=true WHERE publication_status='private'"),error=>error.code==='23514');
        await assert.rejects(db.query("UPDATE materials SET publication_status='unknown' WHERE publication_status='private'"),error=>error.code==='23514');
    } finally {await db.end();await root.query(`DROP SCHEMA ${isolated} CASCADE`);}
});
test('two simultaneous editors cannot overwrite each other using one revision',async()=>{
    const id=(await request('/materials','POST',{...draft,title:'Concurrent edit'},admin)).body.id;
    const loaded=(await request(`/materials/${id}`,'GET',undefined,admin)).body;
    const results=await Promise.all(['Editor A','Editor B'].map(title=>request(`/materials/${id}`,'PUT',editing({...loaded,title}),admin)));
    assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);
    const current=(await request(`/materials/${id}`,'GET',undefined,admin)).body;
    assert.equal(current.revision,loaded.revision+1);
    assert.ok(['Editor A','Editor B'].includes(current.title));
});
test('legacy private resources and ratings remain isolated between users',async()=>{
    const ownerId=(await request('/me','GET',undefined,admin)).body.user.user_id;
    const resource=await request('/resources','POST',{data:{marker:'owner-only'}},admin);
    assert.equal(resource.status,201);
    assert.equal((await request(`/resources/${resource.body.resource.id}`,'DELETE',undefined,user)).status,403);
    assert.ok(!(await request('/resources','GET',undefined,user)).body.resources.some(item=>item.owner_id===ownerId));
    const id=await publish();
    assert.equal((await request(`/materials/${id}/rating`,'PUT',{score:5},admin)).status,200);
    assert.equal((await request(`/materials/${id}/rating`,'DELETE',undefined,user)).status,204);
    assert.equal((await pool.query('SELECT score FROM ratings WHERE user_id=$1 AND material_id=$2',[ownerId,id])).rows[0].score,5);
});
test('author moderation lifecycle protects unpublished data and requires a rejection reason',async()=>{
    const title=`Author lifecycle ${randomUUID()}`;
    const created=await request('/materials','POST',{...draft,title,tags:['private-lifecycle-tag']},user);
    assert.equal(created.status,201); const id=created.body.id;
    const load=async (token=user) => (await request(`/materials/${id}`,'GET',undefined,token)).body;
    let current=await load(); assert.equal(current.publication_status,'private'); assert.equal(current.published,false);
    assert.equal((await request(`/materials/${id}`)).status,404);
    assert.ok(!(await request('/materials')).body.items.some(item=>item.id===id));
    assert.ok(!(await request('/tags')).body.tags.includes('private-lifecycle-tag'));
    assert.ok((await request('/materials/mine?status=private','GET',undefined,user)).body.items.some(item=>item.id===id));
    assert.equal((await request(`/admin/materials/${id}/review`,'POST',{revision:current.revision,decision:'approve'},user)).status,403);
    assert.equal((await request(`/materials/${id}/submit`,'POST',{revision:current.revision},user)).status,200);
    current=await load();assert.equal(current.publication_status,'pending');
    assert.ok((await request('/admin/materials?status=pending','GET',undefined,admin)).body.items.some(item=>item.id===id));
    assert.equal((await request(`/admin/materials/${id}/review`,'POST',{revision:current.revision,decision:'reject',note:' '},admin)).status,400);
    assert.equal((await request(`/admin/materials/${id}/review`,'POST',{revision:current.revision,decision:'reject',note:'Add source references.'},admin)).status,200);
    current=await load();assert.equal(current.publication_status,'rejected');assert.equal(current.review_note,'Add source references.');
    assert.equal((await request(`/materials/${id}`)).status,404);
    assert.equal((await request(`/materials/${id}/submit`,'POST',{revision:current.revision},user)).status,200);
    current=await load();
    assert.equal((await request(`/admin/materials/${id}/review`,'POST',{revision:current.revision,decision:'approve'},admin)).status,200);
    const published=await request(`/materials/${id}`);assert.equal(published.status,200);assert.equal(published.body.publication_status,'published');
    assert.equal((await request(`/materials/${id}`,'PUT',editing({...published.body,title:title+' edited'}),user)).status,200);
    assert.equal((await request(`/materials/${id}`)).status,404);
    assert.equal((await load()).publication_status,'private');
});
test('outsider cannot discover, edit, submit, withdraw or delete another author private material',async()=>{
    const email=`outsider-${randomUUID()}@example.com`;
    assert.equal((await request('/register','POST',{email,password:'test-password-long'})).status,201);
    const outsider=(await request('/login','POST',{email,password:'test-password-long'})).body.token;
    const id=(await request('/materials','POST',draft,user)).body.id;
    const current=(await request(`/materials/${id}`,'GET',undefined,user)).body;
    for(const [path,method,body] of [[`/materials/${id}`,'GET'],[`/materials/${id}`,'PUT',editing(current)],[`/materials/${id}/submit`,'POST',{revision:current.revision}],[`/materials/${id}/withdraw`,'POST',{revision:current.revision}],[`/materials/${id}`,'DELETE']]) {
        assert.equal((await request(path,method,body,outsider)).status,404,`${method} ${path}`);
    }
    for(const bearer of [user,admin]) for(const forged of [{published:true},{publication_status:'published'},{publication_status:'pending'}]) {
        assert.equal((await request('/materials','POST',{...draft,...forged},bearer)).status,400);
        assert.equal((await request(`/materials/${id}`,'PUT',{...editing(current),...forged},bearer)).status,400);
    }
    assert.equal((await request('/admin/materials','GET',undefined,outsider)).status,403);
    assert.equal((await request('/admin/overview','GET',undefined,outsider)).status,403);
});
test('review revision prevents stale approvals and only one concurrent administrator wins',async()=>{
    const id=(await request('/materials','POST',{...draft,title:'Review concurrency'},user)).body.id;
    const load=async()=> (await request(`/materials/${id}`,'GET',undefined,user)).body;
    let current=await load();
    assert.equal((await request(`/materials/${id}/submit`,'POST',{revision:current.revision},user)).status,200);
    const stale=await load();
    assert.equal((await request(`/materials/${id}`,'PUT',editing({...stale,title:'Changed since submission'}),user)).status,200);
    assert.equal((await request(`/admin/materials/${id}/review`,'POST',{revision:stale.revision,decision:'approve'},admin)).status,409);
    assert.equal((await request(`/materials/${id}`)).status,404);
    current=await load();assert.equal((await request(`/materials/${id}/submit`,'POST',{revision:current.revision},user)).status,200);
    current=await load();
    const email=`reviewer-${randomUUID()}@example.com`;
    assert.equal((await request('/register','POST',{email,password:'test-password-long'})).status,201);
    await pool.query('UPDATE users SET role_id=2 WHERE email=$1',[email]);
    const secondAdmin=(await request('/login','POST',{email,password:'test-password-long'})).body.token;
    const results=await Promise.all([admin,secondAdmin].map(token=>request(`/admin/materials/${id}/review`,'POST',{revision:current.revision,decision:'approve'},token)));
    assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);
    assert.equal((await load()).revision,current.revision+1);
});
test('withdrawal removes pending submissions and unpublished data never enters training or recommendations',async()=>{
    const id=(await request('/materials','POST',{...draft,title:'Never train private'},user)).body.id;
    let current=(await request(`/materials/${id}`,'GET',undefined,user)).body;
    assert.equal((await request(`/materials/${id}/submit`,'POST',{revision:current.revision},user)).status,200);
    current=(await request(`/materials/${id}`,'GET',undefined,user)).body;
    assert.equal((await request(`/materials/${id}/withdraw`,'POST',{revision:current.revision},user)).status,200);
    assert.equal((await request(`/materials/${id}/withdraw`,'POST',{revision:current.revision},user)).status,409);
    const ownerId=(await request('/me','GET',undefined,user)).body.user.user_id;
    const train=await request(`/internal/recommendation-data/${ownerId}`,'GET',undefined,env.ML_SERVICE_TOKEN);
    assert.equal(train.status,200);assert.ok(!train.body.materials.some(item=>item.id===id));
    assert.ok(!(await request('/recommendations/me','GET',undefined,user)).body.items.some(item=>item.id===id));
    assert.equal((await request(`/materials/${id}/comments`)).status,404);
    assert.equal((await request(`/materials/${id}/rating`,'PUT',{score:5},user)).status,400);
});
async function accountFixture() {
    const email=`account-${randomUUID()}@example.com`,password='account-original-password-long';
    assert.equal((await request('/register','POST',{email,password})).status,201);
    const token=(await request('/login','POST',{email,password})).body.token;
    const id=(await request('/me','GET',undefined,token)).body.user.user_id;
    return {email,password,token,id};
}
test('account profile updates validate fields, require password for email and reject foreign identities',async()=>{
    const account=await accountFixture(), other=await accountFixture();
    assert.equal((await request('/account')).status,401);
    let response=await request('/account','GET',undefined,account.token);
    assert.equal(response.status,200);assert.equal(response.body.user.user_id,account.id);assert.equal(response.body.user.email,account.email);
    assert.equal(response.body.user.password_hash,undefined);assert.equal(response.body.user.session_version,undefined);
    for(const body of [{display_name:'x'.repeat(81)},{email:'invalid'},{display_name:'Name',user_id:other.id},{display_name:'Name',role:'admin'},{display_name:'Name',role_id:2}]) {
        assert.equal((await request('/account','PATCH',body,account.token)).status,400);
    }
    response=await request('/account','PATCH',{display_name:'Nowa nazwa'},account.token);
    assert.equal(response.status,200);assert.equal(response.body.user.display_name,'Nowa nazwa');
    response=await request('/account','PATCH',{display_name:''},account.token);
    assert.equal(response.status,200);assert.equal(response.body.user.display_name,null);
    assert.equal((await pool.query('SELECT display_name FROM users WHERE id=$1',[account.id])).rows[0].display_name,null);
    assert.equal((await request('/account','PATCH',{email:'changed-'+account.email},account.token)).status,400);
    assert.equal((await request('/account','PATCH',{email:'changed-'+account.email,current_password:'incorrect-password'},account.token)).status,403);
    assert.equal((await request('/account','PATCH',{email:other.email,current_password:account.password},account.token)).status,409);
    const email='changed-'+account.email;
    response=await request('/account','PATCH',{email,current_password:account.password},account.token);
    assert.equal(response.status,200);assert.equal(response.body.user.email,email);
    assert.equal((await request('/login','POST',{email:account.email,password:account.password})).status,401);
    assert.equal((await request('/login','POST',{email,password:account.password})).status,200);
    assert.equal((await pool.query('SELECT email,role_id FROM users WHERE id=$1',[other.id])).rows[0].email,other.email);
    assert.equal((await pool.query('SELECT role_id FROM users WHERE id=$1',[account.id])).rows[0].role_id,1);
});
test('password changes revoke every previous token and preserve only the new password',async()=>{
    const account=await accountFixture();
    const secondToken=(await request('/login','POST',{email:account.email,password:account.password})).body.token;
    const changed='account-replacement-password-long';
    assert.equal((await request('/account/password','PUT',{current_password:'incorrect-password',new_password:changed},account.token)).status,403);
    assert.equal((await request('/account/password','PUT',{current_password:account.password,new_password:'short'},account.token)).status,400);
    assert.equal((await request('/account/password','PUT',{current_password:account.password,new_password:changed,user_id:1},account.token)).status,400);
    assert.equal((await request('/account/password','PUT',{current_password:account.password,new_password:changed},account.token)).status,200);
    for(const token of [account.token,secondToken]) {
        assert.equal((await request('/me','GET',undefined,token)).status,401);
        assert.equal((await request('/account','GET',undefined,token)).status,401);
    }
    assert.equal((await request('/login','POST',{email:account.email,password:account.password})).status,401);
    const login=await request('/login','POST',{email:account.email,password:changed});assert.equal(login.status,200);
    assert.equal((await request('/account','GET',undefined,login.body.token)).status,200);
    const row=(await pool.query('SELECT password_hash,session_version FROM users WHERE id=$1',[account.id])).rows[0];
    assert.equal(row.session_version,1);assert.notEqual(row.password_hash,changed);
});
test('account deletion requires exact confirmation, removes nonpublic work and preserves published content',async()=>{
    const account=await accountFixture(), other=await accountFixture();
    const make=async title=>(await request('/materials','POST',{...draft,title},account.token)).body.id;
    const privateId=await make('Delete private'),pendingId=await make('Delete pending'),rejectedId=await make('Delete rejected');
    for(const id of [pendingId,rejectedId]) {
        const material=(await request(`/materials/${id}`,'GET',undefined,account.token)).body;
        assert.equal((await request(`/materials/${id}/submit`,'POST',{revision:material.revision},account.token)).status,200);
    }
    const rejected=(await request(`/materials/${rejectedId}`,'GET',undefined,account.token)).body;
    assert.equal((await request(`/admin/materials/${rejectedId}/review`,'POST',{revision:rejected.revision,decision:'reject',note:'Test feedback'},admin)).status,200);
    const publicId=await publish({...draft,title:'Preserve published'},account.token);
    for(const body of [{current_password:'incorrect-password',confirmation:'USUŃ KONTO'},{current_password:account.password,confirmation:'usun konto'},{current_password:account.password,confirmation:'USUŃ KONTO',user_id:other.id}]) {
        const expected=body.user_id?400:body.confirmation==='USUŃ KONTO'?403:400;
        assert.equal((await request('/account','DELETE',body,account.token)).status,expected);
        assert.equal((await request('/account','GET',undefined,account.token)).status,200);
    }
    assert.equal((await request('/account','DELETE',{current_password:account.password,confirmation:'USUŃ KONTO'},account.token)).status,204);
    assert.equal((await request('/me','GET',undefined,account.token)).status,401);
    assert.equal((await request('/login','POST',{email:account.email,password:account.password})).status,401);
    assert.equal((await pool.query('SELECT 1 FROM materials WHERE id=ANY($1::integer[])',[[privateId,pendingId,rejectedId]])).rowCount,0);
    const published=await request(`/materials/${publicId}`);assert.equal(published.status,200);assert.equal(published.body.created_by,null);
    assert.equal((await request('/account','GET',undefined,other.token)).status,200);
});
test('simultaneous administrator self-deletions cannot remove the last administrator',async()=>{
    const accounts=[await accountFixture(),await accountFixture()];
    const admins=(await pool.query('SELECT id FROM users WHERE role_id=2')).rows.map(row=>row.id);
    try {
        await pool.query('UPDATE users SET role_id=1 WHERE role_id=2');
        await pool.query('UPDATE users SET role_id=2 WHERE id=ANY($1::integer[])',[accounts.map(account=>account.id)]);
        const results=await Promise.all(accounts.map(account=>request('/account','DELETE',{current_password:account.password,confirmation:'USUŃ KONTO'},account.token)));
        assert.deepEqual(results.map(result=>result.status).sort(),[204,409]);
        assert.equal((await pool.query('SELECT count(*)::integer AS total FROM users WHERE role_id=2')).rows[0].total,1);
    } finally {
        await pool.query('UPDATE users SET role_id=1 WHERE id=ANY($1::integer[])',[accounts.map(account=>account.id)]);
        await pool.query('UPDATE users SET role_id=2 WHERE id=ANY($1::integer[])',[admins]);
    }
});
test('deleting the last administrator is refused without changing the account',async()=>{
    const account=await accountFixture();
    const admins=(await pool.query('SELECT id FROM users WHERE role_id=2')).rows.map(row=>row.id);
    try {
        await pool.query('UPDATE users SET role_id=1 WHERE role_id=2');
        await pool.query('UPDATE users SET role_id=2 WHERE id=$1',[account.id]);
        assert.equal((await request('/account','DELETE',{current_password:account.password,confirmation:'USUŃ KONTO'},account.token)).status,409);
        assert.equal((await request('/account','GET',undefined,account.token)).body.user.role,'admin');
    } finally {
        await pool.query('UPDATE users SET role_id=1 WHERE id=$1',[account.id]);
        await pool.query('UPDATE users SET role_id=2 WHERE id=ANY($1::integer[])',[admins]);
    }
});
test('revoked administrator and deleted user lose access with the original tokens',async()=>{
    // Dedicated identities: revocation/deletion must not corrupt later scenarios' fixtures.
    const revokedAdmin=await accountFixture(), deletedUser=await accountFixture();
    await pool.query('UPDATE users SET role_id=2 WHERE id=$1',[revokedAdmin.id]);
    assert.equal((await request('/admin/materials','GET',undefined,revokedAdmin.token)).status,200);
    await pool.query('UPDATE users SET role_id=1 WHERE id=$1',[revokedAdmin.id]);
    assert.equal((await request('/admin/materials','GET',undefined,revokedAdmin.token)).status,403);
    assert.equal((await request('/materials','POST',draft,revokedAdmin.token)).status,201);
    await pool.query('DELETE FROM users WHERE id=$1',[deletedUser.id]);
    assert.equal((await request('/me','GET',undefined,deletedUser.token)).status,401);
    assert.equal((await request('/admin/reset','POST',{},revokedAdmin.token)).status,404);
});

test('learning state is private, progress validates current content and notes survive export',async()=>{
 const id=await publish({...draft,type:'course',stages:[{title:'One',content:'First'},{title:'Two',content:'Second'}]});
 assert.equal((await request(`/learning/${id}`,'PATCH',{bookmarked:true,note:'Private thought'},user)).status,204);
 assert.equal((await request(`/learning/${id}`,'GET',undefined,admin)).body.note,'');
 const m=(await request(`/materials/${id}`)).body;
 assert.equal((await request(`/learning/${id}/progress`,'PUT',{position:0,completed:true,content_version:m.content_version},user)).status,204);
 assert.equal((await request(`/learning/${id}/progress`,'PUT',{position:0,completed:true,content_version:999},user)).status,409);
 assert.equal((await request(`/learning/${id}/progress`,'PUT',{position:200,completed:true,content_version:m.content_version},user)).status,400);
 assert.equal((await request(`/learning/${id}/progress`,'PUT',{position:2,completed:true,content_version:m.content_version},user)).status,404);
 assert.equal((await request('/learning','GET',undefined,user)).body.items.find(x=>x.id===id).completed,1);
 assert.equal((await request('/account/export','GET',undefined,admin)).body.learning.some(x=>x.note==='Private thought'),false);
 assert.equal((await request('/account/export','GET',undefined,user)).body.learning.find(x=>x.material_id===id).note,'Private thought');
 const created=await request('/paths','POST',{title:'Private path',material_ids:[id]},user);assert.equal(created.status,201);
 assert.equal((await request(`/paths/${created.body.id}`,'GET',undefined,admin)).status,404);
 assert.equal((await request(`/paths/${created.body.id}`,'GET',undefined,user)).body.items[0].id,id);
});

test('quizzes hide answers before submission, grade server-side and reject stale versions',async()=>{
 const id=await publish();const questions=[{text:'2+2?',options:['3','4'],answer:1,explanation:'Addition'}];
 assert.equal((await request(`/materials/${id}/quiz`,'PUT',{questions},user)).status,403);
 assert.equal((await request(`/materials/${id}/quiz`,'PUT',{questions},admin)).status,204);
 const quiz=(await request(`/materials/${id}/quiz`,'GET',undefined,user)).body;
 assert.equal(quiz.questions[0].answer,undefined);assert.equal(quiz.questions[0].explanation,undefined);
 const result=await request(`/materials/${id}/quiz/attempts`,'POST',{version:quiz.version,answers:[1]},user);assert.equal(result.status,200);assert.equal(result.body.correct,1);
 assert.equal((await request(`/materials/${id}/quiz/attempts`,'POST',{version:0,answers:[1]},user)).status,409);
});

test('new content revision keeps public version until approval and invalidates old progress',async()=>{
 const id=await publish({...draft,type:'course',stages:[{title:'Original',content:'Original stage'}]});
 const original=(await request(`/materials/${id}`)).body;
 await request(`/learning/${id}/progress`,'PUT',{position:0,completed:true,content_version:original.content_version},user);
 const payload={...editing(original),title:'Revised title',stages:[{title:'Changed',content:'New stage'}]};
 const saved=await request(`/materials/${id}/revision`,'PUT',payload,admin);assert.equal(saved.status,200);
 assert.equal((await request(`/materials/${id}`)).body.title,original.title);
 assert.equal((await request(`/materials/${id}/revision`,'GET',undefined,user)).status,404);
 assert.equal((await request(`/materials/${id}/revision/submit`,'POST',{revision:saved.body.revision},admin)).status,204);
 const pending=(await request(`/materials/${id}/revision`,'GET',undefined,admin)).body.draft;
 assert.equal((await request(`/admin/materials/${id}/revision/review`,'POST',{revision:pending.revision,decision:'approve'},admin)).status,204);
 assert.equal((await request(`/materials/${id}`)).body.title,'Revised title');
 assert.equal((await request(`/learning/${id}`,'GET',undefined,user)).body.progress.length,0);
 assert.equal((await request(`/materials/${id}/versions`,'GET',undefined,admin)).body.items[0].payload.title,original.title);
 assert.equal((await request(`/admin/materials/${id}/revision/review`,'POST',{revision:pending.revision,decision:'approve'},admin)).status,409);
});

test('comments paginate, reports are private, and only owners/admin can remove comments',async()=>{
 const id=await publish();const comment=await request(`/materials/${id}/comments`,'POST',{body:'Review me'},user);assert.equal(comment.status,201);
 assert.equal((await request(`/comments/${comment.body.id}`,'PATCH',{body:'Changed'},admin)).status,404);
 assert.equal((await request(`/materials/${id}/report`,'POST',{reason:'Wrong information',comment_id:comment.body.id},user)).status,201);
 assert.equal((await request('/admin/reports','GET',undefined,user)).status,403);
 assert.equal((await request(`/materials/${id}/comments?page=2&limit=1`)).body.items.length,0);
 assert.equal((await request(`/comments/${comment.body.id}`,'DELETE',undefined,admin)).status,204);
 assert.equal((await request(`/materials/${id}/comments`)).body.items.length,0);
});

test('email links are single-use, reset revokes sessions and mail tokens are encrypted at rest',async()=>{
 const {deliverAccountMail,digestToken}=await import('../server/recovery.js');const sent=[];
 env.sendAccountMail=async(email,purpose,token)=>sent.push({email,purpose,token});
 try{
 const email=`recovery-${randomUUID()}@example.com`;await request('/register','POST',{email,password:'original-long-password'});
 const token=(await request('/login','POST',{email,password:'original-long-password'})).body.token;
 assert.equal((await request('/account/email/request','POST',{},token)).status,202);
 assert.equal(sent.length,0);await deliverAccountMail(pool,env);assert.equal(sent[0].purpose,'verify');
 const stored=(await pool.query('SELECT * FROM account_actions WHERE digest=$1',[digestToken(sent[0].token)])).rows[0];assert.equal(JSON.stringify(stored).includes(sent[0].token),false);
 assert.equal((await request('/auth/actions/confirm','POST',sent[0])).status,200);
 assert.equal((await request('/auth/actions/confirm','POST',sent[0])).status,400);
 assert.equal((await request('/auth/reset/request','POST',{email})).status,202);await deliverAccountMail(pool,env);
 const reset={...sent[1],password:'replacement-long-password'};
 const results=await Promise.all([request('/auth/actions/confirm','POST',reset),request('/auth/actions/confirm','POST',reset)]);
 assert.deepEqual(results.map(x=>x.status).sort(),[200,400]);assert.equal((await request('/me','GET',undefined,token)).status,401);
 const fresh=(await request('/login','POST',{email,password:reset.password})).body.token;
 assert.equal((await request('/auth/logout','POST',{},fresh)).status,204);assert.equal((await request('/me','GET',undefined,fresh)).status,401);
 }finally{delete env.sendAccountMail;}
});
