import { Pool } from 'pg';

const PORT=Number(process.env.PORT||10000);
const DATABASE_URL=process.env.DATABASE_URL||'';
const APP_ORIGIN=process.env.APP_ORIGIN||'';
const RESEND_API_KEY=String(process.env.RESEND_API_KEY||'');
const EMAIL_FROM=String(process.env.NOTIFICATION_EMAIL_FROM||'');
const PUBLIC_URL=String(process.env.NOTIFICATION_PUBLIC_URL||APP_ORIGIN||'https://radar-licitacoes-brasil-app.onrender.com');
const pool=DATABASE_URL?new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:2,idleTimeoutMillis:30000}):null;
const MAX_FILE_BYTES=8*1024*1024;
const ALLOWED_MIME=new Set(['application/pdf','image/jpeg','image/png']);
let initialized=false;
let reminderTimer=null;
let reminderRunning=false;

const CATALOG=[
  {group:'Regularidade Fiscal e Trabalhista',items:[
    ['federal','Certidão Federal / RFB e PGFN'],
    ['fgts','CRF do FGTS'],
    ['cndt','CNDT — Débitos Trabalhistas'],
    ['estadual','Certidão Estadual'],
    ['municipal','Certidão Municipal']
  ]},
  {group:'Habilitação Jurídica',items:[
    ['cartao_cnpj','Cartão do CNPJ'],
    ['contrato_social','Contrato Social / Requerimento de Empresário'],
    ['alteracao_contratual','Alteração Contratual / Consolidação'],
    ['junta_comercial','Certidão Simplificada / Específica da Junta Comercial']
  ]},
  {group:'Qualificação Econômico-Financeira',items:[
    ['falencia','Certidão de Falência / Recuperação Judicial'],
    ['balanco','Balanço Patrimonial e Demonstrações Contábeis'],
    ['indices','Índices Econômico-Financeiros']
  ]},
  {group:'Qualificação Técnica',items:[
    ['registro_conselho','Registro em Conselho Profissional — CREA/CAU/CFT/outros'],
    ['atestado_tecnico','Atestado de Capacidade Técnica'],
    ['acervo_tecnico','CAT / Acervo Técnico'],
    ['licenca','Licença / Alvará / Autorização Técnica']
  ]},
  {group:'Declarações e Outros',items:[
    ['declaracao','Declaração'],
    ['procuracao','Procuração'],
    ['documento_socio','Documento de Sócio / Representante'],
    ['outro','Outro documento']
  ]}
];
const TYPE_MAP=new Map(CATALOG.flatMap(g=>g.items.map(([value,label])=>[value,{value,label,group:g.group}])));
const clean=(v,n=500)=>String(v??'').trim().slice(0,n);
const digits=v=>String(v??'').replace(/\D/g,'');
const htmlEsc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function todayISO(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function dateOnly(v){const s=clean(v,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:null}
function diffDays(date){if(!date)return null;const a=Date.parse(todayISO()+'T12:00:00Z'),b=Date.parse(date+'T12:00:00Z');return Number.isFinite(a)&&Number.isFinite(b)?Math.round((b-a)/86400000):null}
function statusOf(expiry){const days=diffDays(expiry);if(days===null)return{code:'no_expiry',label:'Sem vencimento informado',days:null};if(days<0)return{code:'expired',label:'Vencido',days};if(days===0)return{code:'critical',label:'Vence hoje',days};if(days<=2)return{code:'critical',label:`Vence em ${days} dia${days===1?'':'s'}`,days};if(days<=7)return{code:'warning',label:`Vence em ${days} dias`,days};if(days<=30)return{code:'attention',label:`Vence em ${days} dias`,days};return{code:'valid',label:'Válido',days}}
function validCnpj(value){const c=digits(value);if(!c)return true;if(c.length!==14||/^(\d)\1+$/.test(c))return false;const calc=(base,weights)=>{const sum=base.split('').reduce((s,n,i)=>s+Number(n)*weights[i],0),r=sum%11;return r<2?0:11-r};const d1=calc(c.slice(0,12),[5,4,3,2,9,8,7,6,5,4,3,2]),d2=calc(c.slice(0,12)+d1,[6,5,4,3,2,9,8,7,6,5,4,3,2]);return c.endsWith(String(d1)+String(d2))}
function secureHeaders(res){res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY')}
function json(res,status,data){secureHeaders(res);res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data))}
async function readJson(req,max=12*1024*1024){let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>max)throw Object.assign(new Error('Payload muito grande.'),{status:413});chunks.push(c)}if(!chunks.length)return{};try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw Object.assign(new Error('JSON inválido.'),{status:400})}}
async function authUser(req){try{const r=await fetch(`http://127.0.0.1:${PORT}/api/me`,{headers:{cookie:String(req.headers.cookie||'')},signal:AbortSignal.timeout(5000)});if(!r.ok)return null;return (await r.json().catch(()=>({}))).user||null}catch{return null}}
function sameOrigin(req){return !['POST','PUT','PATCH','DELETE'].includes(req.method)||!APP_ORIGIN||!req.headers.origin||req.headers.origin===APP_ORIGIN}
function serialize(row){const st=statusOf(row.expiry_date?String(row.expiry_date).slice(0,10):null);const t=TYPE_MAP.get(row.doc_type);return{...row,issue_date:row.issue_date?String(row.issue_date).slice(0,10):null,expiry_date:row.expiry_date?String(row.expiry_date).slice(0,10):null,category:row.category||t?.group||'Outros',type_label:row.label||t?.label||row.doc_type,status:st.code,status_label:st.label,days_remaining:st.days,content:undefined}}

