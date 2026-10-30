import crypto from 'node:crypto';
import { Pool } from 'pg';

const PORT = Number(process.env.PORT || 10000);
const DATABASE_URL = process.env.DATABASE_URL || '';
const APP_ORIGIN = process.env.APP_ORIGIN || '';
const PUBLIC_URL = process.env.NOTIFICATION_PUBLIC_URL || APP_ORIGIN || 'https://radar-licitacoes-brasil-app.onrender.com';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const EMAIL_FROM = process.env.NOTIFICATION_EMAIL_FROM || '';
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || '';
const TWILIO_MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID || '';
const TWILIO_WHATSAPP_CONTENT_SID = process.env.TWILIO_WHATSAPP_CONTENT_SID || '';
const TWILIO_WHATSAPP_VERIFY_CONTENT_SID = process.env.TWILIO_WHATSAPP_VERIFY_CONTENT_SID || '';
const DISPATCH_INTERVAL_MS = 15_000;

const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, idleTimeoutMillis: 30_000 }) : null;
const verifyRate = new Map();
let dispatchTimer = null;
let dispatching = false;
let initialized = false;

const REGIONS = {
  NORTE:new Set(['AC','AP','AM','PA','RO','RR','TO']),
  NORDESTE:new Set(['AL','BA','CE','MA','PB','PE','PI','RN','SE']),
  'CENTRO-OESTE':new Set(['DF','GO','MT','MS']),
  SUDESTE:new Set(['ES','MG','RJ','SP']),
  SUL:new Set(['PR','RS','SC'])
};
const REGION_VALUES = new Set(['ALL',...Object.keys(REGIONS)]);
const clean=(v,n=500)=>String(v??'').trim().slice(0,n);
const digits=v=>String(v??'').replace(/\D/g,'');
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const htmlEsc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=v=>{try{const u=new URL(String(v||''));return /^https?:$/.test(u.protocol)?u.href:''}catch{return''}};
const money=v=>{const n=Number(v);return Number.isFinite(n)?n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'Não informado'};
const when=v=>{if(!v)return'Não informado';const d=new Date(v);return Number.isNaN(d.getTime())?'Não informado':d.toLocaleString('pt-BR',{timeZone:'America/Fortaleza',dateStyle:'short',timeStyle:'short'})};
const modalityOf=x=>clean(x?.modalidadeNome||x?._modalidadeConsultada||'Não informada',180);
const municipalityOf=x=>clean(x?.unidadeOrgao?.municipioNome||x?.unidadeOrgao?.nomeMunicipio||x?.municipioNome||'',180);
const ufOf=x=>clean(x?.unidadeOrgao?.ufSigla||x?.ufSigla||'',2).toUpperCase();
const orgOf=x=>clean(x?.orgaoEntidade?.razaoSocial||'',500);
const cnpjOf=x=>digits(x?.orgaoEntidade?.cnpj).slice(0,14);
const objectOf=x=>clean(x?.objetoCompra||'',4000);
const closeOf=x=>x?.dataEncerramentoProposta||x?.dataFimRecebimentoProposta||null;
const idOf=x=>clean(x?.numeroControlePNCP||[cnpjOf(x),x?.anoCompra||'',x?.sequencialCompra||'',x?._modalidadeConsultada||''].join('-'),180);
function pncpUrl(x){
  const supplied=safeUrl(x?._pncpUrl);if(supplied)return supplied;
  const cnpj=cnpjOf(x),year=Number(x?.anoCompra),seq=Number(x?.sequencialCompra);
  if(cnpj.length!==14||!Number.isInteger(year)||year<2000||!Number.isInteger(seq)||seq<1)return'';
  return `https://pncp.gov.br/app/editais/${cnpj}/${year}/${seq}`;
}
function validEmail(v){const e=clean(v,254).toLowerCase();return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)?e:null}
function phoneE164(v){
  let d=digits(v);if(!d)return null;
  if((d.length===10||d.length===11)&&!d.startsWith('55'))d='55'+d;
  if(d.length<12||d.length>15)return null;
  return '+'+d;
}
function providerStatus(){
  return {
    email:{configured:Boolean(RESEND_API_KEY&&EMAIL_FROM),provider:'resend'},
    whatsapp:{configured:Boolean(TWILIO_ACCOUNT_SID&&TWILIO_AUTH_TOKEN&&TWILIO_WHATSAPP_CONTENT_SID&&(TWILIO_WHATSAPP_FROM||TWILIO_MESSAGING_SERVICE_SID)),verification_configured:Boolean(TWILIO_ACCOUNT_SID&&TWILIO_AUTH_TOKEN&&TWILIO_WHATSAPP_VERIFY_CONTENT_SID&&(TWILIO_WHATSAPP_FROM||TWILIO_MESSAGING_SERVICE_SID)),provider:'twilio'}
  };
}
function allowVerification(key,limit=5,windowMs=10*60_000){
  const now=Date.now(),old=verifyRate.get(key);
  if(!old||now-old.at>windowMs){verifyRate.set(key,{at:now,count:1});return true}
  old.count+=1;return old.count<=limit;
}

