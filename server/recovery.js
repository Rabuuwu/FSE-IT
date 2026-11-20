import {createHash,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import bcrypt from 'bcrypt';
import {transaction} from './transaction.js';
import {invalid,text,validateCredentials} from './validation.js';
export const digestToken=value=>createHash('sha256').update(value).digest('hex');
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export function mailConfigured(env){return Boolean(env.GMAIL_CLIENT_ID&&env.GMAIL_CLIENT_SECRET&&env.GMAIL_REFRESH_TOKEN&&env.MAIL_FROM&&env.PUBLIC_APP_URL);}
export async function sendAccountMail(env,email,purpose,token) {
 const url=new URL('recovery.html',env.PUBLIC_APP_URL.replace(/\/?$/,'/'));
 if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw Error('MAIL_CONFIG_INVALID');
 url.hash=new URLSearchParams({purpose,token}).toString();
 const oauth=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GMAIL_CLIENT_ID,client_secret:env.GMAIL_CLIENT_SECRET,refresh_token:env.GMAIL_REFRESH_TOKEN,grant_type:'refresh_token'}),signal:AbortSignal.timeout(10000)});
 if(!oauth.ok)throw Error('GMAIL_AUTH_FAILED');const credentials=await oauth.json();
 if(!credentials.access_token)throw Error('GMAIL_AUTH_FAILED');
 if(/[\r\n]/.test(email+env.MAIL_FROM))throw Error('MAIL_CONFIG_INVALID');
 const subject=purpose==='verify'?'FSE-IT: verify your email':'FSE-IT: reset your password';
 const raw=Buffer.from(`From: ${env.MAIL_FROM}\r\nTo: ${email}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${url.href}\r\nThis single-use link expires in 30 minutes. If you did not request it, ignore this email.`).toString('base64url');
 const result=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{Authorization:`Bearer ${credentials.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({raw}),signal:AbortSignal.timeout(10000)});
 if(!result.ok)throw Error('GMAIL_SEND_FAILED');
}
export function installRecovery(app,pool,auth,env) {
 const ready=()=>mailConfigured(env)||typeof env.sendAccountMail==='function';
 async function issue(user,purpose) {
  const token=randomBytes(32).toString('base64url');
  const digest=digestToken(token);
  await pool.query(`INSERT INTO account_actions(digest,user_id,email,purpose,expires_at,encrypted_message) VALUES($1,$2,$3,$4,now()+interval '30 minutes',$5) ON CONFLICT(user_id,purpose) DO UPDATE SET digest=$1,email=$3,expires_at=now()+interval '30 minutes',created_at=now(),encrypted_message=$5,delivery_status='queued',delivery_error=NULL WHERE account_actions.created_at < now()-interval '60 seconds'`,[digest,user.id,user.email,purpose,encryptMessage(env,JSON.stringify({email:user.email,purpose,token}))]);
  return true;
 }
 app.get('/account/email',auth,async(req,res)=>{const row=(await pool.query('SELECT email_verified_at FROM users WHERE id=$1',[req.user.user_id])).rows[0];const delivery=(await pool.query('SELECT delivery_status,delivery_error FROM account_actions WHERE user_id=$1 AND expires_at>now() ORDER BY created_at DESC LIMIT 1',[req.user.user_id])).rows[0]||null;res.json({verified:!!row?.email_verified_at,configured:ready(),delivery});});
 app.post('/account/email/request',auth,async(req,res)=>{
  if(!ready())fail(503,'Email service is not configured');
  const user=(await pool.query('SELECT id,email FROM users WHERE id=$1',[req.user.user_id])).rows[0];if(!user)fail(401,'Sign in again');
  await issue(user,'verify');res.status(202).json({message:'Verification requested'});
 });
 app.post('/auth/reset/request',async(req,res)=>{
  if(!ready())fail(503,'Email service is not configured');
  const email=text(req.body?.email,'email',254).toLowerCase();
  const user=(await pool.query('SELECT id,email FROM users WHERE lower(email)=$1 AND email_verified_at IS NOT NULL',[email])).rows[0];
  if(user)await issue(user,'reset');
  res.status(202).json({message:'If a verified account matches, a reset link has been requested'});
 });
 app.post('/auth/actions/confirm',async(req,res)=>{
  const {token,purpose}=req.body||{};if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token)||!['verify','reset'].includes(purpose))invalid('Invalid or expired link');
  const digest=digestToken(token);
  // Validate before doing expensive hashing; transaction rechecks the link under the account lock.
  const action=(await pool.query('SELECT user_id,email FROM account_actions WHERE digest=$1 AND purpose=$2 AND expires_at>now()',[digest,purpose])).rows[0];
  if(!action)invalid('Invalid or expired link');
  let hash;
  if(purpose==='reset'){validateCredentials({email:action.email,password:req.body.password});hash=await bcrypt.hash(req.body.password,Number(env.BCRYPT_SALT_ROUNDS||12));}
  await transaction(pool,async db=>{
   const user=(await db.query('SELECT id,email FROM users WHERE id=$1 FOR UPDATE',[action.user_id])).rows[0];
   const consumed=await db.query('DELETE FROM account_actions WHERE digest=$1 AND purpose=$2 AND expires_at>now() AND email=$3 RETURNING user_id',[digest,purpose,user?.email||'']);
   if(!user||!consumed.rowCount)invalid('Invalid or expired link');
   if(purpose==='verify')await db.query('UPDATE users SET email_verified_at=now() WHERE id=$1',[user.id]);
   else{await db.query('UPDATE users SET password_hash=$2,session_version=session_version+1 WHERE id=$1',[user.id,hash]);await db.query('DELETE FROM account_actions WHERE user_id=$1',[user.id]);}
  });res.json({message:purpose==='verify'?'Email verified':'Password reset. Sign in again'});
 });
 app.post('/auth/logout',auth,async(req,res)=>{await pool.query('INSERT INTO revoked_tokens(digest,expires_at) VALUES($1,to_timestamp($2)) ON CONFLICT DO NOTHING',[req.tokenDigest,req.tokenExpiry]);res.sendStatus(204);});
 app.post('/auth/logout-all',auth,async(req,res)=>{await pool.query('UPDATE users SET session_version=session_version+1 WHERE id=$1',[req.user.user_id]);res.sendStatus(204);});
}

function messageKey(env){return createHash('sha256').update('fse-account-mail-v1:'+env.JWT_SECRET).digest();}
export function encryptMessage(env,value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',messageKey(env),iv);const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64');}
export function decryptMessage(env,value){const bytes=Buffer.from(value,'base64'),decipher=createDecipheriv('aes-256-gcm',messageKey(env),bytes.subarray(0,12));decipher.setAuthTag(bytes.subarray(12,28));return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8');}
export async function deliverAccountMail(pool,env){
 const row=await transaction(pool,async db=>{const row=(await db.query("SELECT digest,encrypted_message FROM account_actions WHERE delivery_status='queued' AND encrypted_message IS NOT NULL AND expires_at>now() ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED")).rows[0];if(row)await db.query("UPDATE account_actions SET delivery_status='sending' WHERE digest=$1",[row.digest]);return row;});
 if(!row)return false;
 let error=null;
 try{const {email,purpose,token}=JSON.parse(decryptMessage(env,row.encrypted_message));await (env.sendAccountMail||((...args)=>sendAccountMail(env,...args)))(email,purpose,token);}catch(e){error=['GMAIL_AUTH_FAILED','GMAIL_SEND_FAILED','MAIL_CONFIG_INVALID'].includes(e.message)?e.message:'MAIL_DELIVERY_FAILED';}
 await pool.query('UPDATE account_actions SET delivery_status=$2,delivery_error=$3,encrypted_message=NULL WHERE digest=$1',[row.digest,error?'failed':'accepted',error]);
 if(error)console.error('account_mail_failed code='+error);return true;
}
