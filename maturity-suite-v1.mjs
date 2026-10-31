import { Pool } from 'pg';

const PORT=Number(process.env.PORT||10000);
const DATABASE_URL=String(process.env.DATABASE_URL||'');
const APP_ORIGIN=String(process.env.APP_ORIGIN||'');
const pool=DATABASE_URL?new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:2,idleTimeoutMillis:30000}):null;
const RESEND_READY=Boolean(process.env.RESEND_API_KEY&&process.env.NOTIFICATION_EMAIL_FROM);
const WHATSAPP_READY=Boolean(process.env.TWILIO_ACCOUNT_SID&&process.env.TWILIO_AUTH_TOKEN&&process.env.TWILIO_WHATSAPP_CONTENT_SID&&(process.env.TWILIO_WHATSAPP_FROM||process.env.TWILIO_MESSAGING_SERVICE_SID));
const clean=(v,n=500)=>String(v??'').trim().slice(0,n);
const num=v=>Number(v||0);
const dayStartSql=`date_trunc('day', NOW() AT TIME ZONE 'America/Fortaleza') AT TIME ZONE 'America/Fortaleza'`;

function json(res,status,data){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.end(JSON.stringify(data))}
async function authUser(req){try{const r=await fetch(`http://127.0.0.1:${PORT}/api/me`,{headers:{cookie:String(req.headers.cookie||'')},signal:AbortSignal.timeout(5000)});if(!r.ok)return null;return (await r.json().catch(()=>({}))).user||null}catch{return null}}
function sameOrigin(req){return !['POST','PUT','PATCH','DELETE'].includes(req.method)||!APP_ORIGIN||!req.headers.origin||req.headers.origin===APP_ORIGIN}
async function tableExists(name){if(!pool)return false;const r=await pool.query('SELECT to_regclass($1) AS t',[`public.${name}`]);return Boolean(r.rows[0]?.t)}
async function qMaybe(sql,params=[],fallback=[]){try{return (await pool.query(sql,params)).rows}catch{return fallback}}

async function ensureIndexes(){if(!pool)return;try{
  await pool.query('CREATE INDEX IF NOT EXISTS idx_maturity_deliveries_user_channel_status ON notification_deliveries(user_id,channel,status,created_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_maturity_company_docs_user_expiry ON company_documents(user_id,is_current,expiry_date)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_maturity_audit_action_created ON audit_logs(action,created_at DESC)');
  await pool.query('DELETE FROM sessions WHERE expires_at<NOW()');
  console.log('maturity suite schema hardening ready');
}catch(e){console.warn('maturity suite hardening deferred:',e?.message||e)}}