async function authenticatedUser(req){
  const r=await fetch(`http://127.0.0.1:${PORT}/api/me`,{headers:{cookie:String(req.headers.cookie||'')},signal:AbortSignal.timeout(5000)});
  if(!r.ok)return null;const d=await r.json().catch(()=>({}));return d.user||null;
}
async function readJson(req,max=100_000){
  let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>max)throw Object.assign(new Error('Payload muito grande.'),{status:413});chunks.push(c)}
  if(!chunks.length)return{};try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw Object.assign(new Error('JSON inválido.'),{status:400})}
}
function send(res,status,data){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(data))}

async function initTables(){
  if(!pool||initialized)return;
  await pool.query(`CREATE TABLE IF NOT EXISTS notification_profiles(
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email TEXT,
    email_verified_at TIMESTAMPTZ,
    email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    whatsapp_e164 TEXT,
    whatsapp_verified_at TIMESTAMPTZ,
    whatsapp_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    whatsapp_opt_in_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS notification_alert_settings(
    alert_id BIGINT PRIMARY KEY REFERENCES saved_alerts(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    region TEXT NOT NULL DEFAULT 'ALL',
    onsite_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    whatsapp_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS notification_verifications(
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel TEXT NOT NULL,
    destination TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_notification_verify_user ON notification_verifications(user_id,channel,created_at DESC)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS notification_deliveries(
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    alert_id BIGINT NOT NULL REFERENCES saved_alerts(id) ON DELETE CASCADE,
    pncp_id TEXT NOT NULL,
    channel TEXT NOT NULL,
    status TEXT NOT NULL,
    payload JSONB NOT NULL,
    provider_id TEXT,
    error TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    UNIQUE(alert_id,pncp_id,channel)
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_notification_queue ON notification_deliveries(status,available_at,created_at)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_notification_user ON notification_deliveries(user_id,created_at DESC)`);
  initialized=true;
  console.log('notifications ready: multichannel queue initialized');
}

async function ensureProfile(user){
  await initTables();
  const fallback=validEmail(user?.email);
  const r=await pool.query(`INSERT INTO notification_profiles(user_id,email)
    VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET email=COALESCE(notification_profiles.email,EXCLUDED.email)
    RETURNING *`,[user.id,fallback]);
  return r.rows[0];
}
async function profileFor(user){
  const p=await ensureProfile(user);const providers=providerStatus();
  const u=await pool.query(`SELECT COUNT(*) FILTER(WHERE channel='onsite' AND read_at IS NULL)::int AS unread FROM notification_deliveries WHERE user_id=$1`,[user.id]);
  return {profile:{...p,email_verified:Boolean(p.email_verified_at),whatsapp_verified:Boolean(p.whatsapp_verified_at)},providers,unread_count:Number(u.rows[0]?.unread||0)};
}

function codeHash(userId,channel,destination,code){return crypto.createHash('sha256').update(`${userId}|${channel}|${destination}|${code}`).digest('hex')}
function makeCode(){return String(crypto.randomInt(100000,1000000))}

