import { Pool } from 'pg';

const PORT=Number(process.env.PORT||10000);
const DATABASE_URL=process.env.DATABASE_URL||'';
const APP_ORIGIN=process.env.APP_ORIGIN||'';
const pool=DATABASE_URL?new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:2,idleTimeoutMillis:30000}):null;
const BASELINE=[
  ['cartao_cnpj','Cartão do CNPJ'],['contrato_social','Contrato Social / ato constitutivo'],['federal','Certidão Federal / RFB e PGFN'],['fgts','CRF do FGTS'],['cndt','CNDT'],['estadual','Certidão Estadual'],['municipal','Certidão Municipal'],['falencia','Certidão de Falência / Recuperação Judicial'],['balanco','Balanço Patrimonial e Demonstrações Contábeis']
];
const NO_NATURAL_EXPIRY=new Set(['cartao_cnpj','contrato_social']);
const clean=(v,n=500)=>String(v??'').trim().slice(0,n);
const digits=v=>String(v??'').replace(/\D/g,'');
function secure(res){res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY')}
function json(res,status,data){secure(res);res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data))}
async function readJson(req,max=80_000){let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>max)throw Object.assign(new Error('Payload muito grande.'),{status:413});chunks.push(c)}if(!chunks.length)return{};try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw Object.assign(new Error('JSON inválido.'),{status:400})}}
async function authUser(req){try{const r=await fetch(`http://127.0.0.1:${PORT}/api/me`,{headers:{cookie:String(req.headers.cookie||'')},signal:AbortSignal.timeout(5000)});if(!r.ok)return null;return(await r.json().catch(()=>({}))).user||null}catch{return null}}
function sameOrigin(req){return !['POST','PUT','PATCH','DELETE'].includes(req.method)||!APP_ORIGIN||!req.headers.origin||req.headers.origin===APP_ORIGIN}
function dateOnly(v){if(!v)return null;const s=String(v).slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:null}
function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function docAtReference(doc,reference){if(!doc)return{state:'missing',weight:0};const expiry=dateOnly(doc.expiry_date);if(!expiry)return NO_NATURAL_EXPIRY.has(doc.doc_type)?{state:'ok',weight:1}:{state:'unknown_validity',weight:.65};if(expiry<reference)return{state:'expired_at_reference',weight:0};return{state:'ok',weight:1}}
function technicalHint(text){const s=String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();return /(obra|engenharia|reforma|construcao|manutencao predial|servico tecnico|projeto executivo|instalacao eletrica|pavimentacao|drenagem|estrutura metalica)/.test(s)}
function normalizedItems(raw){const seen=new Set(),out=[];for(const x of Array.isArray(raw)?raw:[]){const cnpj=digits(x?.cnpj).slice(0,14),year=Number(x?.year),sequence=Number(x?.sequence);if(cnpj.length!==14||!Number.isInteger(year)||!Number.isInteger(sequence)||sequence<1)continue;const key=`${cnpj}-${year}-${sequence}`;if(seen.has(key))continue;seen.add(key);out.push({cnpj,year,sequence});if(out.length>=80)break}return out}
async function currentDocs(uid){const r=await pool.query(`SELECT doc_type,expiry_date FROM company_documents WHERE user_id=$1 AND is_current=TRUE`,[uid]);const map=new Map();for(const d of r.rows)if(!map.has(d.doc_type))map.set(d.doc_type,d);return map}
async function procurementRows(items){if(!items.length)return[];const r=await pool.query(`SELECT x.cnpj,x.year,x.sequence,m.closes_at,m.object_text,m.modality_name
FROM jsonb_to_recordset($1::jsonb) AS x(cnpj text,year int,sequence int)
LEFT JOIN LATERAL (
  SELECT closes_at,object_text,modality_name FROM monitored_procurements
  WHERE org_cnpj=x.cnpj AND year=x.year AND sequence=x.sequence
  ORDER BY last_seen_at DESC LIMIT 1
) m ON TRUE`,[JSON.stringify(items)]);return r.rows}
async function scoreItems(uid,items){const docs=await currentDocs(uid),rows=await procurementRows(items);return rows.map(row=>{const reference=dateOnly(row.closes_at)||today();let points=0,missing=0,expired=0,unknown=0;for(const [type] of BASELINE){const s=docAtReference(docs.get(type),reference);points+=s.weight;if(s.state==='missing')missing++;else if(s.state==='expired_at_reference')expired++;else if(s.state==='unknown_validity')unknown++}const score=Math.round(points/BASELINE.length*100),blockers=missing+expired,status=blockers===0&&score>=90?'high':score>=70?'attention':'low';return{key:`${row.cnpj}-${row.year}-${row.sequence}`,cnpj:row.cnpj,year:row.year,sequence:row.sequence,score,status,reference_date:reference,missing,expired,unknown,blockers,technical_review:technicalHint(row.object_text),label:status==='high'?'Prontidão alta':status==='attention'?'Atenção documental':'Pendências documentais',notice:'Pontuação rápida baseada no checklist documental e na validade na data da oportunidade. Clique para análise completa do edital.'}})}

export async function handleTenderReadinessQuickRoute(req,res,url){
  if(!url.pathname.startsWith('/api/tender-readiness-quick'))return false;
  if(!pool){json(res,503,{error:'Banco de dados indisponível.'});return true}
  try{
    if(!sameOrigin(req)){json(res,403,{error:'Origem não autorizada.'});return true}
    const user=await authUser(req);if(!user){json(res,401,{error:'Faça login para visualizar sua prontidão.'});return true}
    if(req.method==='POST'&&url.pathname==='/api/tender-readiness-quick/score'){
      const body=await readJson(req),items=normalizedItems(body.items);if(!items.length){json(res,200,{items:[]});return true}
      json(res,200,{items:await scoreItems(user.id,items),baseline_count:BASELINE.length,generated_at:new Date().toISOString()});return true
    }
    json(res,404,{error:'Rota de prontidão rápida não encontrada.'});return true
  }catch(e){console.error('tender readiness quick:',e?.message||e);json(res,e?.status||500,{error:e?.status?e.message:'Erro interno na prontidão rápida.'});return true}
}
