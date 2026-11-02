import { Pool } from 'pg';
import { initTenderIntelligenceV2, handleTenderIntelligenceV2Route } from './tender-intelligence-v2.mjs';

const PORT=Number(process.env.PORT||10000);
const DATABASE_URL=process.env.DATABASE_URL||'';
const pool=DATABASE_URL?new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:1,idleTimeoutMillis:30000}):null;

function uniq(values){return [...new Set((values||[]).filter(Boolean))]}
function positiveNumber(v){const n=Number(v);return Number.isFinite(n)&&n>0?n:null}
function cleanSummary(value){
  const s=String(value||'').trim();
  if(!s)return s;
  const parts=s.split(/(?<=[.!?])\s+/);
  let replaced=false;
  const out=parts.map(part=>{
    if(/metadad/i.test(part)&&/(?:R\$\s*)?\d{1,3}(?:\.\d{3})+(?:,\d{2})?|R\$\s*\d+/i.test(part)){
      replaced=true;
      return 'O PNCP consultado não apresenta valor estimado positivo nos metadados disponíveis para esta contratação.';
    }
    return part;
  });
  return{summary:out.join(' ').trim(),replaced};
}

export function reconcileTenderAuthoritativeData(result){
  const r=structuredClone(result||{}),p=r.procurement||{},a=r.analysis||{},o=a.tender_overview||{};
  if(p.object_text)o.object=p.object_text;
  if(p.org_name)o.organization=p.org_name;
  if(p.modality_name)o.modality=p.modality_name;

  const metadataValue=positiveNumber(p.estimated_value);
  let summaryChanged=false;
  if(metadataValue!==null){
    o.estimated_value=metadataValue;
    o.estimated_value_source='pncp_metadata';
    p.estimated_value=metadataValue;
  }else{
    delete o.estimated_value;
    delete p.estimated_value;
    o.estimated_value_source='not_published_in_pncp_metadata';
    const cleaned=cleanSummary(a.executive_summary);
    a.executive_summary=cleaned.summary;
    summaryChanged=cleaned.replaced;
    a.uncertainties=uniq([...(a.uncertainties||[]),'O PNCP consultado não apresenta valor estimado positivo nos metadados disponíveis; por segurança, o relatório não atribui valor estimado oficial sem fonte autoritativa confirmada.']);
  }

  a.tender_overview=o;r.analysis=a;r.procurement=p;
  r.diagnostics={...(r.diagnostics||{}),authoritative_reconciliation:'pncp-metadata-v1',estimated_value_source:o.estimated_value_source,estimated_value_summary_corrected:summaryChanged};
  return r;
}

function captureResponse(){
  const headers=new Map();
  return{
    statusCode:200,headersSent:false,body:'',
    setHeader(name,value){headers.set(String(name).toLowerCase(),value)},
    getHeader(name){return headers.get(String(name).toLowerCase())},
    getHeaders(){return Object.fromEntries(headers)},
    end(body=''){this.body=Buffer.isBuffer(body)?body.toString('utf8'):String(body??'');this.headersSent=true}
  };
}
async function authUser(req){
  try{const r=await fetch(`http://127.0.0.1:${PORT}/api/me`,{headers:{cookie:String(req.headers.cookie||'')},signal:AbortSignal.timeout(5000)});if(!r.ok)return null;return(await r.json().catch(()=>({}))).user||null}catch{return null}
}
async function persistReconciled(userId,result){
  if(!pool||!userId||!result?.procurement?.pncp_key)return;
  await pool.query(`UPDATE tender_intelligence_analyses SET analysis=$3::jsonb, readiness=$4::jsonb, diagnostics=$5::jsonb WHERE user_id=$1 AND pncp_key=$2`,[userId,result.procurement.pncp_key,JSON.stringify(result.analysis||{}),result.readiness?JSON.stringify(result.readiness):null,JSON.stringify(result.diagnostics||{})]);
}
function flushCaptured(res,captured,bodyOverride=null){
  res.statusCode=captured.statusCode;
  for(const [name,value] of Object.entries(captured.getHeaders()))res.setHeader(name,value);
  res.setHeader('X-RLB-Authoritative-Reconciliation','pncp-metadata-v1');
  res.end(bodyOverride===null?captured.body:JSON.stringify(bodyOverride));
}

export async function initTenderIntelligencePrecision(){
  await initTenderIntelligenceV2();
  console.log('tender intelligence precision guard ready: authoritative PNCP reconciliation active');
}
export async function handleTenderIntelligencePrecisionRoute(req,res,url){
  if(!(req.method==='POST'&&url.pathname==='/api/tender-intelligence/analyze'))return handleTenderIntelligenceV2Route(req,res,url);
  const captured=captureResponse();
  const handled=await handleTenderIntelligenceV2Route(req,captured,url);
  if(!handled)return false;
  if(captured.statusCode!==200){flushCaptured(res,captured);return true}
  let payload=null;try{payload=JSON.parse(captured.body||'{}')}catch{flushCaptured(res,captured);return true}
  if(!payload?.result){flushCaptured(res,captured,payload);return true}
  const reconciled=reconcileTenderAuthoritativeData(payload.result),user=await authUser(req);
  try{await persistReconciled(user?.id,reconciled)}catch(e){console.error('tender precision persist:',e?.message||e)}
  flushCaptured(res,captured,{...payload,result:reconciled});return true;
}
