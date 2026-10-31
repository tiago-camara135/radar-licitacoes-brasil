import crypto from 'node:crypto';
import { Pool } from 'pg';

const PORT=Number(process.env.PORT||10000);
const DATABASE_URL=process.env.DATABASE_URL||'';
const APP_ORIGIN=process.env.APP_ORIGIN||'';
const pool=DATABASE_URL?new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:3,idleTimeoutMillis:30000}):null;
const MAX_FILE_BYTES=8*1024*1024;

const DOC_TYPES={
  federal:['Regularidade Fiscal e Trabalhista','Certidão Federal / RFB e PGFN'],
  fgts:['Regularidade Fiscal e Trabalhista','CRF do FGTS'],
  cndt:['Regularidade Fiscal e Trabalhista','CNDT — Débitos Trabalhistas'],
  estadual:['Regularidade Fiscal e Trabalhista','Certidão Estadual'],
  municipal:['Regularidade Fiscal e Trabalhista','Certidão Municipal'],
  cartao_cnpj:['Habilitação Jurídica','Cartão do CNPJ'],
  contrato_social:['Habilitação Jurídica','Contrato Social / Requerimento de Empresário'],
  alteracao_contratual:['Habilitação Jurídica','Alteração Contratual / Consolidação'],
  junta_comercial:['Habilitação Jurídica','Certidão Simplificada / Específica da Junta Comercial'],
  falencia:['Qualificação Econômico-Financeira','Certidão de Falência / Recuperação Judicial'],
  balanco:['Qualificação Econômico-Financeira','Balanço Patrimonial e Demonstrações Contábeis'],
  indices:['Qualificação Econômico-Financeira','Índices Econômico-Financeiros'],
  registro_conselho:['Qualificação Técnica','Registro em Conselho Profissional'],
  atestado_tecnico:['Qualificação Técnica','Atestado de Capacidade Técnica'],
  acervo_tecnico:['Qualificação Técnica','CAT / Acervo Técnico'],
  licenca:['Qualificação Técnica','Licença / Alvará / Autorização Técnica'],
  declaracao:['Declarações e Outros','Declaração'],
  procuracao:['Declarações e Outros','Procuração'],
  documento_socio:['Declarações e Outros','Documento de Sócio / Representante'],
  outro:['Declarações e Outros','Outro documento']
};

const clean=(v,n=1000)=>String(v??'').trim().slice(0,n);
const digits=v=>String(v??'').replace(/\D/g,'');
const emailOf=v=>{const e=clean(v,254).toLowerCase();return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)?e:null};
const dateOnly=v=>{const s=clean(v,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:null};
const ipOf=req=>String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'').split(',')[0].trim();

