import crypto from 'node:crypto';
import { Pool } from 'pg';
import { resolveTrustedClientIp } from './trusted-client-ip-v1.mjs';

const DATABASE_URL=process.env.DATABASE_URL||'';
const APP_ORIGIN=process.env.APP_ORIGIN||'';
const PUBLIC_URL=String(process.env.ACCOUNT_RECOVERY_PUBLIC_URL||process.env.NOTIFICATION_PUBLIC_URL||APP_ORIGIN||'https://radarlicitacoesbrasil.com.br').split(',')[0].trim();
const RESEND_API_KEY=process.env.RESEND_API_KEY||'';
const EMAIL_FROM=process.env.ACCOUNT_RECOVERY_EMAIL_FROM||process.env.NOTIFICATION_EMAIL_FROM||'';
const PROBE_TO=String(process.env.ACCOUNT_RECOVERY_PROBE_TO||'').trim().toLowerCase();
const PROBE_NONCE=String(process.env.ACCOUNT_RECOVERY_PROBE_NONCE||'').trim();
const IS_TEST=process.env.NODE_ENV==='test';
const TEST_EMAIL_MODE=IS_TEST&&process.env.ACCOUNT_RECOVERY_EMAIL_TEST_MODE==='1';
const pool=DATABASE_URL?new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:2,idleTimeoutMillis:30000}):null;
const rate=new Map();
let initialized=false;

const clean=(v,n=1000)=>String(v??'').trim().slice(0,n);
const emailOf=v=>{const e=clean(v,254).toLowerCase();return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)?e:null};
const sha=v=>crypto.createHash('sha256').update(String(v||'')).digest('hex');
const htmlEsc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const genericResetMessage='Se existir uma conta elegível associada a este e-mail, as instruções de recuperação serão enviadas.';
const allowedRole=role=>role==='user'||role==='admin';
const requestId=()=>`rr-${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}`;
const recipientHash=email=>sha(String(email||'').trim().toLowerCase()).slice(0,24);

function allow(key,limit,windowMs){const now=Date.now(),old=rate.get(key);if(!old||now-old.at>windowMs){rate.set(key,{at:now,count:1});return true}old.count++;return old.count<=limit}
setInterval(()=>{const now=Date.now();for(const[k,v]of rate)if(now-v.at>24*3600000)rate.delete(k)},600000).unref();

function json(res,status,data){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.end(JSON.stringify(data))}
async function readJson(req,max=80000){let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>max)throw Object.assign(new Error('Payload muito grande.'),{status:413});chunks.push(c)}if(!chunks.length)return{};try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw Object.assign(new Error('JSON inválido.'),{status:400})}}
function originOf(req){const host=clean(req.headers.host,300),proto=clean(String(req.headers['x-forwarded-proto']||'').split(',')[0],10).toLowerCase()||((req.socket&&req.socket.encrypted)?'https':'http');if(!host||!['http','https'].includes(proto))return'';try{return new URL(`${proto}://${host}`).origin}catch{return''}}
function configuredOrigins(){return [...new Set(String(APP_ORIGIN||'').split(',').map(x=>{try{return new URL(x.trim()).origin}catch{return''}}).filter(Boolean))]}
function trustedOrigin(req){if(!['POST','PUT','PATCH','DELETE'].includes(String(req.method||'').toUpperCase()))return true;const raw=clean(req.headers.origin,500);if(!raw)return true;let origin='';try{origin=new URL(raw).origin}catch{return false}return origin===originOf(req)||configuredOrigins().includes(origin)}
async function audit(userId,action,metadata={},ip=null){try{await pool.query('INSERT INTO audit_logs(user_id,action,metadata,ip) VALUES($1,$2,$3,$4)',[userId||null,action,metadata,ip||null])}catch(e){console.warn('account recovery delivery audit:',e.message)}}

