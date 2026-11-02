import crypto from 'node:crypto';
import { Pool } from 'pg';
import { PDFParse } from 'pdf-parse';

const PORT=Number(process.env.PORT||10000);
const DATABASE_URL=process.env.DATABASE_URL||'';
const APP_ORIGIN=process.env.APP_ORIGIN||'';
const PNCP_API='https://pncp.gov.br/api/pncp';
const PNCP_QUERY='https://pncp.gov.br/api/consulta';
const SECRET=process.env.AI_RLB_SECRET||process.env.ADMIN_PASSWORD||process.env.DATABASE_URL||'';
const MODELS=[process.env.GEMINI_MODEL,'gemini-3.6-flash','gemini-3.5-flash-lite','gemini-3.8-flash'].filter(Boolean);
const pool=DATABASE_URL?new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:2,idleTimeoutMillis:30000}):null;
const MAX_FILE_BYTES=14*1024*1024;
const MAX_SOURCE_CHARS=180000;
const MAX_FILES=6;
let initialized=false;

const clean=(v,n=1000)=>String(v??'').trim().slice(0,n);
const digits=v=>String(v??'').replace(/\D/g,'');
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const num=v=>Number.isFinite(Number(v))?Number(v):null;
function secure(res){res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin')}
function json(res,status,data){secure(res);res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data))}
async function readJson(req,max=100000){let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>max)throw Object.assign(new Error('Payload muito grande.'),{status:413});chunks.push(c)}if(!chunks.length)return{};try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw Object.assign(new Error('JSON inválido.'),{status:400})}}
async function authUser(req){try{const r=await fetch(`http://127.0.0.1:${PORT}/api/me`,{headers:{cookie:String(req.headers.cookie||'')},signal:AbortSignal.timeout(5000)});if(!r.ok)return null;return(await r.json().catch(()=>({}))).user||null}catch{return null}}
function sameOrigin(req){return !['POST','PUT','PATCH','DELETE'].includes(req.method)||!APP_ORIGIN||!req.headers.origin||req.headers.origin===APP_ORIGIN}