async function sendEmail({to,subject,html,text}){
  if(!RESEND_API_KEY||!EMAIL_FROM)throw Object.assign(new Error('Canal de e-mail ainda não configurado no servidor.'),{providerUnavailable:true});
  const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${RESEND_API_KEY}`},signal:AbortSignal.timeout(15_000),body:JSON.stringify({from:EMAIL_FROM,to:[to],subject,html,text})});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(d?.message||d?.error?.message||`Resend HTTP ${r.status}`),{providerStatus:r.status});return d?.id||null;
}
async function sendWhatsappTemplate({to,contentSid,variables}){
  if(!TWILIO_ACCOUNT_SID||!TWILIO_AUTH_TOKEN||!contentSid||(!TWILIO_WHATSAPP_FROM&&!TWILIO_MESSAGING_SERVICE_SID))throw Object.assign(new Error('Canal de WhatsApp ainda não configurado no servidor.'),{providerUnavailable:true});
  const form=new URLSearchParams();form.set('To','whatsapp:'+to);form.set('ContentSid',contentSid);form.set('ContentVariables',JSON.stringify(variables||{}));
  if(TWILIO_MESSAGING_SERVICE_SID)form.set('MessagingServiceSid',TWILIO_MESSAGING_SERVICE_SID);else form.set('From',TWILIO_WHATSAPP_FROM.startsWith('whatsapp:')?TWILIO_WHATSAPP_FROM:'whatsapp:'+TWILIO_WHATSAPP_FROM);
  const auth=Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  const r=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(TWILIO_ACCOUNT_SID)}/Messages.json`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Authorization':`Basic ${auth}`},body:form,signal:AbortSignal.timeout(15_000)});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(d?.message||`Twilio HTTP ${r.status}`),{providerStatus:r.status});return d?.sid||null;
}