async function initTables(){
  if(!pool||initialized)return;
  await pool.query(`CREATE TABLE IF NOT EXISTS company_profiles(
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    cnpj TEXT,
    legal_name TEXT,
    trade_name TEXT,
    state TEXT,
    municipality TEXT,
    contact_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS company_documents(
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    doc_type TEXT NOT NULL,
    label TEXT NOT NULL,
    issuer TEXT,
    jurisdiction TEXT,
    document_number TEXT,
    issue_date DATE,
    expiry_date DATE,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    content BYTEA NOT NULL,
    size_bytes INTEGER NOT NULL,
    notes TEXT,
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_company_docs_user_current ON company_documents(user_id,is_current,expiry_date)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_company_docs_expiry ON company_documents(expiry_date) WHERE is_current=TRUE`);
  await pool.query(`CREATE TABLE IF NOT EXISTS company_document_reminders(
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_id BIGINT NOT NULL REFERENCES company_documents(id) ON DELETE CASCADE,
    expiry_date DATE NOT NULL,
    threshold_days INTEGER NOT NULL,
    email_status TEXT NOT NULL DEFAULT 'pending',
    provider_id TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    UNIQUE(document_id,expiry_date,threshold_days)
  )`);
  initialized=true;
}

async function getProfile(uid){const r=await pool.query('SELECT * FROM company_profiles WHERE user_id=$1',[uid]);return r.rows[0]||null}
async function saveProfile(uid,b){const cnpj=digits(b.cnpj).slice(0,14);if(cnpj&&!validCnpj(cnpj))throw Object.assign(new Error('CNPJ inválido.'),{status:400});const state=clean(b.state,2).toUpperCase();if(state&&!/^[A-Z]{2}$/.test(state))throw Object.assign(new Error('UF inválida.'),{status:400});const r=await pool.query(`INSERT INTO company_profiles(user_id,cnpj,legal_name,trade_name,state,municipality,contact_name) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id) DO UPDATE SET cnpj=EXCLUDED.cnpj,legal_name=EXCLUDED.legal_name,trade_name=EXCLUDED.trade_name,state=EXCLUDED.state,municipality=EXCLUDED.municipality,contact_name=EXCLUDED.contact_name,updated_at=NOW() RETURNING *`,[uid,cnpj||null,clean(b.legal_name,180)||null,clean(b.trade_name,180)||null,state||null,clean(b.municipality,120)||null,clean(b.contact_name,120)||null]);return r.rows[0]}
async function listDocs(uid,{history=false}={}){const r=await pool.query(`SELECT id,user_id,category,doc_type,label,issuer,jurisdiction,document_number,issue_date,expiry_date,filename,mime_type,size_bytes,notes,is_current,created_at,updated_at FROM company_documents WHERE user_id=$1 ${history?'':'AND is_current=TRUE'} ORDER BY is_current DESC,expiry_date NULLS LAST,id DESC`,[uid]);return r.rows.map(serialize)}
async function summary(uid){const items=await listDocs(uid);const out={total:items.length,valid:0,attention:0,warning:0,critical:0,expired:0,no_expiry:0,coverage:0};for(const d of items)out[d.status]=(out[d.status]||0)+1;const controlled=items.filter(d=>d.status!=='no_expiry').length;const healthy=items.filter(d=>['valid','attention'].includes(d.status)).length;out.coverage=controlled?Math.round(healthy/controlled*100):0;out.next=items.filter(d=>d.days_remaining!==null&&d.days_remaining>=0).sort((a,b)=>a.days_remaining-b.days_remaining).slice(0,5);return out}
async function addDocument(uid,b){const type=clean(b.doc_type,80),known=TYPE_MAP.get(type),label=clean(b.label,180)||known?.label||'Documento',category=clean(b.category,120)||known?.group||'Outros';if(!type)throw Object.assign(new Error('Selecione o tipo do documento.'),{status:400});const filename=clean(b.filename,180).replace(/[\\/\0]/g,'_'),mime=clean(b.mime_type,120);if(!filename||!ALLOWED_MIME.has(mime))throw Object.assign(new Error('Envie um arquivo PDF, JPG ou PNG.'),{status:400});if(typeof b.content_base64!=='string')throw Object.assign(new Error('Arquivo inválido.'),{status:400});const content=Buffer.from(b.content_base64,'base64');if(!content.length||content.length>MAX_FILE_BYTES)throw Object.assign(new Error('O arquivo deve ter no máximo 8 MB.'),{status:400});const issue=dateOnly(b.issue_date),expiry=dateOnly(b.expiry_date);if(issue&&expiry&&issue>expiry)throw Object.assign(new Error('A data de emissão não pode ser posterior ao vencimento.'),{status:400});const client=await pool.connect();try{await client.query('BEGIN');await client.query('UPDATE company_documents SET is_current=FALSE,updated_at=NOW() WHERE user_id=$1 AND doc_type=$2 AND is_current=TRUE',[uid,type]);const r=await client.query(`INSERT INTO company_documents(user_id,category,doc_type,label,issuer,jurisdiction,document_number,issue_date,expiry_date,filename,mime_type,content,size_bytes,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id,user_id,category,doc_type,label,issuer,jurisdiction,document_number,issue_date,expiry_date,filename,mime_type,size_bytes,notes,is_current,created_at,updated_at`,[uid,category,type,label,clean(b.issuer,160)||null,clean(b.jurisdiction,160)||null,clean(b.document_number,120)||null,issue,expiry,filename,mime,content,content.length,clean(b.notes,1000)||null]);await client.query('COMMIT');return serialize(r.rows[0])}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}
async function patchDocument(uid,id,b){const fields=[],values=[id,uid];const put=(col,val)=>{values.push(val);fields.push(`${col}=$${values.length}`)};if('expiry_date'in b)put('expiry_date',dateOnly(b.expiry_date));if('issue_date'in b)put('issue_date',dateOnly(b.issue_date));if('issuer'in b)put('issuer',clean(b.issuer,160)||null);if('jurisdiction'in b)put('jurisdiction',clean(b.jurisdiction,160)||null);if('document_number'in b)put('document_number',clean(b.document_number,120)||null);if('notes'in b)put('notes',clean(b.notes,1000)||null);if(!fields.length)throw Object.assign(new Error('Nenhuma alteração informada.'),{status:400});fields.push('updated_at=NOW()');const r=await pool.query(`UPDATE company_documents SET ${fields.join(',')} WHERE id=$1 AND user_id=$2 AND is_current=TRUE RETURNING id,user_id,category,doc_type,label,issuer,jurisdiction,document_number,issue_date,expiry_date,filename,mime_type,size_bytes,notes,is_current,created_at,updated_at`,values);if(!r.rows[0])throw Object.assign(new Error('Documento não encontrado.'),{status:404});return serialize(r.rows[0])}
async function getDownload(uid,id){const r=await pool.query('SELECT filename,mime_type,content FROM company_documents WHERE id=$1 AND user_id=$2',[id,uid]);return r.rows[0]||null}
async function removeDocument(uid,id){const r=await pool.query('DELETE FROM company_documents WHERE id=$1 AND user_id=$2 RETURNING id',[id,uid]);return Boolean(r.rows[0])}