async function initTables(){
  if(!pool||initialized)return;
  await pool.query(`CREATE TABLE IF NOT EXISTS tender_intelligence_analyses(
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pncp_key TEXT NOT NULL,
    org_cnpj TEXT NOT NULL,
    year INTEGER NOT NULL,
    sequence INTEGER NOT NULL,
    model TEXT,
    analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_documents JSONB NOT NULL DEFAULT '[]'::jsonb,
    readiness JSONB,
    diagnostics JSONB NOT NULL DEFAULT '{}'::jsonb,
    analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id,pncp_key)
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_tender_intelligence_user ON tender_intelligence_analyses(user_id,analyzed_at DESC)');
  initialized=true;
}

async function getProcurement(cnpj,year,sequence){
  const c=digits(cnpj).slice(0,14),y=Number(year),s=Number(sequence);
  if(c.length!==14||!Number.isInteger(y)||!Number.isInteger(s)||s<1)throw Object.assign(new Error('Identificação PNCP inválida.'),{status:400});
  if(pool){
    const r=await pool.query(`SELECT pncp_id,org_cnpj,year,sequence,modality_name,object_text,org_name,municipality,uf,estimated_value,published_at,closes_at,pncp_url,origin_url,raw FROM monitored_procurements WHERE org_cnpj=$1 AND year=$2 AND sequence=$3 ORDER BY last_seen_at DESC LIMIT 1`,[c,y,s]);
    if(r.rows[0])return r.rows[0];
  }
  const r=await fetch(`${PNCP_QUERY}/v1/orgaos/${c}/compras/${y}/${s}`,{headers:{accept:'application/json','user-agent':'RadarLicitacoesBrasil-TenderIntelligence/1.0'},signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Object.assign(new Error(`Não foi possível consultar a contratação no PNCP (${r.status}).`),{status:r.status===404?404:502});
  const raw=await r.json();
  return{pncp_id:clean(raw.numeroControlePNCP||`${c}-${y}-${s}`,180),org_cnpj:c,year:y,sequence:s,modality_name:clean(raw.modalidadeNome,180)||null,object_text:clean(raw.objetoCompra,5000)||null,org_name:clean(raw.orgaoEntidade?.razaoSocial,500)||null,municipality:clean(raw.unidadeOrgao?.municipioNome||raw.unidadeOrgao?.nomeMunicipio,180)||null,uf:clean(raw.unidadeOrgao?.ufSigla,2)||null,estimated_value:num(raw.valorTotalEstimado),published_at:raw.dataPublicacaoPncp||null,closes_at:raw.dataEncerramentoProposta||raw.dataFimRecebimentoProposta||null,pncp_url:`https://pncp.gov.br/app/editais/${c}/${y}/${s}`,origin_url:raw.linkSistemaOrigem||raw.linkProcessoEletronico||null,raw};
}

async function listPncpDocs(cnpj,year,sequence){
  const r=await fetch(`${PNCP_API}/v1/orgaos/${cnpj}/compras/${year}/${sequence}/arquivos`,{headers:{accept:'application/json','user-agent':'RadarLicitacoesBrasil-TenderIntelligence/1.0'},signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Object.assign(new Error(`PNCP documentos HTTP ${r.status}`),{status:502});
  const body=await r.json().catch(()=>[]),items=Array.isArray(body)?body:Array.isArray(body?.documentos)?body.documentos:[];
  return items.map(d=>({sequencialDocumento:Number(d.sequencialDocumento),url:clean(d.url,2200),tipoDocumentoNome:clean(d.tipoDocumentoNome,180),titulo:clean(d.titulo,300),dataPublicacaoPncp:d.dataPublicacaoPncp||null})).filter(d=>Number.isInteger(d.sequencialDocumento));
}

export function tenderDocumentPriority(doc){
  const t=norm(`${doc?.titulo||''} ${doc?.tipoDocumentoNome||''}`);let p=0;
  if(t.includes('edital'))p+=120;if(t.includes('instrumento convocatorio'))p+=115;if(t.includes('termo de referencia'))p+=100;if(t.includes('projeto basico'))p+=90;if(t.includes('estudo tecnico'))p+=55;if(t.includes('anexo'))p+=35;if(t.includes('aviso'))p+=20;if(/retifica|errata|alteracao/.test(t))p+=45;
  return p;
}
function pickDocs(docs){return [...docs].sort((a,b)=>tenderDocumentPriority(b)-tenderDocumentPriority(a)||Number(b.sequencialDocumento)-Number(a.sequencialDocumento)).filter((d,i)=>tenderDocumentPriority(d)>0||i===0).slice(0,MAX_FILES)}

async function fetchRemoteDoc(doc,ids){
  const fallback=`${PNCP_API}/v1/orgaos/${ids.cnpj}/compras/${ids.year}/${ids.sequence}/arquivos/${doc.sequencialDocumento}`;
  for(const target of [doc.url,fallback].filter(Boolean)){
    try{
      const r=await fetch(target,{headers:{accept:'application/pdf,text/plain,application/octet-stream,*/*','user-agent':'RadarLicitacoesBrasil-TenderIntelligence/1.0'},redirect:'follow',signal:AbortSignal.timeout(22000)});
      if(!r.ok)continue;
      const ct=String(r.headers.get('content-type')||'').toLowerCase(),len=Number(r.headers.get('content-length')||0);
      if(len>MAX_FILE_BYTES)throw new Error('arquivo remoto acima do limite');
      if(ct.includes('application/json')){const j=await r.json().catch(()=>({}));if(j?.urlDownload&&j.urlDownload!==target){const x=await fetch(j.urlDownload,{redirect:'follow',signal:AbortSignal.timeout(22000)});if(x.ok){const ab=await x.arrayBuffer();if(ab.byteLength<=MAX_FILE_BYTES)return{buffer:Buffer.from(ab),contentType:String(x.headers.get('content-type')||''),url:x.url||j.urlDownload}}}continue}
      const ab=await r.arrayBuffer();if(ab.byteLength>MAX_FILE_BYTES)throw new Error('arquivo remoto acima do limite');return{buffer:Buffer.from(ab),contentType:ct,url:r.url||target};
    }catch(e){console.warn('tender intelligence remote doc:',clean(e.message,180))}
  }
  return null;
}
async function pdfText(buffer){const parser=new PDFParse({data:new Uint8Array(buffer)});try{const out=await parser.getText();return clean(out?.text||'',MAX_SOURCE_CHARS)}finally{try{await parser.destroy()}catch{}}}
async function extractDocs(docs,ids){
  const used=[],errors=[];let combined='';
  for(const doc of docs){
    if(combined.length>=MAX_SOURCE_CHARS)break;
    try{
      const fetched=await fetchRemoteDoc(doc,ids);if(!fetched){errors.push({title:doc.titulo,error:'download indisponível'});continue}
      let text='';if(fetched.contentType.includes('pdf')||fetched.buffer.subarray(0,4).toString()==='%PDF')text=await pdfText(fetched.buffer);else if(fetched.contentType.includes('text'))text=fetched.buffer.toString('utf8');else{errors.push({title:doc.titulo,error:'formato não textual'});continue}
      text=clean(text,70000);if(text.trim().length<100){errors.push({title:doc.titulo,error:'sem texto extraível / possível digitalização'});continue}
      const title=doc.titulo||doc.tipoDocumentoNome||`Documento ${doc.sequencialDocumento}`;
      combined+=`\n\n===== DOCUMENTO: ${title} =====\n${text}`;
      used.push({...doc,url:fetched.url,extracted_chars:text.length});
    }catch(e){errors.push({title:doc.titulo,error:clean(e.message,180)})}
  }
  return{text:clean(combined,MAX_SOURCE_CHARS),used,errors};
}

function deriveKey(){if(!SECRET)return null;return crypto.scryptSync(SECRET,'ia-rlb-free-provider-v1',32)}
function unseal(value){const key=deriveKey();if(!key||!value)return null;try{const b=Buffer.from(String(value),'base64url'),iv=b.subarray(0,12),tag=b.subarray(12,28),enc=b.subarray(28),dec=crypto.createDecipheriv('aes-256-gcm',key,iv);dec.setAuthTag(tag);return Buffer.concat([dec.update(enc),dec.final()]).toString('utf8')}catch{return null}}
async function geminiKey(){if(process.env.GEMINI_API_KEY)return process.env.GEMINI_API_KEY;if(!pool)return null;const r=await pool.query("SELECT api_key_cipher FROM ai_provider_settings WHERE id=1 AND provider='gemini' AND enabled=TRUE LIMIT 1");return unseal(r.rows[0]?.api_key_cipher)}

function stripFence(v){return String(v||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim()}
export function parseTenderIntelligenceJson(text){const parsed=JSON.parse(stripFence(text));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('Resposta estruturada inválida.');return parsed}
function safeArray(v,max=30){return Array.isArray(v)?v.slice(0,max):[]}
function safeEvidence(v){return{document_title:clean(v?.document_title,300)||null,section:clean(v?.section,180)||null,page:Number.isInteger(Number(v?.page))?Number(v.page):null,quote:clean(v?.quote,450)||null}}
export function normalizeTenderIntelligence(raw){
  const overview=raw?.tender_overview||{};
  const req=safeArray(raw?.requirements,40).map(x=>({category:clean(x?.category,120)||'Outros',title:clean(x?.title,220)||'Requisito',requirement:clean(x?.requirement,1200)||null,mandatory:x?.mandatory!==false,risk_level:['low','medium','high','critical'].includes(x?.risk_level)?x.risk_level:'medium',evidence:safeEvidence(x?.evidence)}));
  const points=safeArray(raw?.critical_points,20).map(x=>({title:clean(x?.title,220)||'Ponto de atenção',detail:clean(x?.detail,1200)||null,risk_level:['low','medium','high','critical'].includes(x?.risk_level)?x.risk_level:'medium',evidence:safeEvidence(x?.evidence)}));
  const deadlines=safeArray(raw?.deadlines,20).map(x=>({label:clean(x?.label,180)||'Prazo',date:clean(x?.date,80)||null,detail:clean(x?.detail,700)||null,evidence:safeEvidence(x?.evidence)}));
  return{
    executive_summary:clean(raw?.executive_summary,3500)||'Resumo automático indisponível.',
    confidence:['high','medium','low'].includes(raw?.confidence)?raw.confidence:'low',
    tender_overview:{object:clean(overview.object,5000)||null,organization:clean(overview.organization,500)||null,modality:clean(overview.modality,180)||null,estimated_value:num(overview.estimated_value),session_date:clean(overview.session_date,80)||null,judgment_criterion:clean(overview.judgment_criterion,240)||null,dispute_mode:clean(overview.dispute_mode,240)||null,delivery_deadline:clean(overview.delivery_deadline,300)||null,payment_terms:clean(overview.payment_terms,500)||null},
    requirements:req,
    critical_points:points,
    deadlines,
    me_epp:{has_specific_rule:Boolean(raw?.me_epp?.has_specific_rule),summary:clean(raw?.me_epp?.summary,1200)||null,evidence:safeEvidence(raw?.me_epp?.evidence)},
    guarantees:{required:Boolean(raw?.guarantees?.required),summary:clean(raw?.guarantees?.summary,1200)||null,evidence:safeEvidence(raw?.guarantees?.evidence)},
    samples_or_visit:{required:Boolean(raw?.samples_or_visit?.required),summary:clean(raw?.samples_or_visit?.summary,1200)||null,evidence:safeEvidence(raw?.samples_or_visit?.evidence)},
    sanctions_summary:clean(raw?.sanctions_summary,1500)||null,
    uncertainties:safeArray(raw?.uncertainties,20).map(x=>clean(x,500)).filter(Boolean)
  };
}

const SYSTEM=`Você é o motor de Análise Inteligente de Editais do Radar de Licitações Brasil. Sua função é extrair fatos do edital e anexos fornecidos, sem inventar informações. Regras obrigatórias:\n1. Use EXCLUSIVAMENTE os documentos e metadados fornecidos nesta chamada.\n2. Quando um dado não estiver claramente localizado, use null, false ou registre em uncertainties.\n3. Não conclua que uma empresa está habilitada ou inabilitada; isso será tratado por outro módulo.\n4. Toda exigência relevante e todo ponto crítico deve conter evidence com document_title e quote curto. section e page só podem ser preenchidos quando estiverem explicitamente identificáveis no texto.\n5. Não invente artigo, item, página, prazo, percentual, valor, conselho profissional ou requisito.\n6. Separe fatos do edital de interpretação. risk_level apenas classifica impacto operacional da exigência, não é decisão jurídica.\n7. Responda SOMENTE JSON válido, sem markdown.`;
function promptFor(p,text){return `${SYSTEM}\n\nMETADADOS PNCP:\n${JSON.stringify({object:p.object_text,organization:p.org_name,modality:p.modality_name,municipality:p.municipality,uf:p.uf,estimated_value:p.estimated_value,published_at:p.published_at,closes_at:p.closes_at})}\n\nDOCUMENTOS EXTRAÍDOS:\n${text}\n\nRetorne exatamente esta estrutura JSON:\n{"executive_summary":"string","confidence":"high|medium|low","tender_overview":{"object":"string|null","organization":"string|null","modality":"string|null","estimated_value":0,"session_date":"string|null","judgment_criterion":"string|null","dispute_mode":"string|null","delivery_deadline":"string|null","payment_terms":"string|null"},"requirements":[{"category":"Habilitação Jurídica|Fiscal e Trabalhista|Qualificação Técnica|Econômico-Financeira|Proposta|Execução|Outros","title":"string","requirement":"string","mandatory":true,"risk_level":"low|medium|high|critical","evidence":{"document_title":"string","section":"string|null","page":null,"quote":"string"}}],"critical_points":[{"title":"string","detail":"string","risk_level":"low|medium|high|critical","evidence":{"document_title":"string","section":"string|null","page":null,"quote":"string"}}],"deadlines":[{"label":"string","date":"string|null","detail":"string|null","evidence":{"document_title":"string","section":"string|null","page":null,"quote":"string"}}],"me_epp":{"has_specific_rule":false,"summary":"string|null","evidence":{"document_title":"string|null","section":"string|null","page":null,"quote":"string|null"}},"guarantees":{"required":false,"summary":"string|null","evidence":{"document_title":"string|null","section":"string|null","page":null,"quote":"string|null"}},"samples_or_visit":{"required":false,"summary":"string|null","evidence":{"document_title":"string|null","section":"string|null","page":null,"quote":"string|null"}},"sanctions_summary":"string|null","uncertainties":["string"]}`}

async function callGemini(p,text){
  const key=await geminiKey();if(!key)throw Object.assign(new Error('Gemini não está configurado para a Análise Inteligente de Edital.'),{status:503});
  let last=null;
  for(const model of [...new Set(MODELS)]){
    try{
      const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},signal:AbortSignal.timeout(45000),body:JSON.stringify({contents:[{role:'user',parts:[{text:promptFor(p,text)}]}],generationConfig:{temperature:0.1,maxOutputTokens:3200,responseMimeType:'application/json',thinkingConfig:{thinkingLevel:'low'}}})});
      const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data?.error?.message||`Gemini ${model} HTTP ${r.status}`);
      const output=(data.candidates?.[0]?.content?.parts||[]).map(x=>x.text||'').join('').trim();if(!output)throw new Error(`Gemini ${model} não retornou conteúdo.`);
      return{model,analysis:normalizeTenderIntelligence(parseTenderIntelligenceJson(output))};
    }catch(e){last=e;console.warn('tender intelligence Gemini:',model,clean(e.message,240))}
  }
  throw Object.assign(new Error(`A IA não conseguiu concluir a análise agora${last?.message?`: ${clean(last.message,180)}`:''}.`),{status:503});
}

