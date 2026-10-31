import crypto from 'node:crypto';
import { Pool } from 'pg';

const DATABASE_URL=process.env.DATABASE_URL||'';
const APP_ORIGIN=process.env.APP_ORIGIN||'';
const PNCP_BASE_URL=process.env.PNCP_BASE_URL||'https://pncp.gov.br/api/consulta';
const pool=DATABASE_URL?new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:3,idleTimeoutMillis:30000}):null;
let schemaReady=false;

const clean=(v,n=1000)=>String(v??'').trim().slice(0,n);
const digits=v=>String(v??'').replace(/\D/g,'');
const emailOf=v=>{const e=clean(v,254).toLowerCase();return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)?e:null};
const tokenHash=t=>crypto.createHash('sha256').update(t).digest('hex');
const ipOf=req=>String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'').split(',')[0].trim();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function parseCookies(req){const out={};for(const p of String(req.headers.cookie||'').split(';')){const i=p.indexOf('=');if(i>0)out[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1).trim())}return out}
function send(res,status,data){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.end(JSON.stringify(data))}
async function readJson(req,max=400000){let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>max)throw Object.assign(new Error('Payload muito grande.'),{status:413});chunks.push(c)}if(!chunks.length)return{};try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw Object.assign(new Error('JSON inválido.'),{status:400})}}

