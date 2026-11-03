import crypto from 'node:crypto';
import { Pool } from 'pg';

const PORT=Number(process.env.PORT||10000);
const DATABASE_URL=process.env.DATABASE_URL||'';
const APP_ORIGIN=process.env.APP_ORIGIN||'';
const PUBLIC_URL=process.env.NOTIFICATION_PUBLIC_URL||APP_ORIGIN||'https://radarlicitacoesbrasil.com.br';
const RESEND_API_KEY=process.env.RESEND_API_KEY||'';
const EMAIL_FROM=process.env.NOTIFICATION_EMAIL_FROM||'';
const WORKER_INTERVAL_MS=5_000;
const pool=DATABASE_URL?new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:2,idleTimeoutMillis:30_000}):null;
const verifyRate=new Map();
let workerTimer=null,workerRunning=false,initialized=false;

const clean=(v,n=500)=>String(v??'').trim().slice(0,n);
const digits=v=>String(v??'').replace(/\D/g,'');
const when=v=>{if(!v)return'Não informado';const d=new Date(v);return Number.isNaN(d.getTime())?'Não informado':d.toLocaleString('pt-BR',{timeZone:'America/Fortaleza',dateStyle:'short',timeStyle:'short'})};
const validEmail=v=>{const e=clean(v,254).toLowerCase();return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)?e:null};
export function phoneDigitsMeta(v){let d=digits(v);if((d.length===10||d.length===11)&&!d.startsWith('55'))d='55'+d;return d.length>=12&&d.length<=15?d:null}
function phoneE164(v){const d=phoneDigitsMeta(v);return d?'+'+d:null}
function graphVersion(v){const x=clean(v,20);return /^v\d+\.\d+$/.test(x)?x:'v26.0'}

export function metaConfigFromEnv(env=process.env){
  return {
    accessToken:clean(env.META_WHATSAPP_ACCESS_TOKEN,4096),
    phoneNumberId:digits(env.META_WHATSAPP_PHONE_NUMBER_ID).slice(0,40),
    alertTemplate:clean(env.META_WHATSAPP_ALERT_TEMPLATE_NAME,160),
    verifyTemplate:clean(env.META_WHATSAPP_VERIFY_TEMPLATE_NAME,160),
    language:clean(env.META_WHATSAPP_TEMPLATE_LANGUAGE,20)||'pt_BR',
    graphVersion:graphVersion(env.META_WHATSAPP_GRAPH_VERSION),
    verifyButtonSubtype:(clean(env.META_WHATSAPP_VERIFY_BUTTON_SUBTYPE,20)||'url').toLowerCase()
  };
}
export function metaProviderStatusFromEnv(env=process.env){
  const c=metaConfigFromEnv(env),base=Boolean(c.accessToken&&c.phoneNumberId);
  return {configured:Boolean(base&&c.alertTemplate),verification_configured:Boolean(base&&c.verifyTemplate),provider:'meta-cloud',graph_version:c.graphVersion};
}

function textParam(v){return {type:'text',text:clean(v,1024)}}
export function buildMetaTemplatePayload({to,templateName,language='pt_BR',variables=[],authentication=false,verifyButtonSubtype='url'}){
  const dest=phoneDigitsMeta(to);if(!dest)throw new Error('Número de WhatsApp inválido.');
  const name=clean(templateName,160);if(!name)throw new Error('Template do WhatsApp não informado.');
  const components=[];
  if(variables.length)components.push({type:'body',parameters:variables.map(textParam)});
  const subtype=clean(verifyButtonSubtype,20).toLowerCase();
  if(authentication&&variables[0]&&subtype&&subtype!=='none')components.push({type:'button',sub_type:subtype,index:'0',parameters:[textParam(variables[0])]});
  return {messaging_product:'whatsapp',recipient_type:'individual',to:dest,type:'template',template:{name,language:{code:clean(language,20)||'pt_BR'},components}};
}