async function initTables(){
  if(!pool||initialized)return;
  await pool.query(`CREATE TABLE IF NOT EXISTS password_reset_tokens(
    id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT UNIQUE NOT NULL,purpose TEXT NOT NULL CHECK(purpose IN('self_service','admin_assisted')),
    recovery_request_id BIGINT REFERENCES account_recovery_requests(id) ON DELETE SET NULL,
    created_by_admin BIGINT REFERENCES users(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL,used_at TIMESTAMPTZ,revoked_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS account_recovery_email_deliveries(
    id BIGSERIAL PRIMARY KEY,
    request_id TEXT UNIQUE NOT NULL,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    recipient_hash TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'self_service',
    provider TEXT NOT NULL DEFAULT 'resend',
    provider_id TEXT,
    status TEXT NOT NULL,
    last_event TEXT,
    account_source TEXT,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_at TIMESTAMPTZ
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_recovery_email_user ON account_recovery_email_deliveries(user_id,created_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_recovery_email_provider ON account_recovery_email_deliveries(provider_id)');
  initialized=true;
  console.log(`account recovery delivery v3 ready: resend=${RESEND_API_KEY&&EMAIL_FROM?'ready':'missing'}; verified-email lookup=on; provider-status=on`);
}

async function findActiveAccount(email){
  try{
    const r=await pool.query(`SELECT u.id,u.email,u.password_hash,u.role,u.active,
      CASE WHEN LOWER(u.email)=LOWER($1) THEN u.email ELSE np.email END AS recovery_email,
      CASE WHEN LOWER(u.email)=LOWER($1) THEN 'login_email' ELSE 'verified_notification_email' END AS recovery_source
      FROM users u
      LEFT JOIN notification_profiles np ON np.user_id=u.id
      WHERE u.active=TRUE AND u.role IN('user','admin')
        AND (LOWER(u.email)=LOWER($1) OR (np.email_verified_at IS NOT NULL AND LOWER(np.email)=LOWER($1)))
      ORDER BY CASE WHEN LOWER(u.email)=LOWER($1) THEN 0 ELSE 1 END
      LIMIT 1`,[email]);
    return r.rows[0]||null;
  }catch(e){
    if(e?.code!=='42P01')throw e;
    const r=await pool.query(`SELECT id,email,password_hash,role,active,email AS recovery_email,'login_email'::text AS recovery_source FROM users WHERE LOWER(email)=LOWER($1) AND active=TRUE AND role IN('user','admin') LIMIT 1`,[email]);
    return r.rows[0]||null;
  }
}

async function issueToken(user){
  await pool.query('UPDATE password_reset_tokens SET revoked_at=NOW() WHERE user_id=$1 AND used_at IS NULL AND revoked_at IS NULL',[user.id]);
  const raw=crypto.randomBytes(32).toString('base64url'),h=sha(raw);
  const r=await pool.query(`INSERT INTO password_reset_tokens(user_id,token_hash,purpose,expires_at) VALUES($1,$2,'self_service',NOW()+INTERVAL '30 minutes') RETURNING id`,[user.id,h]);
  const u=new URL('/',PUBLIC_URL);u.searchParams.set('reset_token',raw);
  return{id:r.rows[0].id,link:u.href};
}
async function revokeIssuedToken(id){await pool.query('UPDATE password_reset_tokens SET revoked_at=NOW() WHERE id=$1 AND used_at IS NULL',[id]).catch(()=>{})}

async function sendEmail({to,subject,html,text}){
  if(TEST_EMAIL_MODE)return'test-resend-accepted';
  if(!RESEND_API_KEY||!EMAIL_FROM)throw new Error('email_provider_not_configured');
  const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${RESEND_API_KEY}`},signal:AbortSignal.timeout(15000),body:JSON.stringify({from:EMAIL_FROM,to:[to],subject,html,text})});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(clean(d?.message||d?.error?.message||`Resend HTTP ${r.status}`,240));return d?.id||'accepted';
}
async function sendResetEmail(user,link){
  const to=emailOf(user.recovery_email||user.email);if(!to)throw new Error('recovery_recipient_invalid');
  return sendEmail({to,subject:'Redefinição de senha — Radar de Licitações Brasil',text:`Foi solicitada uma redefinição de senha para sua conta. Acesse o link abaixo em até 30 minutos:\n${link}\n\nSe você não solicitou esta alteração, ignore esta mensagem e contate o suporte.`,html:`<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:28px;color:#0f172a"><h2 style="color:#0A2540">Radar de Licitações Brasil</h2><p>Recebemos uma solicitação para redefinir sua senha.</p><p>Use o botão abaixo em até <b>30 minutos</b>. O link funciona uma única vez.</p><p><a href="${htmlEsc(link)}" style="display:inline-block;background:#0A2540;color:white;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">Criar nova senha</a></p><p style="color:#64748b">Se você não solicitou esta alteração, ignore esta mensagem. O Radar nunca envia sua senha atual por e-mail.</p></div>`});
}
async function sendProbeEmail(to){return sendEmail({to,subject:'Teste técnico de entrega — Radar de Licitações Brasil',text:'Este é um teste técnico autorizado de entrega de e-mail do Radar de Licitações Brasil. Nenhuma senha foi alterada.',html:'<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:28px;color:#0f172a"><h2 style="color:#0A2540">Radar de Licitações Brasil</h2><p>Este é um teste técnico autorizado de entrega de e-mail.</p><p>Nenhuma senha foi alterada.</p></div>'})}