async function ensureSchema(){
  if(schemaReady||!pool)return;
  await pool.query(`CREATE TABLE IF NOT EXISTS admin_settings(
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL DEFAULT 'null'::jsonb,
    updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS user_subscriptions(
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    company_name TEXT,
    phone TEXT,
    plan TEXT NOT NULL DEFAULT 'Essencial',
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','trial','suspended','expired')),
    expires_at TIMESTAMPTZ,
    max_alerts INTEGER NOT NULL DEFAULT 20,
    max_documents INTEGER NOT NULL DEFAULT 100,
    ai_daily_limit INTEGER NOT NULL DEFAULT 200,
    notes TEXT,
    updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS support_tickets(
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','in_progress','waiting_user','resolved','closed')),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN('low','normal','high','urgent')),
    admin_reply TEXT,
    assigned_to BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_support_status ON support_tickets(status,updated_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_subscription_status ON user_subscriptions(status,expires_at)');
  const defaults={
    landing_kicker:'INTELIGÊNCIA PARA QUEM DISPUTA LICITAÇÕES',
    landing_headline_primary:'Transforme o excesso de editais em',
    landing_headline_emphasis:'decisões mais rápidas e oportunidades mais claras.',
    landing_subheadline:'O Radar de Licitações Brasil concentra monitoramento nacional, busca oficial, alertas, documentos e inteligência artificial em uma única operação conectada ao PNCP.',
    company_name:'TVC Tecnologia, Assessoria e Licitações',
    support_email:'',
    support_whatsapp:'',
    public_notice:'',
    public_notice_enabled:false,
    default_plan:'Essencial',
    admin_internal_note:'',
    results_display_limit:30
  };
  for(const [key,value] of Object.entries(defaults)){
    await pool.query('INSERT INTO admin_settings(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO NOTHING',[key,JSON.stringify(value)]);
  }
  schemaReady=true;
  console.log('admin control center ready: schema and secure routes initialized');
}

async function sessionUser(req){
  if(!pool)return null;
  const token=parseCookies(req).radar_session;if(!token)return null;
  const r=await pool.query(`SELECT u.id,u.email,u.role,u.active,u.created_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.active=TRUE LIMIT 1`,[tokenHash(token)]);
  return r.rows[0]||null;
}
async function audit(userId,action,metadata={},ip=null){try{await pool.query('INSERT INTO audit_logs(user_id,action,metadata,ip) VALUES($1,$2,$3,$4)',[userId||null,action,metadata,ip])}catch{}}
async function one(sql,args=[]){const r=await pool.query(sql,args);return r.rows[0]||{}}
async function safe(sql,args=[],fallback=[]){try{return (await pool.query(sql,args)).rows}catch{return fallback}}

function providerStatus(){
  const sender=Boolean(process.env.TWILIO_WHATSAPP_FROM||process.env.TWILIO_MESSAGING_SERVICE_SID);
  return {
    email:Boolean(process.env.RESEND_API_KEY&&process.env.NOTIFICATION_EMAIL_FROM),
    whatsapp:Boolean(process.env.TWILIO_ACCOUNT_SID&&process.env.TWILIO_AUTH_TOKEN&&process.env.TWILIO_WHATSAPP_CONTENT_SID&&sender),
    whatsapp_verification:Boolean(process.env.TWILIO_ACCOUNT_SID&&process.env.TWILIO_AUTH_TOKEN&&process.env.TWILIO_WHATSAPP_VERIFY_CONTENT_SID&&sender),
    gemini:Boolean(process.env.GEMINI_API_KEY),
    groq:Boolean(process.env.GROQ_API_KEY)
  };
}

async function settingsObject(){const rows=await safe('SELECT key,value,updated_at FROM admin_settings ORDER BY key');const out={};for(const r of rows)out[r.key]=r.value;return out}
async function publicSettings(){const all=await settingsObject();return {
  landing_kicker:all.landing_kicker,
  landing_headline_primary:all.landing_headline_primary,
  landing_headline_emphasis:all.landing_headline_emphasis,
  landing_subheadline:all.landing_subheadline,
  company_name:all.company_name,
  support_email:all.support_email,
  support_whatsapp:all.support_whatsapp,
  public_notice:all.public_notice,
  public_notice_enabled:Boolean(all.public_notice_enabled)
}}

async function overview(){
  const [users,proc,alerts,docs,ai,notifs,support,audit24]=await Promise.all([
    one(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE active)::int active,COUNT(*) FILTER(WHERE role='admin')::int admins,COUNT(*) FILTER(WHERE created_at>NOW()-INTERVAL '7 days')::int new7d FROM users`),
    one(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE detected_at>NOW()-INTERVAL '24 hours')::int new24h,COUNT(*) FILTER(WHERE closes_at>NOW())::int open_estimate,MAX(last_seen_at) last_seen FROM monitored_procurements`),
    one(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE enabled)::int active FROM saved_alerts`),
    one(`SELECT COUNT(*)::int total,COALESCE(SUM(size_bytes),0)::bigint bytes FROM documents`),
    one(`SELECT COUNT(*) FILTER(WHERE role='user')::int prompts,COUNT(DISTINCT user_id)::int users FROM ai_messages WHERE created_at>=date_trunc('day',NOW())`),
    one(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE created_at>NOW()-INTERVAL '24 hours')::int last24h,COUNT(*) FILTER(WHERE status='failed')::int failed,COUNT(*) FILTER(WHERE status IN('queued','waiting_provider','sending'))::int pending FROM notification_deliveries`),
    one(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE status NOT IN('resolved','closed'))::int open,COUNT(*) FILTER(WHERE priority IN('high','urgent') AND status NOT IN('resolved','closed'))::int priority FROM support_tickets`),
    one(`SELECT COUNT(*)::int total FROM audit_logs WHERE created_at>NOW()-INTERVAL '24 hours'`)
  ]);
  return {users,procurements:proc,alerts,documents:docs,ai,notifications:notifs,support,audit24h:Number(audit24.total||0),providers:providerStatus(),generated_at:new Date().toISOString()};
}

async function listUsers(){
  const r=await pool.query(`SELECT u.id,u.email,u.role,u.active,u.created_at,
    s.company_name,s.phone,COALESCE(s.plan,'Essencial') plan,COALESCE(s.status,'active') subscription_status,s.expires_at,s.max_alerts,s.max_documents,s.ai_daily_limit,s.notes,
    (SELECT MAX(a.created_at) FROM audit_logs a WHERE a.user_id=u.id AND a.action='user.login') last_login_at,
    (SELECT COUNT(*)::int FROM sessions ss WHERE ss.user_id=u.id AND ss.expires_at>NOW()) active_sessions,
    (SELECT COUNT(*)::int FROM saved_alerts sa WHERE sa.user_id=u.id) alerts_count,
    (SELECT COUNT(*)::int FROM documents d WHERE d.user_id=u.id) documents_count,
    (SELECT COUNT(*)::int FROM ai_messages m WHERE m.user_id=u.id AND m.role='user' AND m.created_at>=date_trunc('day',NOW())) ai_today
    FROM users u LEFT JOIN user_subscriptions s ON s.user_id=u.id ORDER BY u.id DESC LIMIT 500`);
  return r.rows;
}