function reminderBucket(days){if(days===null||days>30)return null;if(days<0)return-1;if(days===0)return 0;if(days<=1)return 1;if(days<=2)return 2;if(days<=7)return 7;if(days<=15)return 15;return 30}
async function verifiedEmail(uid){try{const r=await pool.query(`SELECT email FROM notification_profiles WHERE user_id=$1 AND email_verified_at IS NOT NULL AND email_enabled=TRUE LIMIT 1`,[uid]);return r.rows[0]?.email||null}catch{return null}}
async function sendReminderEmail(to,doc,days){if(!RESEND_API_KEY||!EMAIL_FROM)return{status:'waiting_provider'};const urgency=days<0?'está vencido':days===0?'vence hoje':`vence em ${days} dia${days===1?'':'s'}`;const subject=`Documento ${urgency} — Radar de Licitações Brasil`;const html=`<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#102033"><h2 style="margin-bottom:8px">Alerta de documentação</h2><p>O documento <strong>${htmlEsc(doc.label)}</strong> ${htmlEsc(urgency)}.</p><p><strong>Empresa:</strong> acompanhe sua habilitação no Radar de Licitações Brasil e providencie a renovação antes de participar de novas licitações.</p><p><a href="${htmlEsc(PUBLIC_URL)}" style="display:inline-block;padding:11px 16px;background:#0f766e;color:white;text-decoration:none;border-radius:8px">Abrir Central de Habilitação</a></p><p style="font-size:12px;color:#64748b">Este aviso considera a data de validade cadastrada no Radar. A autenticidade e a situação perante o órgão emissor devem ser confirmadas na fonte oficial quando necessário.</p></div>`;const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${RESEND_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({from:EMAIL_FROM,to:[to],subject,html})});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data?.message||`Resend ${r.status}`);return{status:'sent',id:data.id||null}}
async function ensureReminderRows(){const r=await pool.query(`SELECT id,user_id,label,expiry_date FROM company_documents WHERE is_current=TRUE AND expiry_date IS NOT NULL AND expiry_date<=CURRENT_DATE+30`);for(const d of r.rows){const days=diffDays(String(d.expiry_date).slice(0,10)),bucket=reminderBucket(days);if(bucket===null)continue;await pool.query(`INSERT INTO company_document_reminders(user_id,document_id,expiry_date,threshold_days,email_status) VALUES($1,$2,$3,$4,'pending') ON CONFLICT(document_id,expiry_date,threshold_days) DO NOTHING`,[d.user_id,d.id,d.expiry_date,bucket])}}
async function dispatchReminders(){if(!pool||reminderRunning)return;reminderRunning=true;try{await initTables();await ensureReminderRows();const r=await pool.query(`SELECT r.*,d.label,d.expiry_date AS doc_expiry FROM company_document_reminders r JOIN company_documents d ON d.id=r.document_id WHERE r.email_status IN('pending','waiting_provider','failed') AND r.attempts<4 ORDER BY r.id ASC LIMIT 30`);for(const row of r.rows){const email=await verifiedEmail(row.user_id);if(!email){await pool.query(`UPDATE company_document_reminders SET email_status='skipped',last_error='E-mail não verificado ou desabilitado' WHERE id=$1`,[row.id]);continue}try{const days=diffDays(String(row.doc_expiry).slice(0,10));const result=await sendReminderEmail(email,{label:row.label},days);await pool.query(`UPDATE company_document_reminders SET email_status=$2,provider_id=$3,attempts=attempts+1,last_error=NULL,sent_at=CASE WHEN $2='sent' THEN NOW() ELSE sent_at END WHERE id=$1`,[row.id,result.status,result.id||null])}catch(e){await pool.query(`UPDATE company_document_reminders SET email_status='failed',attempts=attempts+1,last_error=$2 WHERE id=$1`,[row.id,clean(e.message,500)])}}}catch(e){console.error('company document reminders:',e?.message||e)}finally{reminderRunning=false}}

