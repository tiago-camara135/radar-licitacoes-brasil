import { Pool } from 'pg';

const PORT=Number(process.env.PORT||10000);
const DATABASE_URL=process.env.DATABASE_URL||'';
const RESEND_API_KEY=process.env.RESEND_API_KEY||'';
const TEST_EMAIL_MODE=process.env.NODE_ENV==='test'&&process.env.ACCOUNT_RECOVERY_EMAIL_TEST_MODE==='1';
const pool=DATABASE_URL?new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:2,idleTimeoutMillis:30000}):null;
let initialized=false;
let capabilityCache={checkedAt:0,readable:null,reason:null};

const clean=(v,n=500)=>String(v??'').trim().slice(0,n);
function json(res,status,data){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(data))}
async function authenticatedUser(req){try{const r=await fetch(`http://127.0.0.1:${PORT}/api/me`,{headers:{cookie:String(req.headers.cookie||'')},signal:AbortSignal.timeout(5000)});if(!r.ok)return null;const d=await r.json().catch(()=>({}));return d.user||null}catch{return null}}
async function adminUser(req){const u=await authenticatedUser(req);return u?.role==='admin'&&u?.active!==false?u:null}
async function audit(userId,action,metadata={}){try{await pool.query('INSERT INTO audit_logs(user_id,action,metadata,ip) VALUES($1,$2,$3,NULL)',[userId,action,metadata])}catch(e){console.warn('recovery admin history audit:',e.message)}}

async function initTables(){if(!pool||initialized)return;await pool.query(`CREATE TABLE IF NOT EXISTS account_recovery_email_deliveries(
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
)`);initialized=true;console.log('account recovery admin history v1 ready: delivery ledger + provider capability + audit timeline')}

async function providerCapability(force=false){const now=Date.now();if(!force&&now-capabilityCache.checkedAt<300000&&capabilityCache.readable!==null)return capabilityCache;if(TEST_EMAIL_MODE){capabilityCache={checkedAt:now,readable:true,reason:'test_mode'};return capabilityCache}if(!RESEND_API_KEY){capabilityCache={checkedAt:now,readable:false,reason:'provider_not_configured'};return capabilityCache}try{const r=await fetch('https://api.resend.com/emails?limit=1',{headers:{Authorization:`Bearer ${RESEND_API_KEY}`},signal:AbortSignal.timeout(10000)});const d=await r.json().catch(()=>({}));if(r.ok){capabilityCache={checkedAt:now,readable:true,reason:null};return capabilityCache}const message=clean(d?.message||d?.error?.message||`HTTP ${r.status}`,180);capabilityCache={checkedAt:now,readable:false,reason:message};return capabilityCache}catch(e){capabilityCache={checkedAt:now,readable:false,reason:clean(e.message,180)};return capabilityCache}}