async function updateUser(admin,targetId,body,ip){
  const id=Number(targetId);if(!Number.isInteger(id))throw Object.assign(new Error('Usuário inválido.'),{status:400});
  const current=(await one('SELECT id,email,role,active FROM users WHERE id=$1',[id]));if(!current.id)throw Object.assign(new Error('Usuário não encontrado.'),{status:404});
  const nextRole=body.role===undefined?current.role:String(body.role),nextActive=body.active===undefined?current.active:Boolean(body.active),nextEmail=body.email===undefined?current.email:emailOf(body.email);
  if(!['admin','user'].includes(nextRole))throw Object.assign(new Error('Perfil inválido.'),{status:400});
  if(!nextEmail)throw Object.assign(new Error('E-mail inválido.'),{status:400});
  if(Number(admin.id)===id&&(!nextActive||nextRole!=='admin'))throw Object.assign(new Error('Você não pode remover seu próprio acesso administrativo.'),{status:400});
  const c=await pool.connect();
  try{
    await c.query('BEGIN');
    await c.query('UPDATE users SET email=$2,role=$3,active=$4 WHERE id=$1',[id,nextEmail,nextRole,nextActive]);
    await c.query(`INSERT INTO user_subscriptions(user_id,company_name,phone,plan,status,expires_at,max_alerts,max_documents,ai_daily_limit,notes,updated_by,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW()) ON CONFLICT(user_id) DO UPDATE SET
      company_name=EXCLUDED.company_name,phone=EXCLUDED.phone,plan=EXCLUDED.plan,status=EXCLUDED.status,expires_at=EXCLUDED.expires_at,max_alerts=EXCLUDED.max_alerts,max_documents=EXCLUDED.max_documents,ai_daily_limit=EXCLUDED.ai_daily_limit,notes=EXCLUDED.notes,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,[
      id,clean(body.company_name,180)||null,clean(body.phone,40)||null,clean(body.plan,60)||'Essencial',
      ['active','trial','suspended','expired'].includes(body.subscription_status)?body.subscription_status:'active',
      body.expires_at?new Date(body.expires_at):null,
      Math.min(Math.max(Number(body.max_alerts)||20,1),500),Math.min(Math.max(Number(body.max_documents)||100,1),5000),Math.min(Math.max(Number(body.ai_daily_limit)||200,1),5000),clean(body.notes,3000)||null,admin.id]);
    if(!nextActive)await c.query('DELETE FROM sessions WHERE user_id=$1',[id]);
    await c.query('COMMIT');
  }catch(e){try{await c.query('ROLLBACK')}catch{}if(e.code==='23505')throw Object.assign(new Error('Este e-mail já pertence a outra conta.'),{status:409});throw e}finally{c.release()}
  await audit(admin.id,'admin.user_control',{target_id:id,role:nextRole,active:nextActive,plan:clean(body.plan,60)||'Essencial'},ip);
  return (await listUsers()).find(x=>Number(x.id)===id)||null;
}

async function monitorData(cookie=''){
  const [totals,mods,ufs,recent]=await Promise.all([
    one(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE detected_at>NOW()-INTERVAL '24 hours')::int detected24h,COUNT(*) FILTER(WHERE last_seen_at>NOW()-INTERVAL '10 minutes')::int seen10m,MAX(last_seen_at) last_seen,MAX(detected_at) last_detected FROM monitored_procurements`),
    safe(`SELECT modality_code,COALESCE(modality_name,'Modalidade '||modality_code) modality_name,COUNT(*)::int total,MAX(last_seen_at) last_seen FROM monitored_procurements GROUP BY modality_code,modality_name ORDER BY modality_code`),
    safe(`SELECT uf,COUNT(*)::int total FROM monitored_procurements WHERE uf IS NOT NULL GROUP BY uf ORDER BY total DESC LIMIT 10`),
    safe(`SELECT pncp_id,modality_name,object_text,org_name,municipality,uf,detected_at,pncp_url FROM monitored_procurements ORDER BY detected_at DESC LIMIT 8`)
  ]);
  let live=null;try{const r=await fetch(`http://127.0.0.1:${process.env.PORT||10000}/api/live-status`,{headers:{cookie},signal:AbortSignal.timeout(3000)});if(r.ok)live=(await r.json()).status||null}catch{}
  return {totals,modalities:mods,top_ufs:ufs,recent,live};
}