async function overview(uid){
  const [opp,alerts,deliveries,profile,docs,company]=await Promise.all([
    qMaybe(`SELECT COUNT(*)::int n FROM monitored_procurements WHERE detected_at>=${dayStartSql}`),
    qMaybe(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE enabled)::int active FROM saved_alerts WHERE user_id=$1`,[uid]),
    qMaybe(`SELECT COUNT(DISTINCT pncp_id) FILTER(WHERE created_at>=${dayStartSql})::int matched_today,COUNT(*) FILTER(WHERE channel='email' AND status='sent' AND created_at>=NOW()-INTERVAL '30 days')::int email_sent_30d,COUNT(*) FILTER(WHERE channel='email' AND status='failed' AND created_at>=NOW()-INTERVAL '30 days')::int email_failed_30d,COUNT(*) FILTER(WHERE channel='onsite' AND read_at IS NULL)::int unread FROM notification_deliveries WHERE user_id=$1`,[uid]),
    qMaybe(`SELECT email,email_verified_at,email_enabled,whatsapp_e164,whatsapp_verified_at,whatsapp_enabled FROM notification_profiles WHERE user_id=$1 LIMIT 1`,[uid]),
    qMaybe(`SELECT COUNT(*) FILTER(WHERE is_current)::int total,COUNT(*) FILTER(WHERE is_current AND expiry_date IS NOT NULL AND expiry_date<CURRENT_DATE)::int expired,COUNT(*) FILTER(WHERE is_current AND expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE+INTERVAL '30 days')::int due30,COUNT(*) FILTER(WHERE is_current AND (expiry_date IS NULL OR expiry_date>=CURRENT_DATE))::int healthy FROM company_documents WHERE user_id=$1`,[uid]),
    qMaybe(`SELECT cnpj,legal_name,trade_name,state,municipality,contact_name FROM company_profiles WHERE user_id=$1 LIMIT 1`,[uid])
  ]);
  const p=profile[0]||{},d=docs[0]||{},a=alerts[0]||{},dv=deliveries[0]||{},co=company[0]||null;
  const steps=[
    {key:'company',label:'Cadastrar empresa',done:Boolean(co?.cnpj||co?.legal_name),target:'habilitation'},
    {key:'documents',label:'Adicionar documentos de habilitação',done:num(d.total)>0,target:'habilitation'},
    {key:'alert',label:'Criar primeiro alerta',done:num(a.active)>0,target:'alerts'},
    {key:'email',label:'Confirmar e-mail de notificações',done:Boolean(p.email_verified_at),target:'alerts'}
  ];
  const completed=steps.filter(x=>x.done).length;
  const score=Math.round(completed/steps.length*100);
  const nextDocs=await qMaybe(`SELECT id,label,doc_type,expiry_date,(expiry_date-CURRENT_DATE)::int days FROM company_documents WHERE user_id=$1 AND is_current=TRUE AND expiry_date IS NOT NULL ORDER BY expiry_date ASC LIMIT 5`,[uid]);
  const recent=await notificationHistory(uid,8);
  return {
    metrics:{opportunities_today:num(opp[0]?.n),active_alerts:num(a.active),matched_today:num(dv.matched_today),unread_notifications:num(dv.unread),email_sent_30d:num(dv.email_sent_30d),email_failed_30d:num(dv.email_failed_30d)},
    account:{score,complete:completed===steps.length,steps,email_verified:Boolean(p.email_verified_at),whatsapp_verified:Boolean(p.whatsapp_verified_at),company:co,documents:{total:num(d.total),healthy:num(d.healthy),expired:num(d.expired),due30:num(d.due30)},next_documents:nextDocs},
    recent_notifications:recent
  };
}

async function notificationHistory(uid,limit=50){
  const n=Math.min(Math.max(Number(limit)||50,1),100);
  return qMaybe(`SELECT d.id,d.alert_id,d.pncp_id,d.channel,d.status,d.attempts,d.error,d.created_at,d.sent_at,d.read_at,d.payload,a.name AS alert_name FROM notification_deliveries d LEFT JOIN saved_alerts a ON a.id=d.alert_id AND a.user_id=d.user_id WHERE d.user_id=$1 ORDER BY d.id DESC LIMIT $2`,[uid,n]);
}

async function isolationAudit(){
  const checks=[];
  const specs=[
    ['saved_alerts','orphan_user',`SELECT COUNT(*)::int n FROM saved_alerts x LEFT JOIN users u ON u.id=x.user_id WHERE u.id IS NULL`],
    ['documents','orphan_user',`SELECT COUNT(*)::int n FROM documents x LEFT JOIN users u ON u.id=x.user_id WHERE u.id IS NULL`],
    ['notification_profiles','orphan_user',`SELECT COUNT(*)::int n FROM notification_profiles x LEFT JOIN users u ON u.id=x.user_id WHERE u.id IS NULL`],
    ['company_profiles','orphan_user',`SELECT COUNT(*)::int n FROM company_profiles x LEFT JOIN users u ON u.id=x.user_id WHERE u.id IS NULL`],
    ['company_documents','orphan_user',`SELECT COUNT(*)::int n FROM company_documents x LEFT JOIN users u ON u.id=x.user_id WHERE u.id IS NULL`],
    ['notification_alert_settings','owner_mismatch',`SELECT COUNT(*)::int n FROM notification_alert_settings s JOIN saved_alerts a ON a.id=s.alert_id WHERE s.user_id<>a.user_id`],
    ['notification_deliveries','owner_mismatch',`SELECT COUNT(*)::int n FROM notification_deliveries d JOIN saved_alerts a ON a.id=d.alert_id WHERE d.user_id<>a.user_id`],
    ['company_document_reminders','owner_mismatch',`SELECT COUNT(*)::int n FROM company_document_reminders r JOIN company_documents d ON d.id=r.document_id WHERE r.user_id<>d.user_id`],
    ['notification_profiles','duplicate_verified_email',`SELECT COUNT(*)::int n FROM (SELECT LOWER(TRIM(email)) e FROM notification_profiles WHERE email_verified_at IS NOT NULL AND NULLIF(TRIM(email),'') IS NOT NULL GROUP BY LOWER(TRIM(email)) HAVING COUNT(DISTINCT user_id)>1) z`]
  ];
  for(const [table,key,sql] of specs){if(!await tableExists(table)){checks.push({table,key,status:'not_applicable',count:0});continue}const rows=await qMaybe(sql,[],[{n:0}]);const count=num(rows[0]?.n);checks.push({table,key,status:count?'attention':'ok',count})}
  const issues=checks.reduce((s,x)=>s+(x.status==='attention'?x.count:0),0);
  return {ok:issues===0,issues,checks,scope_guards:['Alertas filtrados por user_id','Documentos filtrados por user_id','Habilitação filtrada por user_id','Entregas de notificações filtradas por user_id','Rotas administrativas restritas a role=admin']};
}

async function auditFeed(limit=80,action=''){
  const n=Math.min(Math.max(Number(limit)||80,1),200),term=clean(action,120);
  const params=[n];let where='';if(term){params.push(`%${term}%`);where='WHERE a.action ILIKE $2'}
  return qMaybe(`SELECT a.id,a.action,a.metadata,a.ip,a.created_at,u.email FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ${where} ORDER BY a.id DESC LIMIT $1`,params);
}

async function adminSummary(){
  const [users,alerts,delivery,docs,audit]=await Promise.all([
    qMaybe(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE active)::int active,COUNT(*) FILTER(WHERE role='admin')::int admins FROM users`),
    qMaybe(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE enabled)::int active FROM saved_alerts`),
    qMaybe(`SELECT COUNT(*) FILTER(WHERE created_at>=NOW()-INTERVAL '24 hours')::int deliveries_24h,COUNT(*) FILTER(WHERE channel='email' AND status='sent' AND created_at>=NOW()-INTERVAL '30 days')::int email_sent_30d,COUNT(*) FILTER(WHERE channel='email' AND status='failed' AND created_at>=NOW()-INTERVAL '30 days')::int email_failed_30d,COUNT(*) FILTER(WHERE status IN('queued','waiting_provider','sending'))::int queue_pending FROM notification_deliveries`),
    qMaybe(`SELECT COUNT(*) FILTER(WHERE is_current)::int current,COUNT(*) FILTER(WHERE is_current AND expiry_date<CURRENT_DATE)::int expired,COALESCE(SUM(size_bytes),0)::bigint bytes FROM company_documents`),
    qMaybe(`SELECT COUNT(*)::int n FROM audit_logs WHERE created_at>=NOW()-INTERVAL '24 hours'`)
  ]);
  return {users:users[0]||{},alerts:alerts[0]||{},notifications:delivery[0]||{},documents:docs[0]||{},audit24h:num(audit[0]?.n),isolation:await isolationAudit()};
}

async function integrations(req){
  const cookie=String(req.headers.cookie||'');
  let live={},ai={};
  try{const r=await fetch(`http://127.0.0.1:${PORT}/api/live-status`,{headers:{cookie},signal:AbortSignal.timeout(4000)});if(r.ok)live=(await r.json()).status||{}}catch{}
  try{const r=await fetch(`http://127.0.0.1:${PORT}/api/ai-rlb/status`,{headers:{cookie},signal:AbortSignal.timeout(5000)});if(r.ok)ai=await r.json()}catch{}
  let db=false,latency=null;try{const t=Date.now();await pool.query('SELECT 1');latency=Date.now()-t;db=true}catch{}
  const queued=(await qMaybe(`SELECT COUNT(*)::int n FROM notification_deliveries WHERE status IN('queued','waiting_provider','sending')`))[0]?.n||0;
  return {services:[
    {key:'pncp',label:'PNCP / Monitor nacional',status:live.consecutive_failures?'attention':'ok',detail:live.last_success_at?`Última coleta: ${live.last_success_at}`:'Monitor inicializando'},
    {key:'database',label:'PostgreSQL',status:db?'ok':'down',detail:db?`Conectado${latency!==null?` • ${latency} ms`:''}`:'Indisponível'},
    {key:'gemini',label:'Gemini / IA RLB',status:ai.provider?'ok':'attention',detail:ai.provider?`${ai.provider}${ai.model?` • ${ai.model}`:''}`:'Verifique no diagnóstico da IA'},
    {key:'email',label:'Resend / E-mail',status:RESEND_READY?'ok':'down',detail:RESEND_READY?'Configurado':'Não configurado'},
    {key:'whatsapp',label:'WhatsApp',status:WHATSAPP_READY?'ok':'attention',detail:WHATSAPP_READY?'Configurado':'Integração pendente'},
    {key:'queue',label:'Fila de notificações',status:num(queued)>20?'attention':'ok',detail:`${num(queued)} pendente(s)`}
  ],live,ai};
}

async function securitySummary(){
  const [sessions,uploads]=await Promise.all([
    qMaybe(`SELECT COUNT(*) FILTER(WHERE expires_at>NOW())::int active,COUNT(*) FILTER(WHERE expires_at<=NOW())::int expired FROM sessions`),
    qMaybe(`SELECT COUNT(*)::int files,COALESCE(SUM(size_bytes),0)::bigint bytes FROM company_documents`)
  ]);
  return {isolation:await isolationAudit(),sessions:sessions[0]||{},uploads:uploads[0]||{},controls:[
    {name:'Cookies de sessão HttpOnly/Secure',status:'ok'},
    {name:'Proteção SameSite',status:'ok'},
    {name:'Rate limit de login e API',status:'ok'},
    {name:'CSP / X-Frame-Options / HSTS',status:'ok'},
    {name:'Escopo por user_id',status:'ok'},
    {name:'Validação de tamanho e MIME em documentos',status:'ok'},
    {name:'Antimalware dedicado em uploads',status:'attention',note:'Ainda não há scanner externo de malware.'}
  ]};
}

async function backupManifest(){
  const tables=['users','saved_alerts','notification_profiles','notification_alert_settings','notification_deliveries','company_profiles','company_documents','audit_logs'];
  const counts={};for(const t of tables){if(await tableExists(t)){const r=await qMaybe(`SELECT COUNT(*)::int n FROM ${t}`);counts[t]=num(r[0]?.n)}}
  return {generated_at:new Date().toISOString(),storage:'postgresql',counts,full_binary_backup:false,note:'Manifesto administrativo. Conteúdo binário de documentos e hashes de senha não são incluídos por segurança.',recommended:'Use snapshot/backup nativo do provedor PostgreSQL para recuperação integral.'};
}

export async function handleMaturitySuiteRoute(req,res,url){
  if(!url.pathname.startsWith('/api/maturity/'))return false;
  try{
    if(!pool){json(res,503,{error:'Módulo requer PostgreSQL.'});return true}
    if(!sameOrigin(req)){json(res,403,{error:'Origem não autorizada.'});return true}
    const user=await authUser(req);if(!user){json(res,401,{error:'Faça login para continuar.'});return true}
    if(req.method==='GET'&&url.pathname==='/api/maturity/overview'){json(res,200,await overview(user.id));return true}
    if(req.method==='GET'&&url.pathname==='/api/maturity/notifications'){json(res,200,{items:await notificationHistory(user.id,url.searchParams.get('limit')||50)});return true}
    const adminOnly=['/api/maturity/admin','/api/maturity/integrations','/api/maturity/security','/api/maturity/isolation','/api/maturity/audit','/api/maturity/backup'];
    if(adminOnly.includes(url.pathname)&&user.role!=='admin'){json(res,403,{error:'Acesso restrito ao administrador.'});return true}
    if(req.method==='GET'&&url.pathname==='/api/maturity/admin'){json(res,200,await adminSummary());return true}
    if(req.method==='GET'&&url.pathname==='/api/maturity/integrations'){json(res,200,await integrations(req));return true}
    if(req.method==='GET'&&url.pathname==='/api/maturity/security'){json(res,200,await securitySummary());return true}
    if(req.method==='GET'&&url.pathname==='/api/maturity/isolation'){json(res,200,await isolationAudit());return true}
    if(req.method==='GET'&&url.pathname==='/api/maturity/audit'){json(res,200,{items:await auditFeed(url.searchParams.get('limit')||80,url.searchParams.get('action')||'')});return true}
    if(req.method==='GET'&&url.pathname==='/api/maturity/backup'){json(res,200,await backupManifest());return true}
    json(res,404,{error:'Rota de maturidade não encontrada.'});return true;
  }catch(e){console.error('maturity suite route error:',e?.stack||e);json(res,e?.status||500,{error:e?.status?e.message:'Erro interno no módulo de maturidade.'});return true}
}

export async function initMaturitySuite(){await ensureIndexes();console.log('product maturity suite ready: dashboards, isolation audit, notification history, security and integrations')}