async function getReadiness(req,p){
  try{
    const r=await fetch(`http://127.0.0.1:${PORT}/api/tender-readiness/analyze`,{method:'POST',headers:{cookie:String(req.headers.cookie||''),'content-type':'application/json',accept:'application/json'},body:JSON.stringify({cnpj:p.org_cnpj,year:p.year,sequence:p.sequence}),signal:AbortSignal.timeout(45000)});
    if(!r.ok)return null;return(await r.json().catch(()=>({}))).analysis||null;
  }catch{return null}
}
async function save(uid,p,result){
  const key=`${p.org_cnpj}-${p.year}-${p.sequence}`;
  await pool.query(`INSERT INTO tender_intelligence_analyses(user_id,pncp_key,org_cnpj,year,sequence,model,analysis,source_documents,readiness,diagnostics,analyzed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW()) ON CONFLICT(user_id,pncp_key) DO UPDATE SET model=EXCLUDED.model,analysis=EXCLUDED.analysis,source_documents=EXCLUDED.source_documents,readiness=EXCLUDED.readiness,diagnostics=EXCLUDED.diagnostics,analyzed_at=NOW()`,[uid,key,p.org_cnpj,p.year,p.sequence,result.model,JSON.stringify(result.analysis),JSON.stringify(result.source_documents),result.readiness?JSON.stringify(result.readiness):null,JSON.stringify(result.diagnostics)]);
}