function ymd(d=new Date()){return d.toISOString().slice(0,10).replaceAll('-','')}
function procurementKey(x,code){const supplied=clean(x?.numeroControlePNCP,180);if(supplied)return supplied;const c=digits(x?.orgaoEntidade?.cnpj).slice(0,14),y=Number(x?.anoCompra),s=Number(x?.sequencialCompra);return c&&y&&s?`${c}-${y}-${s}-${code}`:null}
async function manualScan(){
  const results=[];let scanned=0,inserted=0;
  for(let code=1;code<=14;code++){
    try{
      const p=new URLSearchParams({dataInicial:ymd(),dataFinal:ymd(),codigoModalidadeContratacao:String(code),pagina:'1',tamanhoPagina:'50'});
      const r=await fetch(`${PNCP_BASE_URL}/v1/contratacoes/publicacao?${p}`,{headers:{accept:'application/json','user-agent':'RadarLicitacoesBrasil-Admin/1.0'},signal:AbortSignal.timeout(9000)});
      const body=r.status===204?{}:await r.json().catch(()=>({}));const items=Array.isArray(body?.data)?body.data:Array.isArray(body)?body:[];scanned+=items.length;
      if(!r.ok&&r.status!==204){results.push({code,ok:false,status:r.status});continue}
      for(const x of items){const key=procurementKey(x,code);if(!key)continue;const cnpj=digits(x?.orgaoEntidade?.cnpj).slice(0,14)||null,year=Number(x?.anoCompra)||null,seq=Number(x?.sequencialCompra)||null,estimated=Number(x?.valorTotalEstimado);const municipality=clean(x?.unidadeOrgao?.municipioNome||x?.unidadeOrgao?.nomeMunicipio||x?.municipioNome,180)||null,uf=clean(x?.unidadeOrgao?.ufSigla||x?.ufSigla,2).toUpperCase()||null;const pncpUrl=cnpj&&year&&seq?`https://pncp.gov.br/app/editais/${cnpj}/${year}/${seq}`:null;
        const q=await pool.query(`INSERT INTO monitored_procurements(pncp_id,org_cnpj,year,sequence,modality_code,modality_name,object_text,org_name,unit_name,municipality,uf,power_id,sphere_id,estimated_value,published_at,closes_at,pncp_url,origin_url,raw,detected_at,last_seen_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW(),NOW()) ON CONFLICT(pncp_id) DO UPDATE SET raw=EXCLUDED.raw,last_seen_at=NOW() RETURNING (xmax=0) inserted`,[
          key,cnpj,year,seq,code,clean(x?.modalidadeNome,180)||null,clean(x?.objetoCompra,4000)||null,clean(x?.orgaoEntidade?.razaoSocial,500)||null,clean(x?.unidadeOrgao?.nomeUnidade,500)||null,municipality,uf,clean(x?.orgaoEntidade?.poderId,20)||null,clean(x?.orgaoEntidade?.esferaId,20)||null,Number.isFinite(estimated)?estimated:null,x?.dataPublicacaoPncp||null,x?.dataEncerramentoProposta||x?.dataFimRecebimentoProposta||null,pncpUrl,null,x]);
        if(q.rows[0]?.inserted)inserted++;
      }
      results.push({code,ok:true,status:r.status,count:items.length});
    }catch(e){results.push({code,ok:false,error:clean(e?.message,120)})}
    await sleep(120);
  }
  return {ok:results.some(x=>x.ok),scanned,inserted,modalities_ok:results.filter(x=>x.ok).length,errors:results.filter(x=>!x.ok)};
}

