import {requireAdmin} from '../auth.js';
import {positiveId,text,listInput,invalid} from './validation.js';
import {quizInput,gradeQuiz} from './learning-validation.js';
import {transaction} from './transaction.js';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export function installLearning(app,pool,auth) {
 async function published(db,id,lock=false) {
  const row=(await db.query(`SELECT id,type,created_by,content_version FROM materials WHERE id=$1 AND published ${lock?'FOR SHARE':''}`,[id])).rows[0];
  if(!row)fail(404,'Material not found');return row;
 }
 async function owner(db,req,id) {
  const row=(await db.query('SELECT id,created_by FROM materials WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!row||(row.created_by!==req.user.user_id&&req.user.role!=='admin'))fail(404,'Material not found');return row;
 }
 app.get('/learning',auth,async(req,res)=>{
  const {page,limit}=listInput(req.query);
  const items=await pool.query(`SELECT m.id,m.title,m.type,m.content_version,l.bookmarked,l.dismissed,l.note,
   (SELECT count(*)::int FROM material_stages s WHERE s.material_id=m.id) AS stages,
   (SELECT count(*)::int FROM learning_progress p WHERE p.material_id=m.id AND p.user_id=$1 AND p.content_version=m.content_version AND p.completed) AS completed,
   (SELECT min(s.position) FROM material_stages s WHERE s.material_id=m.id AND NOT EXISTS(SELECT 1 FROM learning_progress p WHERE p.material_id=m.id AND p.user_id=$1 AND p.content_version=m.content_version AND p.position=s.position AND p.completed)) AS next_position
   FROM learner_materials l JOIN materials m ON m.id=l.material_id WHERE l.user_id=$1 AND m.published
   ORDER BY l.updated_at DESC,m.id DESC LIMIT $2 OFFSET $3`,[req.user.user_id,limit,(page-1)*limit]);
  res.json({items:items.rows,page,limit});
 });
 app.get('/learning/:id',auth,async(req,res)=>{
  const id=positiveId(req.params.id),m=await published(pool,id);
  const state=(await pool.query('SELECT bookmarked,dismissed,note FROM learner_materials WHERE user_id=$1 AND material_id=$2',[req.user.user_id,id])).rows[0]||{bookmarked:false,dismissed:false,note:''};
  const progress=await pool.query('SELECT position,completed FROM learning_progress WHERE user_id=$1 AND material_id=$2 AND content_version=$3',[req.user.user_id,id,m.content_version]);
  res.json({...state,content_version:m.content_version,progress:progress.rows});
 });
 app.patch('/learning/:id',auth,async(req,res)=>{
  const id=positiveId(req.params.id),body=req.body;
  if(!body||Object.keys(body).some(k=>!['bookmarked','dismissed','note'].includes(k)))invalid('Invalid learning fields');
  for(const key of ['bookmarked','dismissed'])if(body[key]!==undefined&&typeof body[key]!=='boolean')invalid('Invalid boolean');
  const note=body.note===undefined?null:text(body.note,'note',10000,false);
  await transaction(pool,async db=>{await published(db,id,true);await db.query(`INSERT INTO learner_materials(user_id,material_id,bookmarked,dismissed,note) VALUES($1,$2,coalesce($3,false),coalesce($4,false),coalesce($5,'')) ON CONFLICT(user_id,material_id) DO UPDATE SET bookmarked=coalesce($3,learner_materials.bookmarked),dismissed=coalesce($4,learner_materials.dismissed),note=coalesce($5,learner_materials.note),updated_at=now()`,[req.user.user_id,id,body.bookmarked??null,body.dismissed??null,note]);});
  res.sendStatus(204);
 });
 app.put('/learning/:id/progress',auth,async(req,res)=>{
  const id=positiveId(req.params.id),{position,completed,content_version}=req.body||{};
  if(!Number.isInteger(position)||position<0||position>99||typeof completed!=='boolean'||!Number.isInteger(content_version))invalid('Invalid progress');
  await transaction(pool,async db=>{
   const m=await published(db,id,true);if(m.content_version!==content_version)fail(409,'Course changed. Reload before marking progress');
   if(m.type!=='course'||!(await db.query('SELECT 1 FROM material_stages WHERE material_id=$1 AND position=$2',[id,position])).rowCount)fail(404,'Stage not found');
   await db.query(`INSERT INTO learner_materials(user_id,material_id) VALUES($1,$2) ON CONFLICT(user_id,material_id) DO UPDATE SET updated_at=now()`,[req.user.user_id,id]);
   await db.query(`INSERT INTO learning_progress(user_id,material_id,content_version,position,completed) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,material_id,content_version,position) DO UPDATE SET completed=$5,updated_at=now()`,[req.user.user_id,id,content_version,position,completed]);
  });res.sendStatus(204);
 });
 app.get('/notifications',auth,async(req,res)=>{const {page,limit}=listInput(req.query);res.json({items:(await pool.query('SELECT id,material_id,message,read_at,created_at FROM notifications WHERE user_id=$1 ORDER BY id DESC LIMIT $2 OFFSET $3',[req.user.user_id,limit,(page-1)*limit])).rows,page,limit});});
 app.put('/notifications/:id/read',auth,async(req,res)=>{const result=await pool.query('UPDATE notifications SET read_at=coalesce(read_at,now()) WHERE id=$1 AND user_id=$2',[positiveId(req.params.id),req.user.user_id]);if(!result.rowCount)fail(404,'Notification not found');res.sendStatus(204);});
 app.post('/materials/:id/report',auth,async(req,res)=>{
  const id=positiveId(req.params.id),reason=text(req.body?.reason,'reason',2000),comment=req.body?.comment_id===undefined?null:positiveId(req.body.comment_id);
  await transaction(pool,async db=>{await published(db,id,true);
   if(comment&&!(await db.query('SELECT 1 FROM material_comments WHERE id=$1 AND material_id=$2',[comment,id])).rowCount)fail(404,'Comment not found');
   await db.query('INSERT INTO material_reports(material_id,user_id,comment_id,reason) VALUES($1,$2,$3,$4)',[id,req.user.user_id,comment,reason]);});res.sendStatus(201);
 });
 app.get('/admin/reports',auth,requireAdmin,async(req,res)=>{const {page,limit}=listInput(req.query);res.json({items:(await pool.query('SELECT id,material_id,comment_id,reason,created_at FROM material_reports WHERE NOT resolved ORDER BY id LIMIT $1 OFFSET $2',[limit,(page-1)*limit])).rows,page,limit});});
 app.put('/admin/reports/:id/resolve',auth,requireAdmin,async(req,res)=>{const result=await pool.query('UPDATE material_reports SET resolved=true WHERE id=$1',[positiveId(req.params.id)]);if(!result.rowCount)fail(404,'Report not found');res.sendStatus(204);});
 app.delete('/comments/:id',auth,async(req,res)=>{
  await transaction(pool,async db=>{const row=(await db.query('SELECT id,user_id,material_id FROM material_comments WHERE id=$1 FOR UPDATE',[positiveId(req.params.id)])).rows[0];
   if(!row||(row.user_id!==req.user.user_id&&req.user.role!=='admin'))fail(404,'Comment not found');
   await db.query('DELETE FROM material_comments WHERE id=$1',[row.id]);
   await db.query("INSERT INTO moderation_events(material_id,actor_id,action) VALUES($1,$2,'comment_deleted')",[row.material_id,req.user.user_id]);});res.sendStatus(204);
 });
 app.patch('/comments/:id',auth,async(req,res)=>{const result=await pool.query('UPDATE material_comments SET body=$3 WHERE id=$1 AND user_id=$2',[positiveId(req.params.id),req.user.user_id,text(req.body?.body,'comment',2000)]);if(!result.rowCount)fail(404,'Comment not found');res.sendStatus(204);});
 app.get('/materials/:id/history',auth,async(req,res)=>{const id=positiveId(req.params.id),{page,limit}=listInput(req.query);await transaction(pool,async db=>{await owner(db,req,id);res.json({items:(await db.query('SELECT id,action,note,created_at FROM moderation_events WHERE material_id=$1 ORDER BY id DESC LIMIT $2 OFFSET $3',[id,limit,(page-1)*limit])).rows,page,limit});});});
 app.get('/preferences',auth,async(req,res)=>res.json((await pool.query('SELECT interests FROM user_preferences WHERE user_id=$1',[req.user.user_id])).rows[0]||{interests:[]}));
 app.put('/preferences',auth,async(req,res)=>{if(!Array.isArray(req.body?.interests)||req.body.interests.length>20)invalid('Provide up to 20 interests');const interests=[...new Set(req.body.interests.map(x=>text(x,'interest',40).toLowerCase()))];await pool.query('INSERT INTO user_preferences(user_id,interests) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET interests=$2',[req.user.user_id,interests]);res.sendStatus(204);});
 app.get('/paths',auth,async(req,res)=>{const {page,limit}=listInput(req.query);res.json({items:(await pool.query('SELECT id,title,description FROM learning_paths WHERE created_by=$1 ORDER BY id DESC LIMIT $2 OFFSET $3',[req.user.user_id,limit,(page-1)*limit])).rows,page,limit});});
 app.post('/paths',auth,async(req,res)=>{
  const title=text(req.body?.title,'title',200),description=text(req.body?.description,'description',2000,false),ids=req.body?.material_ids;
  if(!Array.isArray(ids)||ids.length<1||ids.length>100||new Set(ids).size!==ids.length)invalid('Provide 1–100 unique material IDs');ids.forEach(positiveId);
  const id=await transaction(pool,async db=>{for(const id of [...ids].sort((a,b)=>a-b))await published(db,id,true);const row=(await db.query('INSERT INTO learning_paths(created_by,title,description) VALUES($1,$2,$3) RETURNING id',[req.user.user_id,title,description])).rows[0];for(const [position,id] of ids.entries())await db.query('INSERT INTO learning_path_items(path_id,material_id,position) VALUES($1,$2,$3)',[row.id,id,position]);return row.id;});res.status(201).json({id});
 });
 app.get('/paths/:id',auth,async(req,res)=>{const id=positiveId(req.params.id),path=(await pool.query('SELECT id,title,description FROM learning_paths WHERE id=$1 AND created_by=$2',[id,req.user.user_id])).rows[0];if(!path)fail(404,'Path not found');const items=await pool.query('SELECT m.id,m.title,m.type,i.position FROM learning_path_items i JOIN materials m ON m.id=i.material_id WHERE i.path_id=$1 AND m.published ORDER BY i.position',[id]);res.json({...path,items:items.rows});});
 app.delete('/paths/:id',auth,async(req,res)=>{const r=await pool.query('DELETE FROM learning_paths WHERE id=$1 AND created_by=$2',[positiveId(req.params.id),req.user.user_id]);if(!r.rowCount)fail(404,'Path not found');res.sendStatus(204);});
 app.get('/materials/:id/quiz',auth,async(req,res)=>{const id=positiveId(req.params.id);await published(pool,id);const quiz=(await pool.query('SELECT version,questions FROM material_quizzes WHERE material_id=$1',[id])).rows[0];res.json(quiz?{version:quiz.version,questions:quiz.questions.map(({answer,explanation,...q})=>q)}:{version:0,questions:[]});});
 // Quiz content is published explicitly by an administrator, independently of a material draft.
 app.put('/materials/:id/quiz',auth,requireAdmin,async(req,res)=>{const id=positiveId(req.params.id),questions=quizInput(req.body);await transaction(pool,async db=>{await published(db,id,true);await db.query('INSERT INTO material_quizzes(material_id,questions) VALUES($1,$2) ON CONFLICT(material_id) DO UPDATE SET questions=$2,version=material_quizzes.version+1',[id,JSON.stringify(questions)]);});res.sendStatus(204);});
 app.post('/materials/:id/quiz/attempts',auth,async(req,res)=>{const id=positiveId(req.params.id);const result=await transaction(pool,async db=>{await published(db,id,true);const quiz=(await db.query('SELECT version,questions FROM material_quizzes WHERE material_id=$1 FOR SHARE',[id])).rows[0];if(!quiz||!quiz.questions.length)fail(404,'Quiz not found');if(req.body?.version!==quiz.version)fail(409,'Quiz changed. Reload');const grade=gradeQuiz(quiz.questions,req.body.answers);await db.query('INSERT INTO quiz_attempts(user_id,material_id,version,correct,total) VALUES($1,$2,$3,$4,$5)',[req.user.user_id,id,quiz.version,grade.correct,grade.total]);return {...grade,feedback:quiz.questions.map(q=>({answer:q.answer,explanation:q.explanation}))};});res.json(result);});
 app.get('/author/report',auth,async(req,res)=>{const {page,limit}=listInput(req.query);res.json({items:(await pool.query(`SELECT m.id,m.title,(SELECT count(*)::int FROM material_views v WHERE v.material_id=m.id AND v.viewed_at>now()-interval '180 days') AS viewers,(SELECT round(avg(score),2) FROM ratings r WHERE r.material_id=m.id) AS rating,(SELECT count(DISTINCT p.user_id)::int FROM learning_progress p WHERE p.material_id=m.id AND p.content_version=m.content_version AND p.completed) AS learners_started FROM materials m WHERE m.created_by=$1 ORDER BY m.id DESC LIMIT $2 OFFSET $3`,[req.user.user_id,limit,(page-1)*limit])).rows,page,limit});});
 app.get('/account/export',auth,async(req,res)=>{const uid=req.user.user_id;const data=await transaction(pool,async db=>{await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');const out={exported_at:new Date().toISOString()};for(const [key,sql] of Object.entries({account:'SELECT email,display_name,created_at FROM users WHERE id=$1',materials:'SELECT id,type,title,description,content,url,metadata FROM materials WHERE created_by=$1',stages:'SELECT s.material_id,s.position,s.title,s.content FROM material_stages s JOIN materials m ON m.id=s.material_id WHERE m.created_by=$1',preferences:'SELECT interests FROM user_preferences WHERE user_id=$1',paths:'SELECT p.id,p.title,p.description,i.material_id,i.position FROM learning_paths p LEFT JOIN learning_path_items i ON i.path_id=p.id WHERE p.created_by=$1',revisions:'SELECT material_id,payload,status FROM material_revisions WHERE author_id=$1',legacy:'SELECT data FROM resources WHERE owner_id=$1',learning:'SELECT material_id,bookmarked,dismissed,note FROM learner_materials WHERE user_id=$1',progress:'SELECT material_id,content_version,position,completed FROM learning_progress WHERE user_id=$1',ratings:'SELECT material_id,score FROM ratings WHERE user_id=$1',comments:'SELECT material_id,body,created_at FROM material_comments WHERE user_id=$1',quiz_attempts:'SELECT material_id,version,correct,total,created_at FROM quiz_attempts WHERE user_id=$1'}))out[key]=(await db.query(sql,[uid])).rows;return out;});res.setHeader('Content-Disposition','attachment; filename="fse-it-export.json"');res.json(data);});
}
