import { Pool } from 'pg';

const PORT=Number(process.env.PORT||10000);
const DATABASE_URL=process.env.DATABASE_URL||'';
const APP_ORIGIN=process.env.APP_ORIGIN||'';
const pool=DATABASE_URL?new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:2,idleTimeoutMillis:30000}):null;
let initialized=false;

const SOURCES={
  cartao_cnpj:{key:'cartao_cnpj',label:'CNPJ — Receita Federal',url:'https://solucoes.receita.fazenda.gov.br/Servicos/cnpjreva/Cnpjreva_S.aspx',description:'Consulta oficial do comprovante de inscrição e situação cadastral.'},
  federal:{key:'federal',label:'Regularidade Federal — RFB/PGFN',url:'https://www.gov.br/pt-br/servicos/consultar-certidoes-emitidas-pela-receita-federal-e-ou-procuradoria-geral-da-fazenda-nacional',description:'Consulta de certidões de regularidade fiscal emitidas pela RFB/PGFN.'},
  fgts:{key:'fgts',label:'CRF do FGTS — CAIXA',url:'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf',description:'Consulta oficial de regularidade do empregador perante o FGTS.'},
  cndt:{key:'cndt',label:'CNDT — Justiça do Trabalho',url:'https://cndt-certidao.tst.jus.br/',description:'Emissão e validação oficial da Certidão Negativa de Débitos Trabalhistas.'}
};

const BASELINE=[
  ['cartao_cnpj','Cartão do CNPJ'],
  ['contrato_social','Contrato Social / ato constitutivo'],
  ['federal','Certidão Federal / RFB e PGFN'],
  ['fgts','CRF do FGTS'],
  ['cndt','CNDT'],
  ['estadual','Certidão Estadual'],
  ['municipal','Certidão Municipal'],
  ['falencia','Certidão de Falência / Recuperação Judicial'],
  ['balanco','Balanço Patrimonial e Demonstrações Contábeis']
];
const NO_NATURAL_EXPIRY=new Set(['cartao_cnpj','contrato_social']);
const clean=(v,n=500)=>String(v??'').trim().slice(0,n);
function secureHeaders(res){res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY')}
function json(res,status,data){secureHeaders(res);res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data))}
async function readJson(req,max=40_000){let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>max)throw Object.assign(new Error('Payload muito grande.'),{status:413});chunks.push(c)}if(!chunks.length)return{};try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw Object.assign(new Error('JSON inválido.'),{status:400})}}
async function authUser(req){try{const r=await fetch(`http://127.0.0.1:${PORT}/api/me`,{headers:{cookie:String(req.headers.cookie||'')},signal:AbortSignal.timeout(5000)});if(!r.ok)return null;return(await r.json().catch(()=>({}))).user||null}catch{return null}}
function sameOrigin(req){return !['POST','PUT','PATCH','DELETE'].includes(req.method)||!APP_ORIGIN||!req.headers.origin||req.headers.origin===APP_ORIGIN}
function dateOnly(v){return v?String(v).slice(0,10):null}
function daysRemaining(v){const s=dateOnly(v);if(!s)return null;const now=new Date();const y=Number(s.slice(0,4)),m=Number(s.slice(5,7)),d=Number(s.slice(8,10));const target=Date.UTC(y,m-1,d);const today=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());return Math.round((target-today)/86400000)}
function docState(doc){if(!doc)return{code:'missing',label:'Ausente',weight:0};const days=daysRemaining(doc.expiry_date);if(days===null)return{code:'ok',label:NO_NATURAL_EXPIRY.has(doc.doc_type)?'Presente':'Sem validade cadastrada',weight:NO_NATURAL_EXPIRY.has(doc.doc_type)?1:.65};if(days<0)return{code:'expired',label:'Vencido',weight:0};if(days<=2)return{code:'critical',label:days===0?'Vence hoje':`Vence em ${days} dia${days===1?'':'s'}`,weight:.35};if(days<=7)return{code:'warning',label:`Vence em ${days} dias`,weight:.6};if(days<=30)return{code:'attention',label:`Vence em ${days} dias`,weight:.85};return{code:'ok',label:'Em dia',weight:1}}