async function notificationData(){
  const [summary,channels,recent]=await Promise.all([
    one(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE status='sent')::int sent,COUNT(*) FILTER(WHERE status='failed')::int failed,COUNT(*) FILTER(WHERE status IN('queued','waiting_provider','sending'))::int pending,COUNT(*) FILTER(WHERE created_at>NOW()-INTERVAL '24 hours')::int last24h FROM notification_deliveries`),
    safe(`SELECT channel,status,COUNT(*)::int total FROM notification_deliveries GROUP BY channel,status ORDER BY channel,status`),
    safe(`SELECT d.id,d.channel,d.status,d.error,d.created_at,d.sent_at,u.email,a.name alert_name FROM notification_deliveries d LEFT JOIN users u ON u.id=d.user_id LEFT JOIN saved_alerts a ON a.id=d.alert_id ORDER BY d.id DESC LIMIT 25`)
  ]);
  return {summary,channels,recent,providers:providerStatus()};
}
async function retryNotifications(){
  const p=providerStatus();const allowed=[];if(p.email)allowed.push('email');if(p.whatsapp)allowed.push('whatsapp');if(!allowed.length)return {requeued:0,message:'Nenhum provedor externo está configurado.'};
  const r=await pool.query(`UPDATE notification_deliveries SET status='queued',available_at=NOW(),error=NULL WHERE status IN('failed','waiting_provider') AND channel=ANY($1::text[])`,[allowed]);return {requeued:r.rowCount||0};
}

async function aiData(){
  const [summary,daily,users,providerRows]=await Promise.all([
    one(`SELECT COUNT(*) FILTER(WHERE role='user')::int prompts,COUNT(*) FILTER(WHERE role='assistant')::int answers,COUNT(DISTINCT conversation_id)::int conversations,COUNT(DISTINCT user_id)::int users FROM ai_messages`),
    safe(`SELECT created_at::date day,COUNT(*) FILTER(WHERE role='user')::int prompts FROM ai_messages WHERE created_at>NOW()-INTERVAL '14 days' GROUP BY created_at::date ORDER BY day DESC`),
    safe(`SELECT u.email,COUNT(*)::int prompts,MAX(m.created_at) last_use FROM ai_messages m JOIN users u ON u.id=m.user_id WHERE m.role='user' GROUP BY u.id,u.email ORDER BY prompts DESC LIMIT 15`),
    safe(`SELECT provider,model,enabled,updated_at FROM ai_provider_settings WHERE id=1 LIMIT 1`)
  ]);
  return {summary,daily,top_users:users,provider:providerRows[0]||null,providers_env:providerStatus(),official_sources:true};
}

async function alertData(){return safe(`SELECT a.id,a.user_id,u.email,a.name,a.keyword,a.uf,a.municipality,a.modality_code,a.org_name,a.min_value,a.max_value,a.enabled,a.created_at,a.updated_at FROM saved_alerts a JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 500`)}
async function planData(){const rows=await safe(`SELECT COALESCE(s.plan,'Essencial') plan,COALESCE(s.status,'active') status,COUNT(*)::int total FROM users u LEFT JOIN user_subscriptions s ON s.user_id=u.id GROUP BY COALESCE(s.plan,'Essencial'),COALESCE(s.status,'active') ORDER BY total DESC`);return {summary:rows}}
async function supportData(){return safe(`SELECT t.*,u.email user_email,cb.email created_by_email,aa.email assigned_email FROM support_tickets t LEFT JOIN users u ON u.id=t.user_id LEFT JOIN users cb ON cb.id=t.created_by LEFT JOIN users aa ON aa.id=t.assigned_to ORDER BY CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,t.updated_at DESC LIMIT 300`)}
async function auditData(limit=200){const n=Math.min(Math.max(Number(limit)||200,20),500);return safe(`SELECT a.id,a.action,a.metadata,a.ip,a.created_at,u.email FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT $1`,[n])}
async function healthData(cookie=''){
  const started=Date.now();let db=true;try{await pool.query('SELECT 1')}catch{db=false}const dbMs=Date.now()-started;
  let live=null;try{const r=await fetch(`http://127.0.0.1:${process.env.PORT||10000}/api/live-status`,{headers:{cookie},signal:AbortSignal.timeout(3000)});if(r.ok)live=(await r.json()).status||null}catch{}
  return {database:{ok:db,latency_ms:dbMs},server:{ok:true,uptime_seconds:Math.round(process.uptime()),memory_mb:Math.round(process.memoryUsage().rss/1024/1024),node:process.version},pncp:live,providers:providerStatus(),storage:'postgresql',checked_at:new Date().toISOString()};
}

const SETTING_KEYS=new Set(['landing_kicker','landing_headline_primary','landing_headline_emphasis','landing_subheadline','company_name','support_email','support_whatsapp','public_notice','public_notice_enabled','default_plan','admin_internal_note','results_display_limit']);
async function saveSettings(admin,body,ip){const changed={};for(const [key,val] of Object.entries(body||{})){if(!SETTING_KEYS.has(key))continue;let v=val;if(key==='public_notice_enabled')v=Boolean(val);else if(key==='results_display_limit')v=Math.min(Math.max(Number(val)||30,10),100);else v=clean(val,key==='landing_subheadline'||key==='public_notice'||key==='admin_internal_note'?3000:500);await pool.query(`INSERT INTO admin_settings(key,value,updated_by,updated_at) VALUES($1,$2::jsonb,$3,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,[key,JSON.stringify(v),admin.id]);changed[key]=v}await audit(admin.id,'admin.settings_update',{keys:Object.keys(changed)},ip);return changed}

export async function handleAdminControlCenter(req,res,url){
  const isPublic=url.pathname==='/api/public-config';
  const isAdmin=url.pathname.startsWith('/api/admin-center/');
  const isSupport=url.pathname.startsWith('/api/support/');
  if(!isPublic&&!isAdmin&&!isSupport)return false;
  try{
    if(!pool){send(res,503,{error:'Central administrativa requer PostgreSQL.'});return true}
    await ensureSchema();
    if(isPublic&&req.method==='GET'){send(res,200,{config:await publicSettings()});return true}
    if(['POST','PUT','PATCH','DELETE'].includes(req.method)&&APP_ORIGIN&&req.headers.origin&&req.headers.origin!==APP_ORIGIN){send(res,403,{error:'Origem não autorizada.'});return true}
    const user=await sessionUser(req);if(!user){send(res,401,{error:'Faça login para continuar.'});return true}

    if(isSupport){
      if(req.method==='POST'&&url.pathname==='/api/support/tickets'){const b=await readJson(req);const subject=clean(b.subject,180),message=clean(b.message,5000);if(!subject||!message){send(res,400,{error:'Informe assunto e mensagem.'});return true}const r=await pool.query(`INSERT INTO support_tickets(user_id,created_by,subject,message,priority) VALUES($1,$1,$2,$3,$4) RETURNING *`,[user.id,subject,message,['low','normal','high','urgent'].includes(b.priority)?b.priority:'normal']);await audit(user.id,'support.ticket_create',{ticket_id:r.rows[0].id},ipOf(req));send(res,201,{item:r.rows[0]});return true}
      if(req.method==='GET'&&url.pathname==='/api/support/tickets'){const r=await pool.query('SELECT * FROM support_tickets WHERE user_id=$1 ORDER BY id DESC LIMIT 100',[user.id]);send(res,200,{items:r.rows});return true}
      send(res,404,{error:'Rota de suporte não encontrada.'});return true;
    }

    if(user.role!=='admin'){send(res,403,{error:'Acesso restrito ao administrador.'});return true}
    const ip=ipOf(req);let m;
    if(req.method==='GET'&&url.pathname==='/api/admin-center/overview'){send(res,200,{data:await overview()});return true}
    if(req.method==='GET'&&url.pathname==='/api/admin-center/users'){send(res,200,{items:await listUsers()});return true}
    m=url.pathname.match(/^\/api\/admin-center\/users\/(\d+)$/);if(m&&req.method==='PATCH'){const item=await updateUser(user,m[1],await readJson(req),ip);send(res,200,{item});return true}
    m=url.pathname.match(/^\/api\/admin-center\/users\/(\d+)\/logout$/);if(m&&req.method==='POST'){const target=Number(m[1]);if(target===Number(user.id)){send(res,400,{error:'Use o botão Sair para encerrar sua própria sessão.'});return true}const r=await pool.query('DELETE FROM sessions WHERE user_id=$1',[target]);await audit(user.id,'admin.user_sessions_terminated',{target_id:target,sessions:r.rowCount||0},ip);send(res,200,{ok:true,sessions:r.rowCount||0});return true}
    if(req.method==='GET'&&url.pathname==='/api/admin-center/monitor'){send(res,200,{data:await monitorData(String(req.headers.cookie||''))});return true}
    if(req.method==='POST'&&url.pathname==='/api/admin-center/monitor/scan'){const data=await manualScan();await audit(user.id,'admin.manual_pncp_scan',{scanned:data.scanned,inserted:data.inserted,modalities_ok:data.modalities_ok},ip);send(res,200,{data});return true}
    if(req.method==='GET'&&url.pathname==='/api/admin-center/notifications'){send(res,200,{data:await notificationData()});return true}
    if(req.method==='POST'&&url.pathname==='/api/admin-center/notifications/retry'){const data=await retryNotifications();await audit(user.id,'admin.notification_retry',data,ip);send(res,200,{data});return true}
    if(req.method==='GET'&&url.pathname==='/api/admin-center/ai'){send(res,200,{data:await aiData()});return true}
    if(req.method==='GET'&&url.pathname==='/api/admin-center/alerts'){send(res,200,{items:await alertData()});return true}
    m=url.pathname.match(/^\/api\/admin-center\/alerts\/(\d+)$/);if(m&&req.method==='PATCH'){const b=await readJson(req);const r=await pool.query('UPDATE saved_alerts SET enabled=$2,updated_at=NOW() WHERE id=$1 RETURNING id,user_id,name,enabled',[Number(m[1]),Boolean(b.enabled)]);if(!r.rows[0]){send(res,404,{error:'Alerta não encontrado.'});return true}await audit(user.id,'admin.alert_toggle',{alert_id:Number(m[1]),enabled:Boolean(b.enabled)},ip);send(res,200,{item:r.rows[0]});return true}
    if(req.method==='GET'&&url.pathname==='/api/admin-center/plans'){send(res,200,{data:await planData()});return true}
    if(req.method==='GET'&&url.pathname==='/api/admin-center/support'){send(res,200,{items:await supportData()});return true}
    if(req.method==='POST'&&url.pathname==='/api/admin-center/support'){const b=await readJson(req);const subject=clean(b.subject,180),message=clean(b.message,5000),target=Number(b.user_id)||null;if(!subject||!message){send(res,400,{error:'Informe assunto e mensagem.'});return true}const r=await pool.query(`INSERT INTO support_tickets(user_id,created_by,subject,message,priority,assigned_to) VALUES($1,$2,$3,$4,$5,$2) RETURNING *`,[target,user.id,subject,message,['low','normal','high','urgent'].includes(b.priority)?b.priority:'normal']);await audit(user.id,'admin.support_create',{ticket_id:r.rows[0].id,target_user_id:target},ip);send(res,201,{item:r.rows[0]});return true}
    m=url.pathname.match(/^\/api\/admin-center\/support\/(\d+)$/);if(m&&req.method==='PATCH'){const b=await readJson(req);const status=['open','in_progress','waiting_user','resolved','closed'].includes(b.status)?b.status:'open',priority=['low','normal','high','urgent'].includes(b.priority)?b.priority:'normal';const r=await pool.query(`UPDATE support_tickets SET status=$2,priority=$3,admin_reply=$4,assigned_to=$5,updated_at=NOW() WHERE id=$1 RETURNING *`,[Number(m[1]),status,priority,clean(b.admin_reply,5000)||null,user.id]);if(!r.rows[0]){send(res,404,{error:'Chamado não encontrado.'});return true}await audit(user.id,'admin.support_update',{ticket_id:Number(m[1]),status,priority},ip);send(res,200,{item:r.rows[0]});return true}
    if(req.method==='GET'&&url.pathname==='/api/admin-center/settings'){send(res,200,{settings:await settingsObject()});return true}
    if(req.method==='PUT'&&url.pathname==='/api/admin-center/settings'){const changed=await saveSettings(user,await readJson(req),ip);send(res,200,{ok:true,changed,settings:await settingsObject()});return true}
    if(req.method==='GET'&&url.pathname==='/api/admin-center/audit'){send(res,200,{items:await auditData(url.searchParams.get('limit'))});return true}
    if(req.method==='GET'&&url.pathname==='/api/admin-center/health'){send(res,200,{data:await healthData(String(req.headers.cookie||''))});return true}
    send(res,404,{error:'Rota administrativa não encontrada.'});return true;
  }catch(e){console.error('admin control center route:',e?.stack||e);send(res,e?.status||500,{error:e?.status?e.message:'Erro interno da Central Administrativa.'});return true}
}