async function requestVerification(user,channel,destination){
  if(!allowVerification(`${user.id}:${channel}`))throw Object.assign(new Error('Muitas tentativas de verificação. Aguarde alguns minutos.'),{status:429});
  const code=makeCode();let dest;
  if(channel==='email'){
    dest=validEmail(destination);if(!dest)throw Object.assign(new Error('Informe um e-mail válido.'),{status:400});
    await sendEmail({to:dest,subject:'Código de verificação — Radar de Licitações Brasil',text:`Seu código de verificação é ${code}. Ele expira em 10 minutos.`,html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;color:#0f172a"><h2 style="color:#0A2540">Radar de Licitações Brasil</h2><p>Use o código abaixo para confirmar seu e-mail de alertas:</p><div style="font-size:30px;font-weight:800;letter-spacing:8px;padding:18px 20px;background:#f1f5f9;border-radius:12px;text-align:center">${code}</div><p style="color:#64748b">O código expira em 10 minutos. Se você não solicitou esta confirmação, ignore esta mensagem.</p></div>`});
  }else if(channel==='whatsapp'){
    dest=phoneE164(destination);if(!dest)throw Object.assign(new Error('Informe um WhatsApp válido com DDD.'),{status:400});
    if(!providerStatus().whatsapp.verification_configured)throw Object.assign(new Error('A verificação por WhatsApp ainda aguarda configuração do template do provedor.'),{status:503});
    await sendWhatsappTemplate({to:dest,contentSid:TWILIO_WHATSAPP_VERIFY_CONTENT_SID,variables:{'1':code}});
  }else throw Object.assign(new Error('Canal inválido.'),{status:400});
  await pool.query('DELETE FROM notification_verifications WHERE user_id=$1 AND channel=$2',[user.id,channel]);
  await pool.query('INSERT INTO notification_verifications(user_id,channel,destination,code_hash,expires_at) VALUES($1,$2,$3,$4,NOW()+INTERVAL \'10 minutes\')',[user.id,channel,dest,codeHash(user.id,channel,dest,code)]);
  return {ok:true,channel,destination:dest,message:'Código enviado. Ele expira em 10 minutos.'};
}
async function confirmVerification(user,channel,code){
  const r=await pool.query('SELECT * FROM notification_verifications WHERE user_id=$1 AND channel=$2 ORDER BY id DESC LIMIT 1',[user.id,channel]);const row=r.rows[0];
  if(!row||new Date(row.expires_at).getTime()<Date.now())throw Object.assign(new Error('Código expirado. Solicite um novo código.'),{status:400});
  if(row.attempts>=6)throw Object.assign(new Error('Limite de tentativas atingido. Solicite um novo código.'),{status:429});
  const expected=codeHash(user.id,channel,row.destination,clean(code,12));
  if(expected!==row.code_hash){await pool.query('UPDATE notification_verifications SET attempts=attempts+1 WHERE id=$1',[row.id]);throw Object.assign(new Error('Código de verificação inválido.'),{status:400});}
  await ensureProfile(user);
  if(channel==='email')await pool.query('UPDATE notification_profiles SET email=$2,email_verified_at=NOW(),email_enabled=TRUE,updated_at=NOW() WHERE user_id=$1',[user.id,row.destination]);
  else await pool.query('UPDATE notification_profiles SET whatsapp_e164=$2,whatsapp_verified_at=NOW(),whatsapp_enabled=TRUE,whatsapp_opt_in_at=NOW(),updated_at=NOW() WHERE user_id=$1',[user.id,row.destination]);
  await pool.query('DELETE FROM notification_verifications WHERE user_id=$1 AND channel=$2',[user.id,channel]);
  return {ok:true,channel,message:channel==='email'?'E-mail confirmado e habilitado para alertas.':'WhatsApp confirmado e habilitado para alertas.'};
}

function regionMatches(region,uf){if(!region||region==='ALL')return true;return Boolean(REGIONS[region]?.has(String(uf||'').toUpperCase()))}
function alertMatches(a,x){
  const text=norm([objectOf(x),x?.informacaoComplementar,orgOf(x),x?.unidadeOrgao?.nomeUnidade].filter(Boolean).join(' '));
  if(a.keyword&&!text.includes(norm(a.keyword)))return false;
  const uf=ufOf(x);if(a.uf&&String(a.uf).toUpperCase()!==uf)return false;
  if(!regionMatches(a.region||'ALL',uf))return false;
  if(a.municipality&&!norm(municipalityOf(x)).includes(norm(a.municipality)))return false;
  if(a.municipality_ibge){const ibge=digits(x?.unidadeOrgao?.codigoIbge||x?.municipioIbge||x?.codigoMunicipioIbge);if(ibge!==digits(a.municipality_ibge))return false}
  const code=Number(x?._modalidadeConsultada||x?.modalidadeId||x?.codigoModalidadeContratacao);if(a.modality_code&&Number(a.modality_code)!==code)return false;
  if(a.org_name&&!norm([orgOf(x),x?.unidadeOrgao?.nomeUnidade].filter(Boolean).join(' ')).includes(norm(a.org_name)))return false;
  if(a.org_cnpj&&digits(a.org_cnpj)!==cnpjOf(x))return false;
  const value=Number(x?.valorTotalEstimado);if(a.min_value!==null&&a.min_value!==undefined&&Number.isFinite(value)&&value<Number(a.min_value))return false;if(a.max_value!==null&&a.max_value!==undefined&&Number.isFinite(value)&&value>Number(a.max_value))return false;
  return true;
}
function payloadFor(a,x){return {alert_name:a.name,pncp_id:idOf(x),modality:modalityOf(x),object:objectOf(x),org:orgOf(x)||'Órgão não informado',municipality:municipalityOf(x),uf:ufOf(x),estimated_value:Number.isFinite(Number(x?.valorTotalEstimado))?Number(x.valorTotalEstimado):null,published_at:x?.dataPublicacaoPncp||null,closes_at:closeOf(x),pncp_url:pncpUrl(x),origin_url:safeUrl(x?._originUrl||x?.linkSistemaOrigem||x?.linkProcessoEletronico||''),detected_at:x?._detectedAt||new Date().toISOString()}}
async function insertDelivery({userId,alertId,pncpId,channel,status,payload}){
  await pool.query(`INSERT INTO notification_deliveries(user_id,alert_id,pncp_id,channel,status,payload,sent_at)
    VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $5='sent' THEN NOW() ELSE NULL END)
    ON CONFLICT(alert_id,pncp_id,channel) DO NOTHING`,[userId,alertId,pncpId,channel,status,payload]);
}

export async function processProcurementNotifications(items=[]){
  if(!pool||!items.length)return;await initTables();
  const r=await pool.query(`SELECT a.*,u.active,
    p.email,p.email_verified_at,p.email_enabled AS profile_email_enabled,p.whatsapp_e164,p.whatsapp_verified_at,p.whatsapp_enabled AS profile_whatsapp_enabled,p.whatsapp_opt_in_at,
    COALESCE(s.region,'ALL') AS region,COALESCE(s.onsite_enabled,TRUE) AS onsite_enabled,COALESCE(s.email_enabled,TRUE) AS delivery_email_enabled,COALESCE(s.whatsapp_enabled,TRUE) AS delivery_whatsapp_enabled
    FROM saved_alerts a JOIN users u ON u.id=a.user_id
    LEFT JOIN notification_profiles p ON p.user_id=a.user_id
    LEFT JOIN notification_alert_settings s ON s.alert_id=a.id
    WHERE a.enabled=TRUE AND u.active=TRUE`);
  let matched=0,queued=0;
  for(const x of items){
    for(const a of r.rows){
      if(!alertMatches(a,x))continue;matched+=1;const payload=payloadFor(a,x),pncpId=payload.pncp_id;
      if(a.onsite_enabled){await insertDelivery({userId:a.user_id,alertId:a.id,pncpId,channel:'onsite',status:'sent',payload});queued+=1}
      if(a.delivery_email_enabled&&a.profile_email_enabled&&a.email&&a.email_verified_at){await insertDelivery({userId:a.user_id,alertId:a.id,pncpId,channel:'email',status:'queued',payload});queued+=1}
      if(a.delivery_whatsapp_enabled&&a.profile_whatsapp_enabled&&a.whatsapp_e164&&a.whatsapp_verified_at&&a.whatsapp_opt_in_at){await insertDelivery({userId:a.user_id,alertId:a.id,pncpId,channel:'whatsapp',status:'queued',payload});queued+=1}
    }
  }
  if(matched)console.log(`notifications matched ${matched} alert(s), queued ${queued} delivery record(s)`);
  if(queued)queueMicrotask(()=>dispatchPending().catch(e=>console.error('notifications dispatch error:',e?.message||e)));
}

function emailAlertHtml(p){const url=safeUrl(p.pncp_url)||PUBLIC_URL;return `<div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px"><div style="max-width:680px;margin:auto;background:white;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden"><div style="background:#061727;color:white;padding:24px 28px"><div style="font-size:13px;color:#93c5fd">Radar de Licitações Brasil</div><h1 style="font-size:22px;margin:5px 0 0">Nova oportunidade compatível</h1></div><div style="padding:28px"><p style="margin-top:0;color:#64748b">Alerta: <strong style="color:#0f172a">${htmlEsc(p.alert_name)}</strong></p><h2 style="font-size:18px;color:#0A2540">${htmlEsc(p.object||'Objeto não informado')}</h2><table style="width:100%;border-collapse:collapse;font-size:14px"><tr><td style="padding:8px 0;color:#64748b">Modalidade</td><td style="padding:8px 0;font-weight:700">${htmlEsc(p.modality)}</td></tr><tr><td style="padding:8px 0;color:#64748b">Órgão</td><td style="padding:8px 0;font-weight:700">${htmlEsc(p.org)}</td></tr><tr><td style="padding:8px 0;color:#64748b">Local</td><td style="padding:8px 0;font-weight:700">${htmlEsc([p.municipality,p.uf].filter(Boolean).join(' / ')||'Não informado')}</td></tr><tr><td style="padding:8px 0;color:#64748b">Valor estimado</td><td style="padding:8px 0;font-weight:700">${htmlEsc(money(p.estimated_value))}</td></tr><tr><td style="padding:8px 0;color:#64748b">Encerramento</td><td style="padding:8px 0;font-weight:700">${htmlEsc(when(p.closes_at))}</td></tr></table><div style="margin-top:24px"><a href="${htmlEsc(url)}" style="display:inline-block;background:#0A2540;color:white;text-decoration:none;padding:12px 18px;border-radius:9px;font-weight:700">Abrir oportunidade</a> <a href="${htmlEsc(PUBLIC_URL)}" style="display:inline-block;color:#0066FF;text-decoration:none;padding:12px 10px;font-weight:700">Abrir Radar</a></div><p style="margin:24px 0 0;color:#94a3b8;font-size:12px">Você recebeu esta mensagem porque confirmou este e-mail no Radar e habilitou notificações para este alerta.</p></div></div></div>`}
async function deliver(row){
  const p=row.payload||{};
  if(row.channel==='email'){
    const pr=await pool.query('SELECT email,email_verified_at,email_enabled FROM notification_profiles WHERE user_id=$1',[row.user_id]);const profile=pr.rows[0];if(!profile?.email||!profile.email_verified_at||!profile.email_enabled)throw Object.assign(new Error('E-mail não confirmado ou desabilitado.'),{skip:true});
    const providerId=await sendEmail({to:profile.email,subject:`Nova licitação: ${clean(p.modality,80)} • ${clean(p.alert_name,80)}`,html:emailAlertHtml(p),text:`Radar de Licitações Brasil\nNova oportunidade para o alerta ${p.alert_name}.\n${p.modality} • ${p.org}\n${p.object}\nLocal: ${[p.municipality,p.uf].filter(Boolean).join(' / ')}\nValor: ${money(p.estimated_value)}\nEncerramento: ${when(p.closes_at)}\n${p.pncp_url||PUBLIC_URL}`});return providerId;
  }
  if(row.channel==='whatsapp'){
    const pr=await pool.query('SELECT whatsapp_e164,whatsapp_verified_at,whatsapp_enabled,whatsapp_opt_in_at FROM notification_profiles WHERE user_id=$1',[row.user_id]);const profile=pr.rows[0];if(!profile?.whatsapp_e164||!profile.whatsapp_verified_at||!profile.whatsapp_enabled||!profile.whatsapp_opt_in_at)throw Object.assign(new Error('WhatsApp não confirmado, sem consentimento ou desabilitado.'),{skip:true});
    const providerId=await sendWhatsappTemplate({to:profile.whatsapp_e164,contentSid:TWILIO_WHATSAPP_CONTENT_SID,variables:{'1':clean(p.alert_name,80),'2':clean(p.modality,80),'3':clean(p.org,120),'4':clean([p.municipality,p.uf].filter(Boolean).join(' / ')||'Não informado',80),'5':clean(p.object,300),'6':when(p.closes_at),'7':p.pncp_url||PUBLIC_URL}});return providerId;
  }
  return null;
}
async function dispatchPending(){
  if(!pool||dispatching)return;dispatching=true;
  try{
    await initTables();const providers=providerStatus();
    const r=await pool.query(`SELECT * FROM notification_deliveries WHERE channel IN('email','whatsapp') AND status IN('queued','waiting_provider') AND available_at<=NOW() AND attempts<5 ORDER BY created_at ASC LIMIT 20`);
    for(const row of r.rows){
      if(row.channel==='email'&&!providers.email.configured){await pool.query(`UPDATE notification_deliveries SET status='waiting_provider',error=$2,available_at=NOW()+INTERVAL '30 minutes' WHERE id=$1`,[row.id,'Provedor de e-mail não configurado.']);continue}
      if(row.channel==='whatsapp'&&!providers.whatsapp.configured){await pool.query(`UPDATE notification_deliveries SET status='waiting_provider',error=$2,available_at=NOW()+INTERVAL '30 minutes' WHERE id=$1`,[row.id,'Provedor de WhatsApp não configurado.']);continue}
      await pool.query(`UPDATE notification_deliveries SET status='sending',attempts=attempts+1,error=NULL WHERE id=$1`,[row.id]);
      try{const providerId=await deliver(row);await pool.query(`UPDATE notification_deliveries SET status='sent',provider_id=$2,sent_at=NOW(),error=NULL WHERE id=$1`,[row.id,providerId])}
      catch(e){
        if(e?.skip){await pool.query(`UPDATE notification_deliveries SET status='skipped',error=$2 WHERE id=$1`,[row.id,clean(e.message,500)]);continue}
        const next=Math.min(60,Math.pow(2,Math.min(Number(row.attempts||0),5))*2);const final=Number(row.attempts||0)+1>=5;
        await pool.query(`UPDATE notification_deliveries SET status=$2,error=$3,available_at=NOW()+($4||' minutes')::interval WHERE id=$1`,[row.id,final?'failed':'queued',clean(e?.message||'Falha no provedor',500),String(next)]);
      }
    }
  }finally{dispatching=false}
}
function scheduleDispatch(){if(dispatchTimer)clearTimeout(dispatchTimer);dispatchTimer=setTimeout(async()=>{try{await dispatchPending()}catch(e){console.error('notifications worker:',e?.message||e)}finally{scheduleDispatch()}},DISPATCH_INTERVAL_MS);dispatchTimer.unref?.()}

async function listAlertSettings(userId){
  const r=await pool.query(`SELECT a.id,a.name,a.keyword,a.uf,a.municipality,a.modality_code,a.org_name,a.enabled,
    COALESCE(s.region,'ALL') region,COALESCE(s.onsite_enabled,TRUE) onsite_enabled,COALESCE(s.email_enabled,TRUE) email_enabled,COALESCE(s.whatsapp_enabled,TRUE) whatsapp_enabled
    FROM saved_alerts a LEFT JOIN notification_alert_settings s ON s.alert_id=a.id WHERE a.user_id=$1 ORDER BY a.id DESC`,[userId]);return r.rows;
}
async function updateAlertSettings(userId,alertId,b){
  const own=await pool.query('SELECT id FROM saved_alerts WHERE id=$1 AND user_id=$2',[alertId,userId]);if(!own.rows[0])throw Object.assign(new Error('Alerta não encontrado.'),{status:404});
  const region=String(b.region||'ALL').toUpperCase();if(!REGION_VALUES.has(region))throw Object.assign(new Error('Região inválida.'),{status:400});
  const onsite=b.onsite_enabled!==false,email=b.email_enabled!==false,whatsapp=b.whatsapp_enabled!==false;
  const r=await pool.query(`INSERT INTO notification_alert_settings(alert_id,user_id,region,onsite_enabled,email_enabled,whatsapp_enabled)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(alert_id) DO UPDATE SET region=EXCLUDED.region,onsite_enabled=EXCLUDED.onsite_enabled,email_enabled=EXCLUDED.email_enabled,whatsapp_enabled=EXCLUDED.whatsapp_enabled,updated_at=NOW() RETURNING *`,[alertId,userId,region,onsite,email,whatsapp]);return r.rows[0];
}
async function deliveries(userId,limit=50){const n=Math.min(Math.max(Number(limit)||50,1),100);const r=await pool.query(`SELECT d.id,d.alert_id,d.pncp_id,d.channel,d.status,d.payload,d.provider_id,d.error,d.created_at,d.sent_at,d.read_at,a.name alert_name FROM notification_deliveries d LEFT JOIN saved_alerts a ON a.id=d.alert_id WHERE d.user_id=$1 ORDER BY d.created_at DESC LIMIT $2`,[userId,n]);return r.rows}
async function audit(userId,action,metadata,ip){try{await pool.query('INSERT INTO audit_logs(user_id,action,metadata,ip) VALUES($1,$2,$3,$4)',[userId,action,metadata||{},ip||null])}catch{}}

export async function initNotifications(){if(!pool){console.log('notifications ready: database unavailable');return}await initTables();scheduleDispatch();}

export async function handleNotificationRoute(req,res,url){
  if(!url.pathname.startsWith('/api/notifications'))return false;
  const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'').split(',')[0].trim();
  try{
    if(!pool){send(res,503,{error:'Notificações requerem PostgreSQL.'});return true}
    if(['POST','PUT','PATCH','DELETE'].includes(req.method)&&APP_ORIGIN&&req.headers.origin&&req.headers.origin!==APP_ORIGIN){send(res,403,{error:'Origem não autorizada.'});return true}
    const user=await authenticatedUser(req);if(!user){send(res,401,{error:'Faça login para continuar.'});return true}
    await initTables();
    if(req.method==='GET'&&url.pathname==='/api/notifications/profile'){send(res,200,await profileFor(user));return true}
    if(req.method==='PUT'&&url.pathname==='/api/notifications/profile'){
      const b=await readJson(req);const p=await ensureProfile(user);
      const emailEnabled=b.email_enabled===undefined?p.email_enabled:b.email_enabled===true;const waEnabled=b.whatsapp_enabled===undefined?p.whatsapp_enabled:b.whatsapp_enabled===true;
      await pool.query('UPDATE notification_profiles SET email_enabled=$2,whatsapp_enabled=$3,updated_at=NOW() WHERE user_id=$1',[user.id,emailEnabled,waEnabled]);await audit(user.id,'notifications.profile_update',{email_enabled:emailEnabled,whatsapp_enabled:waEnabled},ip);send(res,200,await profileFor(user));return true
    }
    if(req.method==='POST'&&url.pathname==='/api/notifications/verify/request'){const b=await readJson(req);const result=await requestVerification(user,String(b.channel||''),b.destination);await audit(user.id,'notifications.verify_request',{channel:b.channel},ip);send(res,200,result);return true}
    if(req.method==='POST'&&url.pathname==='/api/notifications/verify/confirm'){const b=await readJson(req);const result=await confirmVerification(user,String(b.channel||''),String(b.code||''));await audit(user.id,'notifications.verify_confirm',{channel:b.channel},ip);send(res,200,result);return true}
    if(req.method==='GET'&&url.pathname==='/api/notifications/alerts'){send(res,200,{items:await listAlertSettings(user.id)});return true}
    let m=url.pathname.match(/^\/api\/notifications\/alerts\/(\d+)$/);
    if(m&&req.method==='PUT'){const item=await updateAlertSettings(user.id,Number(m[1]),await readJson(req));await audit(user.id,'notifications.alert_settings',{alert_id:Number(m[1]),region:item.region,onsite:item.onsite_enabled,email:item.email_enabled,whatsapp:item.whatsapp_enabled},ip);send(res,200,{item});return true}
    if(req.method==='GET'&&url.pathname==='/api/notifications/deliveries'){send(res,200,{items:await deliveries(user.id,url.searchParams.get('limit')||50)});return true}
    if(req.method==='POST'&&url.pathname==='/api/notifications/read-all'){await pool.query(`UPDATE notification_deliveries SET read_at=NOW() WHERE user_id=$1 AND channel='onsite' AND read_at IS NULL`,[user.id]);send(res,200,{ok:true});return true}
    if(req.method==='POST'&&url.pathname==='/api/notifications/test'){
      const b=await readJson(req);const pf=await ensureProfile(user);const channel=String(b.channel||'');
      if(channel==='email'){
        if(!pf.email_verified_at||!pf.email)throw Object.assign(new Error('Confirme seu e-mail antes de testar.'),{status:400});
        const id=await sendEmail({to:pf.email,subject:'Teste de alertas — Radar de Licitações Brasil',text:'Seu canal de e-mail está funcionando.',html:'<div style="font-family:Arial,sans-serif;padding:24px"><h2>Radar de Licitações Brasil</h2><p>Seu canal de alertas por e-mail está funcionando corretamente.</p></div>'});send(res,200,{ok:true,provider_id:id});return true
      }
      if(channel==='whatsapp'){
        if(!pf.whatsapp_verified_at||!pf.whatsapp_e164||!pf.whatsapp_opt_in_at)throw Object.assign(new Error('Confirme seu WhatsApp antes de testar.'),{status:400});
        const id=await sendWhatsappTemplate({to:pf.whatsapp_e164,contentSid:TWILIO_WHATSAPP_CONTENT_SID,variables:{'1':'Teste RLB','2':'Pregão eletrônico','3':'Radar de Licitações Brasil','4':'Brasil','5':'Mensagem de teste do canal de alertas.','6':'Sem prazo','7':PUBLIC_URL}});send(res,200,{ok:true,provider_id:id});return true
      }
      throw Object.assign(new Error('Canal inválido.'),{status:400});
    }
    send(res,404,{error:'Rota de notificações não encontrada.'});return true;
  }catch(e){console.error('notification route error:',e?.message||e);send(res,e?.status||500,{error:e?.status?e.message:'Erro interno no serviço de notificações.'});return true}
}
