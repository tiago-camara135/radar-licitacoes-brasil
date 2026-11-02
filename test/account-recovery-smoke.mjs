import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {Pool} from 'pg';

const base='http://127.0.0.1:10000';
const origin=base;
const db=new Pool({connectionString:process.env.DATABASE_URL,ssl:false});
async function req(path,opt={}){return fetch(base+path,{redirect:'manual',...opt})}
async function wait(){for(let i=0;i<50;i++){try{const r=await req('/api/health');if(r.ok)return}catch{}await new Promise(r=>setTimeout(r,250))}throw new Error('Servidor não ficou pronto')}
function cookieFrom(r){return String(r.headers.get('set-cookie')||'').split(';')[0]}
async function post(path,body,cookie=''){return req(path,{method:'POST',headers:{'content-type':'application/json',origin,...(cookie?{cookie}:{})},body:JSON.stringify(body)})}

await wait();
const suffix=crypto.randomBytes(5).toString('hex');
const userEmail=`recovery-user-${suffix}@example.com`;
const adminEmail=`recovery-admin-${suffix}@example.com`;
const oldPass='InitialPassword!123';
const newPass='NovaSenhaSegura!456';
let userCookie='',adminCookie='',userId=null,adminId=null;
try{
  const asset=await req('/assets/admin-user-support-v1.js');
  assert.equal(asset.status,200);
  assert.equal(asset.headers.get('x-rlb-account-recovery'),'v1');
  const assetText=await asset.text();
  assert.match(assetText,/__rlbAccountRecoveryV1/);
  assert.match(assetText,/Esqueceu sua senha\?/);

  let r=await post('/api/auth/register',{email:userEmail,password:oldPass});
  assert.equal(r.status,201);userCookie=cookieFrom(r);userId=(await r.json()).user.id;
  r=await post('/api/auth/register',{email:adminEmail,password:'AdminPassword!123'});
  assert.equal(r.status,201);adminCookie=cookieFrom(r);adminId=(await r.json()).user.id;
  await db.query("UPDATE users SET role='admin' WHERE id=$1",[adminId]);

  const known=await post('/api/account-recovery/request-reset',{email:userEmail});
  const unknown=await post('/api/account-recovery/request-reset',{email:`unknown-${suffix}@example.com`});
  assert.equal(known.status,200);assert.equal(unknown.status,200);
  assert.equal((await known.json()).message,(await unknown.json()).message,'public reset response must not enumerate users');

  const pdf=Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF');
  r=await post('/api/account-recovery/assisted-request',{email:userEmail,full_name:'Usuário de QA',reason:'Teste autorizado de recuperação assistida de conta.',document_filename:'identificacao.pdf',document_content_base64:pdf.toString('base64'),consent:true});
  assert.equal(r.status,202);const assisted=await r.json();assert.match(assisted.protocol,/^RLB-\d{4}-[A-F0-9]{12}$/);

  const encrypted=await db.query('SELECT document_cipher FROM account_recovery_requests WHERE protocol=$1',[assisted.protocol]);
  assert.equal(encrypted.rows.length,1);assert.ok(encrypted.rows[0].document_cipher);
  assert.notEqual(Buffer.from(encrypted.rows[0].document_cipher).subarray(0,4).toString(),'%PDF','recovery document must be encrypted at application layer');

  r=await req('/api/account-recovery/admin/requests?status=pending',{headers:{cookie:adminCookie}});
  assert.equal(r.status,200);const list=await r.json();const item=list.items.find(x=>x.protocol===assisted.protocol);assert.ok(item);
  const serialized=JSON.stringify(list);assert.doesNotMatch(serialized,/password_hash/i);assert.doesNotMatch(serialized,/InitialPassword/i);

  r=await req(`/api/account-recovery/admin/requests/${item.id}/document`,{headers:{cookie:adminCookie}});
  assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'application/pdf');assert.ok((await r.arrayBuffer()).byteLength>10);

  r=await post(`/api/account-recovery/admin/requests/${item.id}/decision`,{action:'approve',delivery_mode:'manual',note:'Identidade conferida no teste de segurança.'},adminCookie);
  assert.equal(r.status,200);const approved=await r.json();assert.ok(approved.handoff_link);const token=new URL(approved.handoff_link).searchParams.get('reset_token');assert.ok(token&&token.length>30);

  r=await req('/api/account-recovery/token-status?token='+encodeURIComponent(token));assert.equal(r.status,200);assert.equal((await r.json()).valid,true);
  r=await req('/api/me',{headers:{cookie:userCookie}});assert.equal(r.status,200,'session should still exist before reset completion');

  r=await post('/api/account-recovery/complete-reset',{token,password:newPass,confirm_password:newPass});
  assert.equal(r.status,200);assert.equal((await r.json()).ok,true);

  r=await req('/api/me',{headers:{cookie:userCookie}});assert.equal(r.status,401,'all previous sessions must be revoked after reset');
  r=await post('/api/auth/login',{email:userEmail,password:oldPass});assert.equal(r.status,401,'old password must stop working');
  r=await post('/api/auth/login',{email:userEmail,password:newPass});assert.equal(r.status,200,'new password must work');

  r=await post('/api/account-recovery/complete-reset',{token,password:'OutraSenhaSegura!789',confirm_password:'OutraSenhaSegura!789'});assert.equal(r.status,400,'reset token must be single-use');
  r=await fetch(base+'/api/account-recovery/assisted-request',{method:'POST',headers:{'content-type':'application/json',origin:'https://cross-origin.invalid'},body:JSON.stringify({})});assert.equal(r.status,403,'cross-origin recovery writes must be blocked');

  const audits=await db.query(`SELECT action FROM audit_logs WHERE user_id IN($1,$2) AND action IN('admin.recovery_document_view','admin.recovery_approved','user.password_reset_completed')`,[userId,adminId]);
  const actions=new Set(audits.rows.map(x=>x.action));assert.ok(actions.has('admin.recovery_document_view'));assert.ok(actions.has('admin.recovery_approved'));assert.ok(actions.has('user.password_reset_completed'));
  console.log('account recovery smoke passed: encrypted document, admin approval, single-use reset, session revocation and audit verified');
}finally{
  if(userId||adminId)await db.query('DELETE FROM users WHERE id = ANY($1::bigint[])',[[userId,adminId].filter(Boolean)]).catch(()=>{});
  await db.end();
}