async function analyze(req,uid,b){
  const p=await getProcurement(b.cnpj,b.year,b.sequence),all=await listPncpDocs(p.org_cnpj,p.year,p.sequence),picked=pickDocs(all),extracted=await extractDocs(picked,{cnpj:p.org_cnpj,year:p.year,sequence:p.sequence});
  if(!extracted.text||extracted.used.length===0)throw Object.assign(new Error('Não foi possível extrair texto suficiente do edital/anexos para uma análise confiável. O documento pode estar digitalizado como imagem ou indisponível no PNCP.'),{status:422});
  const ai=await callGemini(p,extracted.text),readiness=await getReadiness(req,p);
  const result={procurement:{pncp_key:`${p.org_cnpj}-${p.year}-${p.sequence}`,org_cnpj:p.org_cnpj,year:p.year,sequence:p.sequence,object_text:p.object_text,org_name:p.org_name,modality_name:p.modality_name,municipality:p.municipality,uf:p.uf,estimated_value:p.estimated_value,closes_at:p.closes_at,pncp_url:p.pncp_url,origin_url:p.origin_url},model:ai.model,analysis:ai.analysis,readiness,source_documents:extracted.used.map(d=>({sequencialDocumento:d.sequencialDocumento,titulo:d.titulo,tipoDocumentoNome:d.tipoDocumentoNome,url:d.url,extracted_chars:d.extracted_chars})),diagnostics:{pncp_documents:all.length,selected_documents:picked.length,read_documents:extracted.used.length,extracted_chars:extracted.text.length,errors:extracted.errors,grounding:'document-only',notice:'A IA foi instruída a usar somente os documentos extraídos do PNCP. Itens sem evidência devem ser tratados como não confirmados.'}};
  await save(uid,p,result);return result;
}