async function saveDelivery({rid,userId=null,email,status,providerId=null,lastEvent=null,source=null,error=null,purpose='self_service'}){
  const h=recipientHash(email);
  await pool.query(`INSERT INTO account_recovery_email_deliveries(request_id,user_id,recipient_hash,purpose,provider,provider_id,status,last_event,account_source,error,delivered_at)
    VALUES($1,$2,$3,$4,'resend',$5,$6,$7,$8,$9,CASE WHEN $7='delivered' THEN NOW() ELSE NULL END)
    ON CONFLICT(request_id) DO UPDATE SET user_id=COALESCE(EXCLUDED.user_id,account_recovery_email_deliveries.user_id),provider_id=COALESCE(EXCLUDED.provider_id,account_recovery_email_deliveries.provider_id),status=EXCLUDED.status,last_event=COALESCE(EXCLUDED.last_event,account_recovery_email_deliveries.last_event),account_source=COALESCE(EXCLUDED.account_source,account_recovery_email_deliveries.account_source),error=EXCLUDED.error,delivered_at=CASE WHEN EXCLUDED.last_event='delivered' THEN COALESCE(account_recovery_email_deliveries.delivered_at,NOW()) ELSE account_recovery_email_deliveries.delivered_at END,updated_at=NOW()`,[rid,userId,h,purpose,providerId,status,lastEvent,source,error]);
}

async function retrieveResendEmail(providerId){
  if(TEST_EMAIL_MODE)return{last_event:'delivered',id:providerId};
  if(!RESEND_API_KEY||!providerId||providerId==='accepted')return null;
  const r=await fetch(`https://api.resend.com/emails/${encodeURIComponent(providerId)}`,{headers:{Authorization:`Bearer ${RESEND_API_KEY}`},signal:AbortSignal.timeout(12000)});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(clean(d?.message||`Resend status HTTP ${r.status}`,200));return d;
}
async function listRecentResendFor(email){
  if(TEST_EMAIL_MODE)return null;
  if(!RESEND_API_KEY)return null;
  const r=await fetch('https://api.resend.com/emails?limit=100',{headers:{Authorization:`Bearer ${RESEND_API_KEY}`},signal:AbortSignal.timeout(12000)});
  const d=await r.json().catch(()=>({}));if(!r.ok)return null;
  const wanted=email.toLowerCase();
  return (Array.isArray(d?.data)?d.data:[]).find(x=>Array.isArray(x?.to)&&x.to.some(v=>String(v).toLowerCase()===wanted))||null;
}
async function refreshDelivery(rid,providerId,email,userId,source,purpose='self_service'){
  try{
    const d=await retrieveResendEmail(providerId);if(!d)return;
    const ev=clean(d.last_event||'unknown',80)||'unknown';
    await saveDelivery({rid,userId,email,status:ev==='delivered'?'delivered':'accepted',providerId,lastEvent:ev,source,purpose});
    console.info(`account recovery delivery status: request_id=${rid} provider_id=${providerId} last_event=${ev}`);
  }catch(e){console.warn(`account recovery delivery status failed: request_id=${rid} error=${clean(e.message,180)}`)}
}
function scheduleDeliveryRefresh(args){for(const delay of [5000,20000]){const t=setTimeout(()=>refreshDelivery(...args).catch(()=>{}),delay);t.unref?.()}}