export async function sendMetaTemplate({to,templateName,variables=[],authentication=false,fetchImpl=fetch,env=process.env}){
  const c=metaConfigFromEnv(env);
  if(!c.accessToken||!c.phoneNumberId||!templateName)throw Object.assign(new Error('Canal Meta WhatsApp ainda não configurado no servidor.'),{providerUnavailable:true});
  const payload=buildMetaTemplatePayload({to,templateName,language:c.language,variables,authentication,verifyButtonSubtype:c.verifyButtonSubtype});
  const r=await fetchImpl(`https://graph.facebook.com/${encodeURIComponent(c.graphVersion)}/${encodeURIComponent(c.phoneNumberId)}/messages`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${c.accessToken}`},body:JSON.stringify(payload),signal:AbortSignal.timeout(20_000)});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){const msg=clean(d?.error?.message||d?.message||`Meta WhatsApp HTTP ${r.status}`,500);throw Object.assign(new Error(msg),{providerStatus:r.status,providerCode:d?.error?.code||null})}
  return clean(d?.messages?.[0]?.id,300)||null;
}

function send(res,status,data){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(data))}
async function readJson(req,max=100_000){let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>max)throw Object.assign(new Error('Payload muito grande.'),{status:413});chunks.push(c)}if(!chunks.length)return{};try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw Object.assign(new Error('JSON inválido.'),{status:400})}}
async function authenticatedUser(req){try{const r=await fetch(`http://127.0.0.1:${PORT}/api/me`,{headers:{cookie:String(req.headers.cookie||'')},signal:AbortSignal.timeout(5000)});if(!r.ok)return null;return(await r.json().catch(()=>({}))).user||null}catch{return null}}
function requestOrigin(req){const host=String(req.headers.host||'').trim(),proto=String(req.headers['x-forwarded-proto']||'').split(',')[0].trim().toLowerCase()||((req.socket&&req.socket.encrypted)?'https':'http');if(!host||!['http','https'].includes(proto))return'';try{return new URL(`${proto}://${host}`).origin}catch{return''}}
function configuredOrigins(){return [...new Set(String(APP_ORIGIN||'').split(',').map(x=>{try{return new URL(x.trim()).origin}catch{return''}}).filter(Boolean))]}
function trustedOrigin(req){if(!['POST','PUT','PATCH','DELETE'].includes(String(req.method||'').toUpperCase()))return true;const raw=String(req.headers.origin||'').trim();if(!raw)return true;let origin='';try{origin=new URL(raw).origin}catch{return false}return origin===requestOrigin(req)||configuredOrigins().includes(origin)}
function allowVerification(key,limit=5,windowMs=10*60_000){const now=Date.now(),old=verifyRate.get(key);if(!old||now-old.at>windowMs){verifyRate.set(key,{at:now,count:1});return true}old.count+=1;return old.count<=limit}
function codeHash(userId,channel,destination,code){return crypto.createHash('sha256').update(`${userId}|${channel}|${destination}|${code}`).digest('hex')}
function makeCode(){return String(crypto.randomInt(100000,1000000))}

async function ensureTables(){
  if(!pool||initialized)return;
  await pool.query(`CREATE TABLE IF NOT EXISTS notification_profiles(
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,email TEXT,email_verified_at TIMESTAMPTZ,email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    whatsapp_e164 TEXT,whatsapp_verified_at TIMESTAMPTZ,whatsapp_enabled BOOLEAN NOT NULL DEFAULT TRUE,whatsapp_opt_in_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS notification_verifications(
    id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,channel TEXT NOT NULL,destination TEXT NOT NULL,code_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS notification_deliveries(
    id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,alert_id BIGINT NOT NULL REFERENCES saved_alerts(id) ON DELETE CASCADE,
    pncp_id TEXT NOT NULL,channel TEXT NOT NULL,status TEXT NOT NULL,payload JSONB NOT NULL,provider_id TEXT,error TEXT,attempts INTEGER NOT NULL DEFAULT 0,
    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),sent_at TIMESTAMPTZ,read_at TIMESTAMPTZ,UNIQUE(alert_id,pncp_id,channel))`);
  initialized=true;
}
async function ensureProfile(user){await ensureTables();const fallback=validEmail(user?.email);const r=await pool.query(`INSERT INTO notification_profiles(user_id,email) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET email=COALESCE(notification_profiles.email,EXCLUDED.email) RETURNING *`,[user.id,fallback]);return r.rows[0]}
async function profileForMeta(user){const p=await ensureProfile(user),wa=metaProviderStatusFromEnv();const u=await pool.query(`SELECT COUNT(*) FILTER(WHERE channel='onsite' AND read_at IS NULL)::int unread FROM notification_deliveries WHERE user_id=$1`,[user.id]);return{profile:{...p,email_verified:Boolean(p.email_verified_at),whatsapp_verified:Boolean(p.whatsapp_verified_at)},providers:{email:{configured:Boolean(RESEND_API_KEY&&EMAIL_FROM),provider:'resend'},whatsapp:wa},unread_count:Number(u.rows[0]?.unread||0)}}
async function audit(userId,action,metadata,ip){try{await pool.query('INSERT INTO audit_logs(user_id,action,metadata,ip) VALUES($1,$2,$3,$4)',[userId,action,metadata||{},ip||null])}catch{}}

async function requestMetaVerification(user,destination){
  if(!allowVerification(`${user.id}:whatsapp`))throw Object.assign(new Error('Muitas tentativas de verificação. Aguarde alguns minutos.'),{status:429});
  const status=metaProviderStatusFromEnv();if(!status.verification_configured)throw Object.assign(new Error('A verificação por WhatsApp ainda aguarda configuração do template da Meta.'),{status:503});
  const dest=phoneE164(destination);if(!dest)throw Object.assign(new Error('Informe um WhatsApp válido com DDD.'),{status:400});
  const code=makeCode(),c=metaConfigFromEnv();
  await sendMetaTemplate({to:dest,templateName:c.verifyTemplate,variables:[code],authentication:true});
  await pool.query('DELETE FROM notification_verifications WHERE user_id=$1 AND channel=$2',[user.id,'whatsapp']);
  await pool.query(`INSERT INTO notification_verifications(user_id,channel,destination,code_hash,expires_at) VALUES($1,'whatsapp',$2,$3,NOW()+INTERVAL '10 minutes')`,[user.id,dest,codeHash(user.id,'whatsapp',dest,code)]);
  return {ok:true,channel:'whatsapp',destination:dest,message:'Código enviado pelo WhatsApp. Ele expira em 10 minutos.'};
}

function alertVariables(p={}){return [clean(p.alert_name,80)||'Alerta Radar',clean(p.modality,80)||'Licitação pública',clean(p.org,120)||'Órgão não informado',clean([p.municipality,p.uf].filter(Boolean).join(' / ')||'Não informado',80),clean(p.object,300)||'Nova oportunidade compatível com seu alerta.',when(p.closes_at),clean(p.pncp_url||PUBLIC_URL,1000)]}
async function deliverMetaRow(row){
  const pr=await pool.query('SELECT whatsapp_e164,whatsapp_verified_at,whatsapp_enabled,whatsapp_opt_in_at FROM notification_profiles WHERE user_id=$1',[row.user_id]);const profile=pr.rows[0];
  if(!profile?.whatsapp_e164||!profile.whatsapp_verified_at||!profile.whatsapp_enabled||!profile.whatsapp_opt_in_at)throw Object.assign(new Error('WhatsApp não confirmado, sem consentimento ou desabilitado.'),{skip:true});
  const c=metaConfigFromEnv();return sendMetaTemplate({to:profile.whatsapp_e164,templateName:c.alertTemplate,variables:alertVariables(row.payload||{})});
}
async function claimMetaRow(){
  const r=await pool.query(`WITH picked AS (
    SELECT id FROM notification_deliveries WHERE channel='whatsapp' AND attempts<5 AND (
      status='waiting_provider' OR (status IN('queued','meta_retry') AND available_at<=NOW())
    ) ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1
  ) UPDATE notification_deliveries d SET status='sending',attempts=d.attempts+1,error=NULL FROM picked WHERE d.id=picked.id RETURNING d.*`);
  return r.rows[0]||null;
}
export async function processMetaWhatsappQueue(){
  if(!pool||workerRunning||!metaProviderStatusFromEnv().configured)return;workerRunning=true;
  try{
    await ensureTables();let processed=0;
    while(processed<12){const row=await claimMetaRow();if(!row)break;processed++;
      try{const providerId=await deliverMetaRow(row);await pool.query(`UPDATE notification_deliveries SET status='sent',provider_id=$2,sent_at=NOW(),error=NULL WHERE id=$1`,[row.id,providerId])}
      catch(e){if(e?.skip){await pool.query(`UPDATE notification_deliveries SET status='skipped',error=$2 WHERE id=$1`,[row.id,clean(e.message,500)]);continue}const final=Number(row.attempts||0)>=5,next=Math.min(60,Math.pow(2,Math.min(Number(row.attempts||1),5))*2);await pool.query(`UPDATE notification_deliveries SET status=$2,error=$3,available_at=NOW()+($4||' minutes')::interval WHERE id=$1`,[row.id,final?'failed':'meta_retry',clean(e?.message||'Falha no Meta WhatsApp',500),String(next)])}
    }
    if(processed)console.log(`meta whatsapp worker processed ${processed} delivery record(s)`);
  }finally{workerRunning=false}
}
function scheduleWorker(){if(workerTimer)clearTimeout(workerTimer);workerTimer=setTimeout(async()=>{try{await processMetaWhatsappQueue()}catch(e){console.error('meta whatsapp worker:',clean(e?.message||e,300))}finally{scheduleWorker()}},WORKER_INTERVAL_MS);workerTimer.unref?.()}

export async function handleMetaWhatsappRoute(req,res,url){
  const status=metaProviderStatusFromEnv();
  const isProfile=req.method==='GET'&&url.pathname==='/api/notifications/profile'&&(status.configured||status.verification_configured);
  const isStatus=req.method==='GET'&&url.pathname==='/api/notifications/meta/status';
  const isVerify=req.method==='POST'&&url.pathname==='/api/notifications/meta/verify/request';
  const isTest=req.method==='POST'&&url.pathname==='/api/notifications/meta/test';
  if(!isProfile&&!isStatus&&!isVerify&&!isTest)return false;
  try{
    if(!pool){send(res,503,{error:'Notificações requerem PostgreSQL.'});return true}
    if(!trustedOrigin(req)){send(res,403,{error:'Origem não autorizada.'});return true}
    const user=await authenticatedUser(req);if(!user){send(res,401,{error:'Faça login para continuar.'});return true}
    await ensureTables();const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'').split(',')[0].trim();
    if(isProfile){send(res,200,await profileForMeta(user));return true}
    if(isStatus){send(res,200,{whatsapp:status});return true}
    if(isVerify){const b=await readJson(req);const result=await requestMetaVerification(user,b.destination);await audit(user.id,'notifications.verify_request',{channel:'whatsapp',provider:'meta-cloud'},ip);send(res,200,result);return true}
    if(isTest){const pf=await ensureProfile(user);if(!pf.whatsapp_verified_at||!pf.whatsapp_e164||!pf.whatsapp_opt_in_at)throw Object.assign(new Error('Confirme seu WhatsApp antes de testar.'),{status:400});if(!status.configured)throw Object.assign(new Error('O envio de alertas pelo WhatsApp ainda não está configurado.'),{status:503});const c=metaConfigFromEnv(),id=await sendMetaTemplate({to:pf.whatsapp_e164,templateName:c.alertTemplate,variables:['Teste RLB','Pregão eletrônico','Radar de Licitações Brasil','Brasil','Mensagem de teste do canal de alertas.','Sem prazo',PUBLIC_URL]});await audit(user.id,'notifications.whatsapp_test',{provider:'meta-cloud'},ip);send(res,200,{ok:true,provider_id:id});return true}
  }catch(e){console.error('meta whatsapp route:',clean(e?.message||e,300));send(res,e?.status||500,{error:e?.status?e.message:'Erro interno no serviço de WhatsApp.'});return true}
  return false;
}

export async function initMetaWhatsapp(){
  if(!pool){console.log('meta whatsapp ready: database unavailable');return}
  await ensureTables();const status=metaProviderStatusFromEnv();
  if(status.configured||status.verification_configured){scheduleWorker();console.log(`meta whatsapp ready: Cloud API ${status.graph_version}; alerts=${status.configured?'configured':'pending'} verification=${status.verification_configured?'configured':'pending'}`)}
  else console.log('meta whatsapp ready: Cloud API adapter loaded; provider credentials pending');
}
