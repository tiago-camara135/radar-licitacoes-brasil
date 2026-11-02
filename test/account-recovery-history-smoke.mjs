import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {Pool} from 'pg';

const base='http://127.0.0.1:10000';
const origin=base;
const db=new Pool({connectionString:process.env.DATABASE_URL,ssl:false});
const suffix=crypto.randomBytes(5).toString('hex');
const userEmail=`history-user-${suffix}@example.com`;
const adminEmail=`history-admin-${suffix}@example.com`;
const password='HistoryPassword!123';
let userId=null,adminId=null,adminCookie='';
async function req(path,opt={}){return fetch(base+path,{redirect:'manual',...opt})}
async function wait(){for(let i=0;i<50;i++){try{const r=await req('/api/health');if(r.ok)return}catch{}await new Promise(r=>setTimeout(r,250))}throw new Error('Servidor não ficou pronto')}
function cookieFrom(r){return String(r.headers.get('set-cookie')||'').split(';')[0]}
async function post(path,body,cookie='',requestOrigin=origin){return req(path,{method:'POST',headers:{'content-type':'application/json',origin:requestOrigin,...(cookie?{cookie}:{})},body:JSON.stringify(body)})}

await wait();
try{
  let r=await post('/api/auth/register',{email:userEmail,password});assert.equal(r.status,201);userId=(await r.json()).user.id;
  r=await post('/api/auth/register',{email:adminEmail,password});assert.equal(r.status,201);adminId=(await r.json()).user.id;adminCookie=cookieFrom(r);
  await db.query("UPDATE users SET role='admin' WHERE id=$1",[adminId]);

  r=await post('/api/account-recovery/request-reset',{email:userEmail});assert.equal(r.status,200);
  const ledger=await db.query(`SELECT id,status,provider_id FROM account_recovery_email_deliveries WHERE user_id=$1 ORDER BY id DESC LIMIT 1`,[userId]);
  assert.equal(ledger.rows.length,1);assert.equal(ledger.rows[0].status,'accepted');assert.ok(ledger.rows[0].provider_id);

  r=await req('/api/account-recovery/admin/email-deliveries',{headers:{cookie:adminCookie}});assert.equal(r.status,200);const data=await r.json();
  assert.ok(Array.isArray(data.items));assert.ok(data.items.some(x=>Number(x.user_id)===Number(userId)));
  assert.equal(data.provider_read?.available,true,'test mode should expose readable provider events');
  assert.ok(Array.isArray(data.audit));

  r=await post('/api/account-recovery/admin/email-deliveries/refresh',{},adminCookie);assert.equal(r.status,200);const refreshed=await r.json();assert.equal(refreshed.ok,true);
  const after=await db.query(`SELECT status,last_event FROM account_recovery_email_deliveries WHERE user_id=$1 ORDER BY id DESC LIMIT 1`,[userId]);
  assert.equal(after.rows[0].status,'delivered');assert.equal(after.rows[0].last_event,'delivered');

  r=await req('/assets/admin-user-support-v1.js');assert.equal(r.status,200);assert.equal(r.headers.get('x-rlb-recovery-history'),'v1');const js=await r.text();
  assert.match(js,/__rlbRecoveryDeliveryHistoryV1/);assert.match(js,/Histórico de recuperação/);assert.match(js,/data-rh-tab/);assert.match(js,/Recuperações/);assert.match(js,/\.acc-nav/);assert.match(js,/#accPanel/);
  r=await req('/assets/admin-user-support-v1.css');assert.equal(r.status,200);const css=await r.text();assert.match(css,/\.rh-panel/);assert.match(css,/html\[data-theme="dark"\]/);

  r=await post('/api/account-recovery/admin/email-deliveries/refresh',{},adminCookie,'https://cross-origin.invalid');assert.equal(r.status,403,'cross-origin admin refresh must be blocked');
  const audit=await db.query(`SELECT action FROM audit_logs WHERE user_id=$1 AND action='admin.account_recovery_provider_refresh' ORDER BY id DESC LIMIT 1`,[adminId]);assert.equal(audit.rows[0]?.action,'admin.account_recovery_provider_refresh');
  console.log('account recovery history smoke passed: native Admin tab, ledger, provider status, audit, adaptive asset and origin guard verified');
}finally{
  if(userId||adminId)await db.query('DELETE FROM users WHERE id = ANY($1::bigint[])',[[userId,adminId].filter(Boolean)]).catch(()=>{});
  await db.end();
}