async function requestReset(req,res,ip){
  const rid=requestId(),body=await readJson(req,60000),email=emailOf(body.email),h=email?recipientHash(email):'invalid';
  console.info(`account recovery request received: request_id=${rid} recipient_hash=${h}`);
  if(!allow('reset3-ip:'+ip,5,15*60000)||!allow('reset3-email:'+h,3,60*60000)){
    console.warn(`account recovery request rate-limited: request_id=${rid} recipient_hash=${h}`);
    return json(res,200,{ok:true,message:genericResetMessage});
  }
  if(!email){console.warn(`account recovery request invalid-email: request_id=${rid}`);return json(res,200,{ok:true,message:genericResetMessage})}
  const user=await findActiveAccount(email);
  if(!user){console.info(`account recovery account match: request_id=${rid} matched=no recipient_hash=${h}`);await saveDelivery({rid,email,status:'account_not_found',error:null,purpose:'self_service'});return json(res,200,{ok:true,message:genericResetMessage})}
  console.info(`account recovery account match: request_id=${rid} matched=yes user_id=${user.id} role=${user.role} source=${user.recovery_source}`);
  const issued=await issueToken(user);
  try{
    const providerId=await sendResetEmail(user,issued.link),to=user.recovery_email||user.email;
    await saveDelivery({rid,userId:user.id,email:to,status:'accepted',providerId,source:user.recovery_source,purpose:'self_service'});
    console.info(`account recovery email accepted: request_id=${rid} user_id=${user.id} role=${user.role} provider=resend provider_id=${providerId}`);
    await audit(user.id,'user.password_reset_requested',{method:'self_service',role:user.role,delivery_status:'accepted',provider:'resend',provider_id:providerId,request_id:rid,account_source:user.recovery_source},ip);
    scheduleDeliveryRefresh([rid,providerId,to,user.id,user.recovery_source,'self_service']);
  }catch(e){
    await revokeIssuedToken(issued.id);await saveDelivery({rid,userId:user.id,email:user.recovery_email||user.email,status:'failed',source:user.recovery_source,error:clean(e.message,180),purpose:'self_service'});
    console.error(`account recovery email delivery failed: request_id=${rid} user_id=${user.id} role=${user.role} provider=resend error=${clean(e.message,240)}`);
    await audit(user.id,'user.password_reset_delivery_failed',{method:'self_service',role:user.role,provider:'resend',error:clean(e.message,160),request_id:rid},ip);
  }
  return json(res,200,{ok:true,message:genericResetMessage});
}

async function runProbe(){
  const to=emailOf(PROBE_TO),nonce=clean(PROBE_NONCE,120);if(!to||!nonce||!pool)return;
  const rid=`probe:${nonce}`;
  const prior=await pool.query(`INSERT INTO account_recovery_email_deliveries(request_id,recipient_hash,purpose,provider,status) VALUES($1,$2,'diagnostic','resend','starting') ON CONFLICT(request_id) DO NOTHING RETURNING id`,[rid,recipientHash(to)]);
  if(!prior.rowCount)return;
  try{
    const previous=await listRecentResendFor(to);
    console.info(`account recovery probe history: recipient_hash=${recipientHash(to)} previous=${previous?`yes provider_id=${previous.id} last_event=${clean(previous.last_event||'unknown',80)}`:'no'}`);
    const user=await findActiveAccount(to);
    let providerId,source='diagnostic_only',userId=null;
    if(user){
      userId=user.id;source=user.recovery_source;const issued=await issueToken(user);providerId=await sendResetEmail(user,issued.link);
      console.info(`account recovery probe account match: matched=yes user_id=${user.id} role=${user.role} source=${source}`);
    }else{
      providerId=await sendProbeEmail(to);
      console.warn(`account recovery probe account match: matched=no recipient_hash=${recipientHash(to)}; diagnostic email sent without reset token`);
    }
    await saveDelivery({rid,userId,email:to,status:'accepted',providerId,source,purpose:'diagnostic'});
    console.info(`account recovery probe accepted: recipient_hash=${recipientHash(to)} provider_id=${providerId}`);
    scheduleDeliveryRefresh([rid,providerId,to,userId,source,'diagnostic']);
  }catch(e){
    await saveDelivery({rid,email:to,status:'failed',error:clean(e.message,180),purpose:'diagnostic'}).catch(()=>{});
    console.error(`account recovery probe failed: recipient_hash=${recipientHash(to)} error=${clean(e.message,240)}`);
  }
}

export async function initAccountRecoveryDeliveryV3(){if(!pool)return;await initTables();setTimeout(()=>runProbe().catch(e=>console.error('account recovery probe init:',e.message)),1000).unref?.()}
export async function handleAccountRecoveryDeliveryV3Route(req,res,url){
  if(url.pathname!=='/api/account-recovery/request-reset')return false;
  if(!pool){json(res,503,{error:'Recuperação de conta indisponível temporariamente.'});return true}
  const ip=resolveTrustedClientIp(req).ip;
  try{
    await initTables();
    if(!trustedOrigin(req)){json(res,403,{error:'Origem não autorizada.',code:'origin_not_authorized'});return true}
    if(req.method==='POST'){await requestReset(req,res,ip);return true}
    json(res,405,{error:'Método não permitido.'});return true;
  }catch(e){console.error('account recovery delivery v3:',e?.stack||e);if(!res.headersSent)json(res,e?.status||500,{error:e?.status?e.message:'Erro interno na recuperação de conta.'});else try{res.end()}catch{}return true}
}

export const __test={emailOf,recipientHash,allowedRole};