async function initTables(){
  if(!pool||initialized)return;
  await pool.query(`CREATE TABLE IF NOT EXISTS company_document_checks(
    document_id BIGINT PRIMARY KEY REFERENCES company_documents(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_key TEXT,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    note TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_company_checks_user ON company_document_checks(user_id,checked_at DESC)`);
  initialized=true;
}
async function currentDocs(uid){const r=await pool.query(`SELECT id,doc_type,label,expiry_date,issue_date,filename FROM company_documents WHERE user_id=$1 AND is_current=TRUE ORDER BY id DESC`,[uid]);return r.rows}
async function readiness(uid){
  const docs=await currentDocs(uid),byType=new Map(docs.map(d=>[d.doc_type,d]));let totalWeight=0;
  const items=BASELINE.map(([type,label])=>{const doc=byType.get(type)||null,state=docState(doc);totalWeight+=state.weight;return{type,label,document_id:doc?.id||null,state:state.code,status_label:state.label,expiry_date:dateOnly(doc?.expiry_date)||null,source:SOURCES[type]||null}});
  const score=Math.round(totalWeight/BASELINE.length*100);
  const missing=items.filter(x=>x.state==='missing').length,expired=items.filter(x=>x.state==='expired').length,risk=items.filter(x=>['critical','warning'].includes(x.state)).length;
  return{score,baseline_count:BASELINE.length,missing,expired,risk,items,notice:'Indicador operacional baseado em um checklist documental geral. O edital de cada licitação pode exigir documentos adicionais ou dispensar itens.'};
}
async function checkRows(uid){const r=await pool.query(`SELECT d.id AS document_id,d.doc_type,d.label,d.expiry_date,c.source_key,c.checked_at,c.note FROM company_documents d LEFT JOIN company_document_checks c ON c.document_id=d.id AND c.user_id=d.user_id WHERE d.user_id=$1 AND d.is_current=TRUE ORDER BY d.id DESC`,[uid]);return r.rows.map(x=>({...x,expiry_date:dateOnly(x.expiry_date),source:SOURCES[x.doc_type]||null}))}
async function saveCheck(uid,id,b){
  const own=await pool.query(`SELECT id,doc_type,label FROM company_documents WHERE id=$1 AND user_id=$2 AND is_current=TRUE LIMIT 1`,[id,uid]);const doc=own.rows[0];if(!doc)throw Object.assign(new Error('Documento atual não encontrado.'),{status:404});
  const sourceKey=SOURCES[doc.doc_type]?.key||null,note=clean(b.note,500)||null;
  const r=await pool.query(`INSERT INTO company_document_checks(document_id,user_id,source_key,checked_at,note) VALUES($1,$2,$3,NOW(),$4) ON CONFLICT(document_id) DO UPDATE SET source_key=EXCLUDED.source_key,checked_at=NOW(),note=EXCLUDED.note,updated_at=NOW() RETURNING *`,[id,uid,sourceKey,note]);return r.rows[0]
}
async function removeCheck(uid,id){await pool.query('DELETE FROM company_document_checks WHERE document_id=$1 AND user_id=$2',[id,uid])}

export async function initCompanyVerification(){if(!pool)return;await initTables()}
export async function handleCompanyVerificationRoute(req,res,url){
  if(!url.pathname.startsWith('/api/company-verification'))return false;
  if(!pool){json(res,503,{error:'Banco de dados indisponível.'});return true}
  try{
    await initTables();if(!sameOrigin(req)){json(res,403,{error:'Origem não autorizada.'});return true}
    const user=await authUser(req);if(!user){json(res,401,{error:'Faça login para continuar.'});return true}
    if(req.method==='GET'&&url.pathname==='/api/company-verification/sources'){json(res,200,{sources:Object.values(SOURCES)});return true}
    if(req.method==='GET'&&url.pathname==='/api/company-verification/readiness'){json(res,200,{readiness:await readiness(user.id)});return true}
    if(req.method==='GET'&&url.pathname==='/api/company-verification'){json(res,200,{items:await checkRows(user.id)});return true}
    let m=url.pathname.match(/^\/api\/company-verification\/(\d+)\/check$/);
    if(m&&req.method==='POST'){json(res,200,{check:await saveCheck(user.id,m[1],await readJson(req))});return true}
    if(m&&req.method==='DELETE'){await removeCheck(user.id,m[1]);json(res,200,{ok:true});return true}
    json(res,404,{error:'Rota de verificação não encontrada.'});return true
  }catch(e){json(res,e?.status||500,{error:e?.status?e.message:'Erro interno na verificação documental.'});return true}
}