export async function initCompanyDocuments(){if(!pool){console.warn('company documents: DATABASE_URL ausente; módulo indisponível.');return}await initTables();setTimeout(dispatchReminders,5000).unref?.();reminderTimer=setInterval(dispatchReminders,30*60*1000);reminderTimer.unref?.()}

export async function handleCompanyDocumentsRoute(req,res,url){
  if(!url.pathname.startsWith('/api/company-documents'))return false;
  if(!pool){json(res,503,{error:'Banco de dados indisponível.'});return true}
  try{await initTables();if(!sameOrigin(req)){json(res,403,{error:'Origem não autorizada.'});return true}const user=await authUser(req);if(!user){json(res,401,{error:'Faça login para continuar.'});return true}
    if(req.method==='GET'&&url.pathname==='/api/company-documents/catalog'){json(res,200,{catalog:CATALOG,max_file_bytes:MAX_FILE_BYTES});return true}
    if(req.method==='GET'&&url.pathname==='/api/company-documents/profile'){json(res,200,{profile:await getProfile(user.id)});return true}
    if(req.method==='PUT'&&url.pathname==='/api/company-documents/profile'){json(res,200,{profile:await saveProfile(user.id,await readJson(req,100000))});return true}
    if(req.method==='GET'&&url.pathname==='/api/company-documents/summary'){json(res,200,{summary:await summary(user.id)});return true}
    if(req.method==='GET'&&url.pathname==='/api/company-documents'){json(res,200,{items:await listDocs(user.id,{history:url.searchParams.get('history')==='1'})});return true}
    if(req.method==='POST'&&url.pathname==='/api/company-documents'){json(res,201,{item:await addDocument(user.id,await readJson(req))});setTimeout(dispatchReminders,1000).unref?.();return true}
    let m=url.pathname.match(/^\/api\/company-documents\/(\d+)\/download$/);if(m&&req.method==='GET'){const d=await getDownload(user.id,m[1]);if(!d){json(res,404,{error:'Documento não encontrado.'});return true}secureHeaders(res);res.statusCode=200;res.setHeader('Content-Type',d.mime_type||'application/octet-stream');res.setHeader('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(d.filename));res.end(d.content);return true}
    m=url.pathname.match(/^\/api\/company-documents\/(\d+)$/);if(m&&req.method==='PATCH'){json(res,200,{item:await patchDocument(user.id,m[1],await readJson(req,100000))});setTimeout(dispatchReminders,1000).unref?.();return true}if(m&&req.method==='DELETE'){if(!await removeDocument(user.id,m[1])){json(res,404,{error:'Documento não encontrado.'});return true}json(res,200,{ok:true});return true}
    json(res,404,{error:'Rota de documentação não encontrada.'});return true
  }catch(e){console.error('company documents route:',e?.stack||e);json(res,e?.status||500,{error:e?.status?e.message:'Erro interno no módulo de documentação.'});return true}
}