function json(res,status,data){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.end(JSON.stringify(data));
}
async function readJson(req,max=12*1024*1024){
  let size=0;const chunks=[];
  for await(const c of req){size+=c.length;if(size>max)throw Object.assign(new Error('Payload muito grande.'),{status:413});chunks.push(c)}
  if(!chunks.length)return{};
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}
  catch{throw Object.assign(new Error('JSON inválido.'),{status:400})}
}
async function authUser(req){
  try{
    const r=await fetch(`http://127.0.0.1:${PORT}/api/me`,{headers:{cookie:String(req.headers.cookie||'')},signal:AbortSignal.timeout(5000)});
    if(!r.ok)return null;
    return (await r.json().catch(()=>({}))).user||null;
  }catch{return null}
}
function sameOrigin(req){
  return !['POST','PUT','PATCH','DELETE'].includes(req.method)||!APP_ORIGIN||!req.headers.origin||req.headers.origin===APP_ORIGIN;
}
async function audit(actorId,action,metadata,ip){
  try{await pool.query('INSERT INTO audit_logs(user_id,action,metadata,ip) VALUES($1,$2,$3,$4)',[actorId,action,metadata||{},ip||null])}catch{}
}
async function targetUser(id){
  const n=Number(id);if(!Number.isInteger(n)||n<1)throw Object.assign(new Error('Usuário inválido.'),{status:400});
  const r=await pool.query('SELECT id,email,role,active,created_at FROM users WHERE id=$1',[n]);
  if(!r.rows[0])throw Object.assign(new Error('Usuário não encontrado.'),{status:404});
  return r.rows[0];
}
function todayISO(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function daysUntil(date){
  if(!date)return null;
  const s=String(date).slice(0,10),a=Date.parse(todayISO()+'T12:00:00Z'),b=Date.parse(s+'T12:00:00Z');
  return Number.isFinite(a)&&Number.isFinite(b)?Math.round((b-a)/86400000):null;
}
function docStatus(expiry){
  const days=daysUntil(expiry);
  if(days===null)return{code:'no_expiry',label:'Sem vencimento',days:null};
  if(days<0)return{code:'expired',label:'Vencido',days};
  if(days<=2)return{code:'critical',label:days===0?'Vence hoje':`Vence em ${days} dia(s)`,days};
  if(days<=7)return{code:'warning',label:`Vence em ${days} dias`,days};
  if(days<=30)return{code:'attention',label:`Vence em ${days} dias`,days};
  return{code:'valid',label:'Válido',days};
}
function serializeDoc(row){
  const st=docStatus(row.expiry_date);
  return {...row,issue_date:row.issue_date?String(row.issue_date).slice(0,10):null,expiry_date:row.expiry_date?String(row.expiry_date).slice(0,10):null,status:st.code,status_label:st.label,days_remaining:st.days};
}
function summaryDocs(items){
  const out={total:items.length,valid:0,attention:0,warning:0,critical:0,expired:0,no_expiry:0,urgent:0};
  for(const d of items)out[d.status]=(out[d.status]||0)+1;
  out.urgent=Number(out.expired||0)+Number(out.critical||0)+Number(out.warning||0);
  return out;
}
function normalizePhone(v){
  let d=digits(v);if(!d)return null;
  if((d.length===10||d.length===11)&&!d.startsWith('55'))d='55'+d;
  if(d.length<12||d.length>15)return null;
  return '+'+d;
}
function normalizeAlert(body,current={}){
  const merged={...current,...body};
  const uf=clean(merged.uf,2).toUpperCase();
  const mod=merged.modality_code===''||merged.modality_code==null?null:Number(merged.modality_code);
  const min=merged.min_value===''||merged.min_value==null?null:Number(merged.min_value);
  const max=merged.max_value===''||merged.max_value==null?null:Number(merged.max_value);
  if(uf&&!/^[A-Z]{2}$/.test(uf))throw Object.assign(new Error('UF inválida.'),{status:400});
  if(mod!==null&&(!Number.isInteger(mod)||mod<1||mod>14))throw Object.assign(new Error('Modalidade inválida.'),{status:400});
  if(min!==null&&max!==null&&min>max)throw Object.assign(new Error('Valor mínimo não pode superar o máximo.'),{status:400});
  return{
    name:clean(merged.name,80)||'Alerta assistido pelo suporte',
    keyword:clean(merged.keyword,180)||null,
    uf:uf||null,
    municipality:clean(merged.municipality,120)||null,
    municipality_ibge:digits(merged.municipality_ibge).slice(0,7)||null,
    modality_code:mod,
    org_name:clean(merged.org_name,180)||null,
    org_cnpj:digits(merged.org_cnpj).slice(0,14)||null,
    min_value:Number.isFinite(min)?min:null,
    max_value:Number.isFinite(max)?max:null,
    enabled:merged.enabled!==false,
    onsite_enabled:merged.onsite_enabled!==false,
    email_enabled:merged.email_enabled!==false,
    whatsapp_enabled:merged.whatsapp_enabled!==false
  };
}

async function bundle(uid){
  const [u,company,alertsR,docsR,notifR,sessionsR,auditR,deliveriesR]=await Promise.all([
    pool.query(`SELECT u.id,u.email,u.role,u.active,u.created_at,s.company_name,s.phone,COALESCE(s.plan,'Essencial') plan,
      COALESCE(s.status,'active') subscription_status,s.expires_at,s.max_alerts,s.max_documents,s.ai_daily_limit,s.notes,
      (SELECT MAX(a.created_at) FROM audit_logs a WHERE a.user_id=u.id AND a.action='user.login') last_login_at
      FROM users u LEFT JOIN user_subscriptions s ON s.user_id=u.id WHERE u.id=$1`,[uid]),
    pool.query('SELECT user_id,cnpj,legal_name,trade_name,state,municipality,contact_name,updated_at FROM company_profiles WHERE user_id=$1',[uid]).catch(()=>({rows:[]})),
    pool.query(`SELECT sa.*,COALESCE(ns.onsite_enabled,TRUE) onsite_enabled,COALESCE(ns.email_enabled,TRUE) email_enabled,
      COALESCE(ns.whatsapp_enabled,TRUE) whatsapp_enabled,COALESCE(ns.region,'ALL') region
      FROM saved_alerts sa LEFT JOIN notification_alert_settings ns ON ns.alert_id=sa.id WHERE sa.user_id=$1 ORDER BY sa.id DESC`,[uid]).catch(()=>({rows:[]})),
    pool.query(`SELECT id,user_id,category,doc_type,label,issuer,jurisdiction,document_number,issue_date,expiry_date,filename,mime_type,size_bytes,notes,is_current,created_at,updated_at
      FROM company_documents WHERE user_id=$1 AND is_current=TRUE ORDER BY expiry_date NULLS LAST,id DESC`,[uid]).catch(()=>({rows:[]})),
    pool.query(`SELECT user_id,email,email_verified_at,email_enabled,whatsapp_e164,whatsapp_verified_at,whatsapp_enabled,whatsapp_opt_in_at,updated_at
      FROM notification_profiles WHERE user_id=$1`,[uid]).catch(()=>({rows:[]})),
    pool.query('SELECT id,created_at,expires_at FROM sessions WHERE user_id=$1 AND expires_at>NOW() ORDER BY created_at DESC',[uid]).catch(()=>({rows:[]})),
    pool.query(`SELECT id,action,metadata,ip,created_at FROM audit_logs WHERE user_id=$1 ORDER BY id DESC LIMIT 50`,[uid]).catch(()=>({rows:[]})),
    pool.query(`SELECT id,alert_id,pncp_id,channel,status,provider_id,error,attempts,created_at,sent_at,read_at
      FROM notification_deliveries WHERE user_id=$1 ORDER BY id DESC LIMIT 40`,[uid]).catch(()=>({rows:[]}))
  ]);
  if(!u.rows[0])throw Object.assign(new Error('Usuário não encontrado.'),{status:404});
  const docs=docsR.rows.map(serializeDoc);
  return{
    user:u.rows[0],
    company:company.rows[0]||null,
    alerts:alertsR.rows,
    documents:docs,
    document_summary:summaryDocs(docs),
    notifications:notifR.rows[0]||{user_id:uid,email:null,email_verified_at:null,email_enabled:true,whatsapp_e164:null,whatsapp_verified_at:null,whatsapp_enabled:true,whatsapp_opt_in_at:null},
    sessions:sessionsR.rows,
    activity:auditR.rows,
    deliveries:deliveriesR.rows
  };
}

async function saveCompany(uid,body){
  const state=clean(body.state,2).toUpperCase();
  if(state&&!/^[A-Z]{2}$/.test(state))throw Object.assign(new Error('UF inválida.'),{status:400});
  const cnpj=digits(body.cnpj).slice(0,14);
  if(cnpj&&cnpj.length!==14)throw Object.assign(new Error('CNPJ deve ter 14 dígitos.'),{status:400});
  const r=await pool.query(`INSERT INTO company_profiles(user_id,cnpj,legal_name,trade_name,state,municipality,contact_name)
    VALUES($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT(user_id) DO UPDATE SET cnpj=EXCLUDED.cnpj,legal_name=EXCLUDED.legal_name,trade_name=EXCLUDED.trade_name,state=EXCLUDED.state,
      municipality=EXCLUDED.municipality,contact_name=EXCLUDED.contact_name,updated_at=NOW()
    RETURNING user_id,cnpj,legal_name,trade_name,state,municipality,contact_name,updated_at`,[
      uid,cnpj||null,clean(body.legal_name,180)||null,clean(body.trade_name,180)||null,state||null,clean(body.municipality,120)||null,clean(body.contact_name,120)||null
    ]);
  return r.rows[0];
}
async function saveNotifications(uid,body){
  const current=(await pool.query('SELECT * FROM notification_profiles WHERE user_id=$1',[uid])).rows[0]||{};
  const email=body.email===undefined?(current.email||null):(clean(body.email,254)?emailOf(body.email):null);
  if(body.email!==undefined&&clean(body.email,254)&&!email)throw Object.assign(new Error('E-mail de notificação inválido.'),{status:400});
  const whatsapp=body.whatsapp_e164===undefined?(current.whatsapp_e164||null):(clean(body.whatsapp_e164,40)?normalizePhone(body.whatsapp_e164):null);
  if(body.whatsapp_e164!==undefined&&clean(body.whatsapp_e164,40)&&!whatsapp)throw Object.assign(new Error('WhatsApp inválido. Informe DDD e número.'),{status:400});
  const emailChanged=(current.email||null)!==email;
  const whatsappChanged=(current.whatsapp_e164||null)!==whatsapp;
  const emailEnabled=body.email_enabled===undefined?(current.email_enabled!==false):Boolean(body.email_enabled);
  const whatsappEnabled=body.whatsapp_enabled===undefined?(current.whatsapp_enabled!==false):Boolean(body.whatsapp_enabled);
  const r=await pool.query(`INSERT INTO notification_profiles(user_id,email,email_enabled,whatsapp_e164,whatsapp_enabled)
    VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(user_id) DO UPDATE SET
      email=EXCLUDED.email,email_enabled=EXCLUDED.email_enabled,
      email_verified_at=CASE WHEN notification_profiles.email IS DISTINCT FROM EXCLUDED.email THEN NULL ELSE notification_profiles.email_verified_at END,
      whatsapp_e164=EXCLUDED.whatsapp_e164,whatsapp_enabled=EXCLUDED.whatsapp_enabled,
      whatsapp_verified_at=CASE WHEN notification_profiles.whatsapp_e164 IS DISTINCT FROM EXCLUDED.whatsapp_e164 THEN NULL ELSE notification_profiles.whatsapp_verified_at END,
      whatsapp_opt_in_at=CASE WHEN notification_profiles.whatsapp_e164 IS DISTINCT FROM EXCLUDED.whatsapp_e164 THEN NULL ELSE notification_profiles.whatsapp_opt_in_at END,
      updated_at=NOW()
    RETURNING user_id,email,email_verified_at,email_enabled,whatsapp_e164,whatsapp_verified_at,whatsapp_enabled,whatsapp_opt_in_at,updated_at`,
    [uid,email,emailEnabled,whatsapp,whatsappEnabled]);
  return{profile:r.rows[0],email_changed:emailChanged,whatsapp_changed:whatsappChanged};
}
async function createAlert(uid,body){
  const a=normalizeAlert(body);
  const lim=(await pool.query(`SELECT COALESCE(max_alerts,20) max_alerts FROM user_subscriptions WHERE user_id=$1`,[uid])).rows[0]?.max_alerts||20;
  const count=Number((await pool.query('SELECT COUNT(*)::int count FROM saved_alerts WHERE user_id=$1',[uid])).rows[0]?.count||0);
  if(count>=Number(lim))throw Object.assign(new Error(`Este usuário atingiu o limite de ${lim} alertas.`),{status:400});
  const r=await pool.query(`INSERT INTO saved_alerts(user_id,name,keyword,uf,municipality,municipality_ibge,modality_code,org_name,org_cnpj,min_value,max_value,enabled)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,[uid,a.name,a.keyword,a.uf,a.municipality,a.municipality_ibge,a.modality_code,a.org_name,a.org_cnpj,a.min_value,a.max_value,a.enabled]);
  const item=r.rows[0];
  await pool.query(`INSERT INTO notification_alert_settings(alert_id,user_id,region,onsite_enabled,email_enabled,whatsapp_enabled)
    VALUES($1,$2,'ALL',$3,$4,$5)
    ON CONFLICT(alert_id) DO UPDATE SET onsite_enabled=EXCLUDED.onsite_enabled,email_enabled=EXCLUDED.email_enabled,whatsapp_enabled=EXCLUDED.whatsapp_enabled,updated_at=NOW()`,
    [item.id,uid,a.onsite_enabled,a.email_enabled,a.whatsapp_enabled]);
  return item;
}
async function patchAlert(uid,id,body){
  const r=await pool.query(`SELECT sa.*,COALESCE(ns.onsite_enabled,TRUE) onsite_enabled,COALESCE(ns.email_enabled,TRUE) email_enabled,
    COALESCE(ns.whatsapp_enabled,TRUE) whatsapp_enabled FROM saved_alerts sa LEFT JOIN notification_alert_settings ns ON ns.alert_id=sa.id
    WHERE sa.id=$1 AND sa.user_id=$2`,[id,uid]);
  if(!r.rows[0])throw Object.assign(new Error('Alerta não encontrado para este usuário.'),{status:404});
  const a=normalizeAlert(body,r.rows[0]);
  const u=await pool.query(`UPDATE saved_alerts SET name=$3,keyword=$4,uf=$5,municipality=$6,municipality_ibge=$7,modality_code=$8,org_name=$9,
    org_cnpj=$10,min_value=$11,max_value=$12,enabled=$13,updated_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING *`,
    [id,uid,a.name,a.keyword,a.uf,a.municipality,a.municipality_ibge,a.modality_code,a.org_name,a.org_cnpj,a.min_value,a.max_value,a.enabled]);
  await pool.query(`INSERT INTO notification_alert_settings(alert_id,user_id,region,onsite_enabled,email_enabled,whatsapp_enabled)
    VALUES($1,$2,'ALL',$3,$4,$5)
    ON CONFLICT(alert_id) DO UPDATE SET onsite_enabled=EXCLUDED.onsite_enabled,email_enabled=EXCLUDED.email_enabled,whatsapp_enabled=EXCLUDED.whatsapp_enabled,updated_at=NOW()`,
    [id,uid,a.onsite_enabled,a.email_enabled,a.whatsapp_enabled]);
  return u.rows[0];
}
async function addDocument(uid,body){
  const type=clean(body.doc_type,80);
  const known=DOC_TYPES[type]||DOC_TYPES.outro;
  const filename=clean(body.filename,180).replace(/[\\/\0]/g,'_');
  const mime=clean(body.mime_type,120);
  if(!type||!filename||!['application/pdf','image/jpeg','image/png'].includes(mime))throw Object.assign(new Error('Documento inválido. Use PDF, JPG ou PNG.'),{status:400});
  const content=Buffer.from(String(body.content_base64||''),'base64');
  if(!content.length||content.length>MAX_FILE_BYTES)throw Object.assign(new Error('O arquivo deve ter no máximo 8 MB.'),{status:400});
  const issue=dateOnly(body.issue_date),expiry=dateOnly(body.expiry_date);
  if(issue&&expiry&&issue>expiry)throw Object.assign(new Error('Emissão não pode ser posterior ao vencimento.'),{status:400});
  const c=await pool.connect();
  try{
    await c.query('BEGIN');
    await c.query('UPDATE company_documents SET is_current=FALSE,updated_at=NOW() WHERE user_id=$1 AND doc_type=$2 AND is_current=TRUE',[uid,type]);
    const r=await c.query(`INSERT INTO company_documents(user_id,category,doc_type,label,issuer,jurisdiction,document_number,issue_date,expiry_date,filename,mime_type,content,size_bytes,notes)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING id,user_id,category,doc_type,label,issuer,jurisdiction,document_number,issue_date,expiry_date,filename,mime_type,size_bytes,notes,is_current,created_at,updated_at`,
      [uid,known[0],type,known[1],clean(body.issuer,160)||null,clean(body.jurisdiction,160)||null,clean(body.document_number,120)||null,issue,expiry,filename,mime,content,content.length,clean(body.notes,1000)||null]);
    await c.query('COMMIT');return serializeDoc(r.rows[0]);
  }catch(e){try{await c.query('ROLLBACK')}catch{}throw e}finally{c.release()}
}
async function patchDocument(uid,id,body){
  const fields=[],vals=[id,uid];
  const put=(col,val)=>{vals.push(val);fields.push(`${col}=$${vals.length}`)};
  if('expiry_date'in body)put('expiry_date',dateOnly(body.expiry_date));
  if('issue_date'in body)put('issue_date',dateOnly(body.issue_date));
  if('issuer'in body)put('issuer',clean(body.issuer,160)||null);
  if('jurisdiction'in body)put('jurisdiction',clean(body.jurisdiction,160)||null);
  if('document_number'in body)put('document_number',clean(body.document_number,120)||null);
  if('notes'in body)put('notes',clean(body.notes,1000)||null);
  if(!fields.length)throw Object.assign(new Error('Nenhuma alteração informada.'),{status:400});
  fields.push('updated_at=NOW()');
  const r=await pool.query(`UPDATE company_documents SET ${fields.join(',')} WHERE id=$1 AND user_id=$2 AND is_current=TRUE
    RETURNING id,user_id,category,doc_type,label,issuer,jurisdiction,document_number,issue_date,expiry_date,filename,mime_type,size_bytes,notes,is_current,created_at,updated_at`,vals);
  if(!r.rows[0])throw Object.assign(new Error('Documento não encontrado.'),{status:404});
  return serializeDoc(r.rows[0]);
}

export async function handleAdminUserSupport(req,res,url){
  if(!url.pathname.startsWith('/api/admin-support/'))return false;
  try{
    if(!pool){json(res,503,{error:'Banco de dados indisponível.'});return true}
    const actor=await authUser(req);
    if(!actor){json(res,401,{error:'Faça login para continuar.'});return true}
    if(actor.role!=='admin'){json(res,403,{error:'Acesso restrito ao administrador.'});return true}
    if(!sameOrigin(req)){json(res,403,{error:'Origem não autorizada.'});return true}
    const ip=ipOf(req);let m;

    m=url.pathname.match(/^\/api\/admin-support\/users\/(\d+)$/);
    if(m&&req.method==='GET'){const t=await targetUser(m[1]);json(res,200,{data:await bundle(t.id)});return true}

    m=url.pathname.match(/^\/api\/admin-support\/users\/(\d+)\/company$/);
    if(m&&req.method==='PATCH'){
      const t=await targetUser(m[1]),body=await readJson(req),item=await saveCompany(t.id,body);
      await audit(actor.id,'admin.support_company_update',{target_id:t.id},ip);
      json(res,200,{item});return true
    }

    m=url.pathname.match(/^\/api\/admin-support\/users\/(\d+)\/notifications$/);
    if(m&&req.method==='PATCH'){
      const t=await targetUser(m[1]),body=await readJson(req),result=await saveNotifications(t.id,body);
      await audit(actor.id,'admin.support_notifications_update',{target_id:t.id,email_changed:result.email_changed,whatsapp_changed:result.whatsapp_changed,email_enabled:result.profile.email_enabled,whatsapp_enabled:result.profile.whatsapp_enabled},ip);
      json(res,200,{item:result.profile,requires_reverification:Boolean(result.email_changed||result.whatsapp_changed)});return true
    }

    m=url.pathname.match(/^\/api\/admin-support\/users\/(\d+)\/alerts$/);
    if(m&&req.method==='POST'){
      const t=await targetUser(m[1]),item=await createAlert(t.id,await readJson(req));
      await audit(actor.id,'admin.support_alert_create',{target_id:t.id,alert_id:item.id},ip);
      json(res,201,{item});return true
    }

    m=url.pathname.match(/^\/api\/admin-support\/users\/(\d+)\/alerts\/(\d+)$/);
    if(m&&req.method==='PATCH'){
      const t=await targetUser(m[1]),item=await patchAlert(t.id,m[2],await readJson(req));
      await audit(actor.id,'admin.support_alert_update',{target_id:t.id,alert_id:Number(m[2])},ip);
      json(res,200,{item});return true
    }
    if(m&&req.method==='DELETE'){
      const t=await targetUser(m[1]);
      const r=await pool.query('DELETE FROM saved_alerts WHERE id=$1 AND user_id=$2 RETURNING id',[m[2],t.id]);
      if(!r.rows[0])throw Object.assign(new Error('Alerta não encontrado.'),{status:404});
      await audit(actor.id,'admin.support_alert_delete',{target_id:t.id,alert_id:Number(m[2])},ip);
      json(res,200,{ok:true});return true
    }

    m=url.pathname.match(/^\/api\/admin-support\/users\/(\d+)\/documents$/);
    if(m&&req.method==='POST'){
      const t=await targetUser(m[1]),item=await addDocument(t.id,await readJson(req));
      await audit(actor.id,'admin.support_document_upload',{target_id:t.id,document_id:item.id,doc_type:item.doc_type},ip);
      json(res,201,{item});return true
    }

    m=url.pathname.match(/^\/api\/admin-support\/users\/(\d+)\/documents\/(\d+)$/);
    if(m&&req.method==='PATCH'){
      const t=await targetUser(m[1]),item=await patchDocument(t.id,m[2],await readJson(req));
      await audit(actor.id,'admin.support_document_update',{target_id:t.id,document_id:Number(m[2])},ip);
      json(res,200,{item});return true
    }
    if(m&&req.method==='DELETE'){
      const t=await targetUser(m[1]);
      const r=await pool.query('DELETE FROM company_documents WHERE id=$1 AND user_id=$2 RETURNING id',[m[2],t.id]);
      if(!r.rows[0])throw Object.assign(new Error('Documento não encontrado.'),{status:404});
      await audit(actor.id,'admin.support_document_delete',{target_id:t.id,document_id:Number(m[2])},ip);
      json(res,200,{ok:true});return true
    }

    m=url.pathname.match(/^\/api\/admin-support\/users\/(\d+)\/documents\/(\d+)\/download$/);
    if(m&&req.method==='GET'){
      const t=await targetUser(m[1]);
      const r=await pool.query('SELECT filename,mime_type,content FROM company_documents WHERE id=$1 AND user_id=$2',[m[2],t.id]);
      const d=r.rows[0];if(!d)throw Object.assign(new Error('Documento não encontrado.'),{status:404});
      await audit(actor.id,'admin.support_document_download',{target_id:t.id,document_id:Number(m[2])},ip);
      res.statusCode=200;res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Type',d.mime_type||'application/octet-stream');
      res.setHeader('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(d.filename));res.end(d.content);return true
    }

    m=url.pathname.match(/^\/api\/admin-support\/users\/(\d+)\/sessions\/revoke$/);
    if(m&&req.method==='POST'){
      const t=await targetUser(m[1]);if(Number(t.id)===Number(actor.id))throw Object.assign(new Error('Use o botão Sair para encerrar sua própria sessão.'),{status:400});
      const r=await pool.query('DELETE FROM sessions WHERE user_id=$1',[t.id]);
      await audit(actor.id,'admin.support_sessions_revoke',{target_id:t.id,sessions:r.rowCount||0},ip);
      json(res,200,{ok:true,sessions:r.rowCount||0});return true
    }

    json(res,404,{error:'Rota administrativa de suporte não encontrada.'});return true;
  }catch(e){
    console.error('admin support route:',e?.stack||e);
    if(!res.headersSent)json(res,e?.status||500,{error:e?.status?e.message:'Erro interno no suporte administrativo.'});
    else try{res.end()}catch{}
    return true;
  }
}