export async function initTenderIntelligence(){if(!pool)return;await initTables();console.log('tender intelligence v1 ready: grounded edital analysis + documental readiness')}
export async function handleTenderIntelligenceRoute(req,res,url){
  if(!url.pathname.startsWith('/api/tender-intelligence'))return false;
  if(!pool){json(res,503,{error:'Banco de dados indisponível.'});return true}
  try{
    await initTables();if(!sameOrigin(req)){json(res,403,{error:'Origem não autorizada.'});return true}
    const user=await authUser(req);if(!user){json(res,401,{error:'Faça login para continuar.'});return true}
    if(req.method==='POST'&&url.pathname==='/api/tender-intelligence/analyze'){json(res,200,{result:await analyze(req,user.id,await readJson(req))});return true}
    if(req.method==='GET'&&url.pathname==='/api/tender-intelligence/history'){
      const limit=Math.min(Math.max(Number(url.searchParams.get('limit')||10),1),30);const r=await pool.query(`SELECT pncp_key,org_cnpj,year,sequence,model,analysis,source_documents,diagnostics,analyzed_at FROM tender_intelligence_analyses WHERE user_id=$1 ORDER BY analyzed_at DESC LIMIT $2`,[user.id,limit]);json(res,200,{items:r.rows});return true
    }
    json(res,404,{error:'Rota de análise inteligente não encontrada.'});return true;
  }catch(e){console.error('tender intelligence:',e?.stack||e);json(res,e?.status||500,{error:e?.status?e.message:'Erro interno na Análise Inteligente de Edital.'});return true}
}