async function readProviderEvent(providerId){if(TEST_EMAIL_MODE)return{last_event:'delivered'};const cap=await providerCapability();if(!cap.readable)throw Object.assign(new Error(cap.reason||'provider_read_unavailable'),{code:'provider_read_unavailable'});const r=await fetch(`https://api.resend.com/emails/${encodeURIComponent(providerId)}`,{headers:{Authorization:`Bearer ${RESEND_API_KEY}`},signal:AbortSignal.timeout(10000)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(clean(d?.message||`Resend HTTP ${r.status}`,180));return d}
function normalizedStatus(event,current='accepted'){const ev=clean(event,80).toLowerCase();if(!ev)return current;if(['delivered','bounced','suppressed','delayed','complained','canceled','scheduled','sent'].includes(ev))return ev;return current}
async function updateDeliveryFromProvider(row){if(!row?.provider_id)return row;const d=await readProviderEvent(row.provider_id),event=clean(d?.last_event||'',80)||null,status=normalizedStatus(event,row.status);const r=await pool.query(`UPDATE account_recovery_email_deliveries SET last_event=$2,status=$3,delivered_at=CASE WHEN $2='delivered' THEN COALESCE(delivered_at,NOW()) ELSE delivered_at END,updated_at=NOW() WHERE id=$1 RETURNING *`,[row.id,event,status]);return r.rows[0]||row}

async function listHistory(limit){const n=Math.max(10,Math.min(Number(limit)||100,200));const [deliveries,auditRows,stats,cap]=await Promise.all([
  pool.query(`SELECT d.id,d.request_id,d.user_id,u.email,u.role,u.active,d.recipient_hash,d.purpose,d.provider,d.provider_id,d.status,d.last_event,d.account_source,d.error,d.created_at,d.updated_at,d.delivered_at FROM account_recovery_email_deliveries d LEFT JOIN users u ON u.id=d.user_id ORDER BY d.id DESC LIMIT $1`,[n]),
  pool.query(`SELECT a.id,a.action,a.metadata,a.created_at,u.email FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id WHERE a.action IN ('user.password_reset_requested','user.password_reset_delivery_failed','user.password_reset_completed','admin.account_recovery_provider_refresh') ORDER BY a.id DESC LIMIT 100`),
  pool.query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE status='accepted')::int accepted,COUNT(*) FILTER(WHERE status='delivered')::int delivered,COUNT(*) FILTER(WHERE status IN('bounced','suppressed','failed'))::int failed,COUNT(*) FILTER(WHERE status='account_not_found')::int not_found FROM account_recovery_email_deliveries`),
  providerCapability()
]);
  const audit=auditRows.rows.map(x=>({id:x.id,action:x.action,email:x.email||null,created_at:x.created_at,metadata:{method:x.metadata?.method||null,role:x.metadata?.role||null,delivery_status:x.metadata?.delivery_status||null,provider:x.metadata?.provider||null,provider_id:x.metadata?.provider_id||null,request_id:x.metadata?.request_id||null,account_source:x.metadata?.account_source||null,sessions_revoked:x.metadata?.sessions_revoked??null,recovery_request_id:x.metadata?.recovery_request_id??null}}));
  return{items:deliveries.rows,audit,stats:stats.rows[0]||{},provider_read:{available:Boolean(cap.readable),reason:cap.reason||null}};
}

async function refreshOne(id,admin){const r=await pool.query('SELECT * FROM account_recovery_email_deliveries WHERE id=$1 LIMIT 1',[id]);const row=r.rows[0];if(!row)throw Object.assign(new Error('Registro de entrega não encontrado.'),{status:404});if(!row.provider_id)throw Object.assign(new Error('Este registro não possui identificador do provedor.'),{status:400});try{const updated=await updateDeliveryFromProvider(row);await audit(admin.id,'admin.account_recovery_provider_refresh',{delivery_id:Number(id),provider_id:row.provider_id,last_event:updated.last_event||null});return{ok:true,item:updated}}catch(e){if(e.code==='provider_read_unavailable')return{ok:false,code:'provider_read_unavailable',message:'A chave atual do Resend permite envio, mas não permite consultar o evento final.'};throw e}}
async function refreshRecent(admin){const cap=await providerCapability(true);if(!cap.readable)return{ok:false,code:'provider_read_unavailable',message:'A chave atual do Resend permite envio, mas não permite consultar o evento final.',reason:cap.reason||null};const r=await pool.query(`SELECT * FROM account_recovery_email_deliveries WHERE provider_id IS NOT NULL AND COALESCE(last_event,'') NOT IN('delivered','bounced','suppressed','complained','canceled') ORDER BY id DESC LIMIT 12`);let updated=0;for(const row of r.rows){try{await updateDeliveryFromProvider(row);updated++}catch(e){console.warn('recovery provider refresh item:',e.message)}}await audit(admin.id,'admin.account_recovery_provider_refresh',{scope:'recent',updated});return{ok:true,updated}}

export async function initAccountRecoveryAdminHistory(){if(!pool)return;await initTables()}
export async function handleAccountRecoveryAdminHistoryRoute(req,res,url){if(!url.pathname.startsWith('/api/account-recovery/admin/email-deliveries'))return false;if(!pool){json(res,503,{error:'Histórico de recuperação indisponível temporariamente.'});return true}try{await initTables();const admin=await adminUser(req);if(!admin){json(res,403,{error:'Acesso restrito ao administrador.'});return true}if(req.method==='GET'&&url.pathname==='/api/account-recovery/admin/email-deliveries'){json(res,200,await listHistory(url.searchParams.get('limit')));return true}if(req.method==='POST'&&url.pathname==='/api/account-recovery/admin/email-deliveries/refresh'){json(res,200,await refreshRecent(admin));return true}const m=url.pathname.match(/^\/api\/account-recovery\/admin\/email-deliveries\/(\d+)\/refresh$/);if(req.method==='POST'&&m){json(res,200,await refreshOne(m[1],admin));return true}json(res,405,{error:'Método não permitido.'});return true}catch(e){console.error('account recovery admin history:',e?.stack||e);json(res,e?.status||500,{error:e?.status?e.message:'Erro interno no histórico de recuperação.'});return true}}
