import {requireAdmin} from '../auth.js';
import {transaction} from './transaction.js';
import {materialInput,positiveId,revisionInput,reviewInput,listInput} from './validation.js';
import {metadataInput} from './learning-validation.js';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export function installRevisions(app,pool,auth,writeRelations) {
 async function locked(db,req,id){const row=(await db.query('SELECT * FROM materials WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!row||(row.created_by!==req.user.user_id&&req.user.role!=='admin'))fail(404,'Material not found');return row;}
 app.get('/materials/:id/revision',auth,async(req,res)=>{const id=positiveId(req.params.id);const result=await transaction(pool,async db=>{await locked(db,req,id);return (await db.query('SELECT revision,status,payload,review_note FROM material_revisions WHERE material_id=$1',[id])).rows[0]||null;});res.json({draft:result});});
 app.put('/materials/:id/revision',auth,async(req,res)=>{
  const id=positiveId(req.params.id),input=materialInput(req.body),metadata=metadataInput(req.body.metadata),revision=revisionInput(req.body);
  const result=await transaction(pool,async db=>{const current=await locked(db,req,id);if(!current.published)fail(409,'Use the regular editor for unpublished materials');
   const draft=(await db.query('SELECT revision FROM material_revisions WHERE material_id=$1',[id])).rows[0];
   if(revision!==current.revision||(draft&&req.body.draft_revision!==draft.revision))fail(409,'Version changed. Reload before saving');
   return (await db.query(`INSERT INTO material_revisions(material_id,author_id,base_version,payload) VALUES($1,$2,$3,$4) ON CONFLICT(material_id) DO UPDATE SET payload=$4,base_version=$3,revision=material_revisions.revision+1,status='private',review_note=NULL,updated_at=now() RETURNING revision,status`,[id,req.user.user_id,current.content_version,JSON.stringify({...input,metadata})])).rows[0];});res.json(result);
 });
 app.post('/materials/:id/revision/submit',auth,async(req,res)=>{const id=positiveId(req.params.id),revision=revisionInput(req.body);await transaction(pool,async db=>{await locked(db,req,id);const result=await db.query("UPDATE material_revisions SET status='pending',revision=revision+1,updated_at=now() WHERE material_id=$1 AND revision=$2 AND status IN ('private','rejected')",[id,revision]);if(!result.rowCount)fail(409,'Draft changed. Reload');});res.sendStatus(204);});
 app.get('/admin/revisions',auth,requireAdmin,async(req,res)=>{const {page,limit}=listInput(req.query);res.json({items:(await pool.query("SELECT d.material_id,d.revision,d.payload,m.title FROM material_revisions d JOIN materials m ON m.id=d.material_id WHERE d.status='pending' ORDER BY d.updated_at LIMIT $1 OFFSET $2",[limit,(page-1)*limit])).rows,page,limit});});
 app.post('/admin/materials/:id/revision/review',auth,requireAdmin,async(req,res)=>{const id=positiveId(req.params.id),decision=reviewInput(req.body);await transaction(pool,async db=>{const current=await locked(db,req,id),draft=(await db.query('SELECT * FROM material_revisions WHERE material_id=$1',[id])).rows[0];if(!draft||draft.status!=='pending'||draft.revision!==decision.revision||draft.base_version!==current.content_version||!current.published)fail(409,'Published content or draft changed');
  if(decision.decision==='approve'){
   const stages=(await db.query('SELECT position,title,content FROM material_stages WHERE material_id=$1 ORDER BY position',[id])).rows;
   const tags=(await db.query('SELECT t.name FROM tags t JOIN material_tags mt ON mt.tag_id=t.id WHERE mt.material_id=$1 ORDER BY t.name',[id])).rows.map(x=>x.name);
   await db.query('INSERT INTO material_versions(material_id,content_version,payload) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[id,current.content_version,JSON.stringify({...current,stages,tags})]);
   const p=draft.payload;
   await db.query('UPDATE materials SET type=$2,title=$3,description=$4,author=$5,url=$6,content=$7,metadata=$8,content_version=content_version+1,revision=revision+1,updated_at=now(),reviewed_at=now(),reviewed_by=$9 WHERE id=$1',[id,p.type,p.title,p.description,p.author,p.url,p.content,JSON.stringify(p.metadata),req.user.user_id]);
   await writeRelations(db,id,p);await db.query('DELETE FROM material_revisions WHERE material_id=$1',[id]);
  }else await db.query("UPDATE material_revisions SET status='rejected',review_note=$2,revision=revision+1 WHERE material_id=$1",[id,decision.note]);
  await db.query('INSERT INTO moderation_events(material_id,actor_id,action,note) VALUES($1,$2,$3,$4)',[id,req.user.user_id,`revision_${decision.decision}`,decision.note]);
  if(current.created_by)await db.query('INSERT INTO notifications(user_id,material_id,message) VALUES($1,$2,$3)',[current.created_by,id,decision.decision==='approve'?'Opublikowano nową wersję materiału.':`Nowa wersja wymaga poprawy: ${decision.note}`]);
 });res.sendStatus(204);});
 app.get('/materials/:id/versions',auth,async(req,res)=>{const id=positiveId(req.params.id),{page,limit}=listInput(req.query);const items=await transaction(pool,async db=>{await locked(db,req,id);return (await db.query('SELECT content_version,payload,archived_at FROM material_versions WHERE material_id=$1 ORDER BY content_version DESC LIMIT $2 OFFSET $3',[id,limit,(page-1)*limit])).rows;});res.json({items,page,limit});});
}
