import crypto from 'node:crypto';
import { Pool } from 'pg';
import { PDFParse } from 'pdf-parse';

const PORT=Number(process.env.PORT||10000);
const DATABASE_URL=process.env.DATABASE_URL||'';
const PNCP_API='https://pncp.gov.br/api/pncp';
const PNCP_QUERY='https://pncp.gov.br/api/consulta';
const SECRET=process.env.AI_RLB_SECRET||process.env.ADMIN_PASSWORD||process.env.DATABASE_URL||'';
const MODELS=[process.env.GEMINI_MODEL,'gemini-3.6-flash','gemini-3.5-flash-lite','gemini-3.8-flash'].filter(Boolean);
const pool=DATABASE_URL?new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:2,idleTimeoutMillis:30000}):null;
const MAX_FILE_BYTES=18*1024*1024;
const MAX_SOURCE_CHARS=280000;
const MAX_DOC_CHARS=85000;
const MAX_FILES=10;
let initialized=false;

const clean=(v,n=1000)=>String(v??'').trim().slice(0,n);
const digits=v=>String(v??'').replace(/\D/g,'');
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const num=v=>Number.isFinite(Number(v))?Number(v):null;
const compact=v=>String(v??'').replace(/\s+/g,' ').trim();
function secure(res){res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin')}
function json(res,status,data){secure(res);res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data))}
async function readJson(req,max=120000){let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>max)throw Object.assign(new Error('Payload muito grande.'),{status:413});chunks.push(c)}if(!chunks.length)return{};try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw Object.assign(new Error('JSON inválido.'),{status:400})}}
async function authUser(req){try{const r=await fetch(`http://127.0.0.1:${PORT}/api/me`,{headers:{cookie:String(req.headers.cookie||'')},signal:AbortSignal.timeout(5000)});if(!r.ok)return null;return(await r.json().catch(()=>({}))).user||null}catch{return null}}

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
  const r=await fetch(`${PNCP_QUERY}/v1/orgaos/${c}/compras/${y}/${s}`,{headers:{accept:'application/json','user-agent':'RadarLicitacoesBrasil-TenderIntelligence/2.0'},signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Object.assign(new Error(`Não foi possível consultar a contratação no PNCP (${r.status}).`),{status:r.status===404?404:502});
  const raw=await r.json();
  return{pncp_id:clean(raw.numeroControlePNCP||`${c}-${y}-${s}`,180),org_cnpj:c,year:y,sequence:s,modality_name:clean(raw.modalidadeNome,180)||null,object_text:clean(raw.objetoCompra,5000)||null,org_name:clean(raw.orgaoEntidade?.razaoSocial,500)||null,municipality:clean(raw.unidadeOrgao?.municipioNome||raw.unidadeOrgao?.nomeMunicipio,180)||null,uf:clean(raw.unidadeOrgao?.ufSigla,2)||null,estimated_value:num(raw.valorTotalEstimado),published_at:raw.dataPublicacaoPncp||null,closes_at:raw.dataEncerramentoProposta||raw.dataFimRecebimentoProposta||null,pncp_url:`https://pncp.gov.br/app/editais/${c}/${y}/${s}`,origin_url:raw.linkSistemaOrigem||raw.linkProcessoEletronico||null,raw};
}

async function listPncpDocs(cnpj,year,sequence){
  const r=await fetch(`${PNCP_API}/v1/orgaos/${cnpj}/compras/${year}/${sequence}/arquivos`,{headers:{accept:'application/json','user-agent':'RadarLicitacoesBrasil-TenderIntelligence/2.0'},signal:AbortSignal.timeout(18000)});
  if(!r.ok)throw Object.assign(new Error(`PNCP documentos HTTP ${r.status}`),{status:502});
  const body=await r.json().catch(()=>[]),items=Array.isArray(body)?body:Array.isArray(body?.documentos)?body.documentos:[];
  return items.map(d=>({sequencialDocumento:Number(d.sequencialDocumento),url:clean(d.url,2200),tipoDocumentoNome:clean(d.tipoDocumentoNome,180),titulo:clean(d.titulo,300),dataPublicacaoPncp:d.dataPublicacaoPncp||null})).filter(d=>Number.isInteger(d.sequencialDocumento));
}

export function tenderDocumentPriorityV2(doc){
  const t=norm(`${doc?.titulo||''} ${doc?.tipoDocumentoNome||''}`);let p=0;
  if(/retifica|errata|alteracao|adendo/.test(t))p+=165;
  if(t.includes('edital'))p+=150;
  if(t.includes('instrumento convocatorio'))p+=145;
  if(t.includes('termo de referencia'))p+=135;
  if(t.includes('projeto basico')||t.includes('projeto executivo'))p+=125;
  if(t.includes('planilha')||t.includes('orcament')||t.includes('composicao de custos'))p+=105;
  if(t.includes('minuta')&&t.includes('contrato'))p+=95;
  if(t.includes('cronograma'))p+=90;
  if(t.includes('estudo tecnico')||t.includes('etp'))p+=75;
  if(t.includes('anexo'))p+=55;
  if(t.includes('aviso'))p+=30;
  return p;
}
export function pickTenderDocsV2(docs){
  const sorted=[...docs].sort((a,b)=>tenderDocumentPriorityV2(b)-tenderDocumentPriorityV2(a)||Number(b.sequencialDocumento)-Number(a.sequencialDocumento));
  const selected=[];
  for(const d of sorted){if(selected.length>=MAX_FILES)break;if(tenderDocumentPriorityV2(d)>0||selected.length===0)selected.push(d)}
  return selected;
}

async function fetchRemoteDoc(doc,ids){
  const fallback=`${PNCP_API}/v1/orgaos/${ids.cnpj}/compras/${ids.year}/${ids.sequence}/arquivos/${doc.sequencialDocumento}`;
  for(const target of [doc.url,fallback].filter(Boolean)){
    try{
      const r=await fetch(target,{headers:{accept:'application/pdf,text/plain,application/octet-stream,*/*','user-agent':'RadarLicitacoesBrasil-TenderIntelligence/2.0'},redirect:'follow',signal:AbortSignal.timeout(26000)});
      if(!r.ok)continue;
      const ct=String(r.headers.get('content-type')||'').toLowerCase(),len=Number(r.headers.get('content-length')||0);
      if(len>MAX_FILE_BYTES)throw new Error('arquivo remoto acima do limite');
      if(ct.includes('application/json')){const j=await r.json().catch(()=>({}));if(j?.urlDownload&&j.urlDownload!==target){const x=await fetch(j.urlDownload,{redirect:'follow',signal:AbortSignal.timeout(26000)});if(x.ok){const ab=await x.arrayBuffer();if(ab.byteLength<=MAX_FILE_BYTES)return{buffer:Buffer.from(ab),contentType:String(x.headers.get('content-type')||''),url:x.url||j.urlDownload}}}continue}
      const ab=await r.arrayBuffer();if(ab.byteLength>MAX_FILE_BYTES)throw new Error('arquivo remoto acima do limite');return{buffer:Buffer.from(ab),contentType:ct,url:r.url||target};
    }catch(e){console.warn('tender intelligence v2 remote doc:',clean(e.message,180))}
  }
  return null;
}
async function pdfText(buffer){const parser=new PDFParse({data:new Uint8Array(buffer)});try{const out=await parser.getText();return clean(out?.text||'',MAX_DOC_CHARS)}finally{try{await parser.destroy()}catch{}}}
async function extractDocs(docs,ids){
  const used=[],errors=[];let combined='';
  for(const doc of docs){
    if(combined.length>=MAX_SOURCE_CHARS)break;
    try{
      const fetched=await fetchRemoteDoc(doc,ids);if(!fetched){errors.push({title:doc.titulo,error:'download indisponível'});continue}
      let text='';if(fetched.contentType.includes('pdf')||fetched.buffer.subarray(0,4).toString()==='%PDF')text=await pdfText(fetched.buffer);else if(fetched.contentType.includes('text'))text=fetched.buffer.toString('utf8');else{errors.push({title:doc.titulo,error:'formato não textual'});continue}
      text=clean(text,MAX_DOC_CHARS);if(text.trim().length<100){errors.push({title:doc.titulo,error:'sem texto extraível / possível digitalização'});continue}
      const title=doc.titulo||doc.tipoDocumentoNome||`Documento ${doc.sequencialDocumento}`;
      const marker=`DOC-${doc.sequencialDocumento}`;
      combined+=`\n\n===== ${marker} | DOCUMENTO: ${title} =====\n${text}`;
      used.push({...doc,marker,url:fetched.url,extracted_chars:text.length});
    }catch(e){errors.push({title:doc.titulo,error:clean(e.message,180)})}
  }
  return{text:clean(combined,MAX_SOURCE_CHARS),used,errors};
}

function deriveKey(){if(!SECRET)return null;return crypto.scryptSync(SECRET,'ia-rlb-free-provider-v1',32)}
function unseal(value){const key=deriveKey();if(!key||!value)return null;try{const b=Buffer.from(String(value),'base64url'),iv=b.subarray(0,12),tag=b.subarray(12,28),enc=b.subarray(28),dec=crypto.createDecipheriv('aes-256-gcm',key,iv);dec.setAuthTag(tag);return Buffer.concat([dec.update(enc),dec.final()]).toString('utf8')}catch{return null}}
async function geminiKey(){if(process.env.GEMINI_API_KEY)return process.env.GEMINI_API_KEY;if(!pool)return null;const r=await pool.query("SELECT api_key_cipher FROM ai_provider_settings WHERE id=1 AND provider='gemini' AND enabled=TRUE LIMIT 1");return unseal(r.rows[0]?.api_key_cipher)}

function stripFence(v){return String(v||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim()}
export function parseTenderIntelligenceV2Json(text){const parsed=JSON.parse(stripFence(text));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('Resposta estruturada inválida.');return parsed}
function safeArray(v,max=50){return Array.isArray(v)?v.slice(0,max):[]}
function safeEvidence(v){return{document_title:clean(v?.document_title,300)||null,document_marker:clean(v?.document_marker,80)||null,section:clean(v?.section,180)||null,page:Number.isInteger(Number(v?.page))?Number(v.page):null,quote:clean(v?.quote,650)||null,verified:Boolean(v?.verified)}}
function sectionSummary(v){return{summary:clean(v?.summary,2400)||null,evidence:safeArray(v?.evidence,8).map(safeEvidence)}}

export function normalizeTenderIntelligenceV2(raw){
  const overview=raw?.tender_overview||{},proposal=raw?.proposal_and_bidding||{},execution=raw?.execution_and_contract||{},financial=raw?.economic_financial||{},technical=raw?.technical_qualification||{},participation=raw?.participation_rules||{};
  const req=safeArray(raw?.requirements,70).map(x=>({category:clean(x?.category,140)||'Outros',title:clean(x?.title,240)||'Requisito',requirement:clean(x?.requirement,1800)||null,mandatory:x?.mandatory!==false,risk_level:['low','medium','high','critical'].includes(x?.risk_level)?x.risk_level:'medium',recommended_action:clean(x?.recommended_action,900)||null,evidence:safeEvidence(x?.evidence)}));
  const points=safeArray(raw?.critical_points,30).map(x=>({title:clean(x?.title,240)||'Ponto de atenção',detail:clean(x?.detail,1600)||null,risk_level:['low','medium','high','critical'].includes(x?.risk_level)?x.risk_level:'medium',recommended_action:clean(x?.recommended_action,900)||null,evidence:safeEvidence(x?.evidence)}));
  const deadlines=safeArray(raw?.deadlines,30).map(x=>({label:clean(x?.label,200)||'Prazo',date:clean(x?.date,100)||null,detail:clean(x?.detail,900)||null,evidence:safeEvidence(x?.evidence)}));
  const items=safeArray(raw?.scope_items_lots,40).map(x=>({lot_or_item:clean(x?.lot_or_item,180)||null,description:clean(x?.description,1200)||null,quantity:clean(x?.quantity,180)||null,estimated_value:num(x?.estimated_value),exclusive_me_epp:Boolean(x?.exclusive_me_epp),evidence:safeEvidence(x?.evidence)}));
  return{
    report_version:'2.0-verified',
    executive_summary:clean(raw?.executive_summary,6000)||'Resumo automático indisponível.',
    conclusion_for_participant:clean(raw?.conclusion_for_participant,3500)||null,
    confidence:['high','medium','low'].includes(raw?.confidence)?raw.confidence:'low',
    tender_overview:{process_number:clean(overview.process_number,180)||null,object:clean(overview.object,6000)||null,organization:clean(overview.organization,500)||null,modality:clean(overview.modality,180)||null,legal_basis:clean(overview.legal_basis,500)||null,estimated_value:num(overview.estimated_value),session_date:clean(overview.session_date,100)||null,proposal_deadline:clean(overview.proposal_deadline,100)||null,judgment_criterion:clean(overview.judgment_criterion,300)||null,dispute_mode:clean(overview.dispute_mode,300)||null,execution_regime:clean(overview.execution_regime,300)||null,award_criterion:clean(overview.award_criterion,300)||null,place_of_execution_or_delivery:clean(overview.place_of_execution_or_delivery,700)||null,proposal_validity:clean(overview.proposal_validity,300)||null,contract_validity:clean(overview.contract_validity,300)||null},
    scope_items_lots:items,
    participation_rules:{summary:clean(participation.summary,2400)||null,consortium:clean(participation.consortium,700)||null,cooperatives:clean(participation.cooperatives,700)||null,me_epp:clean(participation.me_epp,1600)||null,restrictions:clean(participation.restrictions,1600)||null,evidence:safeArray(participation.evidence,10).map(safeEvidence)},
    proposal_and_bidding:{proposal_requirements:clean(proposal.proposal_requirements,2800)||null,bid_rules:clean(proposal.bid_rules,2200)||null,negotiation:clean(proposal.negotiation,1200)||null,exequibility:clean(proposal.exequibility,1800)||null,samples_or_catalogs:clean(proposal.samples_or_catalogs,1800)||null,visit_or_inspection:clean(proposal.visit_or_inspection,1800)||null,evidence:safeArray(proposal.evidence,12).map(safeEvidence)},
    technical_qualification:{summary:clean(technical.summary,3000)||null,registrations:clean(technical.registrations,1800)||null,certificates:clean(technical.certificates,2400)||null,minimum_quantities:clean(technical.minimum_quantities,1800)||null,professional_requirements:clean(technical.professional_requirements,1800)||null,evidence:safeArray(technical.evidence,15).map(safeEvidence)},
    economic_financial:{summary:clean(financial.summary,2600)||null,balance_sheet:clean(financial.balance_sheet,1800)||null,indices:clean(financial.indices,1800)||null,capital_or_net_worth:clean(financial.capital_or_net_worth,1800)||null,bid_or_contract_guarantee:clean(financial.bid_or_contract_guarantee,1800)||null,evidence:safeArray(financial.evidence,15).map(safeEvidence)},
    execution_and_contract:{delivery_or_execution_deadline:clean(execution.delivery_or_execution_deadline,1200)||null,payment_terms:clean(execution.payment_terms,1800)||null,warranty:clean(execution.warranty,1200)||null,subcontracting:clean(execution.subcontracting,1200)||null,contract_management:clean(execution.contract_management,1400)||null,price_adjustment:clean(execution.price_adjustment,1400)||null,penalties:clean(execution.penalties,2200)||null,evidence:safeArray(execution.evidence,15).map(safeEvidence)},
    requirements:req,
    critical_points:points,
    deadlines,
    legal_and_procedural_notes:sectionSummary(raw?.legal_and_procedural_notes||{}),
    clarification_or_challenge_points:safeArray(raw?.clarification_or_challenge_points,20).map(x=>({title:clean(x?.title,220)||'Ponto para conferência',detail:clean(x?.detail,1400)||null,evidence:safeEvidence(x?.evidence)})),
    human_review_checklist:safeArray(raw?.human_review_checklist,30).map(x=>clean(x,700)).filter(Boolean),
    uncertainties:safeArray(raw?.uncertainties,30).map(x=>clean(x,700)).filter(Boolean)
  };
}

const SYSTEM_BASE=`Você é o motor de análise técnica de editais do Radar de Licitações Brasil. Produza uma análise COMPLETA, DETALHADA, CAUTELOSA e verificável para apoiar empresas participantes de licitações públicas. Regras obrigatórias:\n1. Use EXCLUSIVAMENTE os metadados e documentos fornecidos nesta chamada.\n2. Não invente cláusulas, itens, páginas, artigos, valores, percentuais, prazos, documentos, exigências, conselhos profissionais ou conclusões jurídicas.\n3. Quando algo não estiver claramente comprovado, use null ou registre em uncertainties/human_review_checklist.\n4. Não declare a empresa habilitada ou inabilitada. A situação documental da empresa é calculada por outro módulo.\n5. Toda afirmação relevante deve, sempre que possível, trazer evidence com document_title, document_marker e quote curto e literal. section e page só podem ser preenchidos se identificáveis no texto.\n6. Diferencie fatos expressos do edital de interpretação operacional.\n7. Leia edital E anexos em conjunto. Retificações, erratas e adendos prevalecem sobre trechos anteriores quando houver conflito explícito.\n8. Faça cobertura obrigatória de: objeto/escopo/lotes, participação e ME/EPP, proposta, disputa/julgamento, habilitação jurídica/fiscal/trabalhista/técnica/econômico-financeira, atestados e quantitativos mínimos, balanço/índices/capital, garantias, amostras/catálogos, visita técnica, prazos, execução/entrega, pagamento, reajuste/reequilíbrio, subcontratação, fiscalização/gestão, sanções, impugnações/esclarecimentos/recursos e pontos de risco.\n9. Se o edital não exigir algo, só diga 'não localizado' quando você realmente tiver pesquisado o conjunto documental fornecido; caso haja dúvida, registre como incerteza.\n10. Responda SOMENTE JSON válido, sem markdown.`;

const SCHEMA=`{"executive_summary":"string","conclusion_for_participant":"string|null","confidence":"high|medium|low","tender_overview":{"process_number":"string|null","object":"string|null","organization":"string|null","modality":"string|null","legal_basis":"string|null","estimated_value":0,"session_date":"string|null","proposal_deadline":"string|null","judgment_criterion":"string|null","dispute_mode":"string|null","execution_regime":"string|null","award_criterion":"string|null","place_of_execution_or_delivery":"string|null","proposal_validity":"string|null","contract_validity":"string|null"},"scope_items_lots":[{"lot_or_item":"string|null","description":"string|null","quantity":"string|null","estimated_value":0,"exclusive_me_epp":false,"evidence":{"document_title":"string|null","document_marker":"string|null","section":"string|null","page":null,"quote":"string|null"}}],"participation_rules":{"summary":"string|null","consortium":"string|null","cooperatives":"string|null","me_epp":"string|null","restrictions":"string|null","evidence":[]},"proposal_and_bidding":{"proposal_requirements":"string|null","bid_rules":"string|null","negotiation":"string|null","exequibility":"string|null","samples_or_catalogs":"string|null","visit_or_inspection":"string|null","evidence":[]},"technical_qualification":{"summary":"string|null","registrations":"string|null","certificates":"string|null","minimum_quantities":"string|null","professional_requirements":"string|null","evidence":[]},"economic_financial":{"summary":"string|null","balance_sheet":"string|null","indices":"string|null","capital_or_net_worth":"string|null","bid_or_contract_guarantee":"string|null","evidence":[]},"execution_and_contract":{"delivery_or_execution_deadline":"string|null","payment_terms":"string|null","warranty":"string|null","subcontracting":"string|null","contract_management":"string|null","price_adjustment":"string|null","penalties":"string|null","evidence":[]},"requirements":[{"category":"string","title":"string","requirement":"string","mandatory":true,"risk_level":"low|medium|high|critical","recommended_action":"string|null","evidence":{"document_title":"string|null","document_marker":"string|null","section":"string|null","page":null,"quote":"string|null"}}],"critical_points":[{"title":"string","detail":"string","risk_level":"low|medium|high|critical","recommended_action":"string|null","evidence":{"document_title":"string|null","document_marker":"string|null","section":"string|null","page":null,"quote":"string|null"}}],"deadlines":[{"label":"string","date":"string|null","detail":"string|null","evidence":{"document_title":"string|null","document_marker":"string|null","section":"string|null","page":null,"quote":"string|null"}}],"legal_and_procedural_notes":{"summary":"string|null","evidence":[]},"clarification_or_challenge_points":[{"title":"string","detail":"string","evidence":{"document_title":"string|null","document_marker":"string|null","section":"string|null","page":null,"quote":"string|null"}}],"human_review_checklist":["string"],"uncertainties":["string"]}`;

function metadataFor(p){return{object:p.object_text,organization:p.org_name,modality:p.modality_name,municipality:p.municipality,uf:p.uf,estimated_value:p.estimated_value,published_at:p.published_at,closes_at:p.closes_at,pncp_url:p.pncp_url}}
function primaryPrompt(p,text){return `${SYSTEM_BASE}\n\nMETADADOS PNCP:\n${JSON.stringify(metadataFor(p))}\n\nDOCUMENTOS EXTRAÍDOS:\n${text}\n\nFaça uma varredura completa antes de responder. Evite resumos superficiais. Retorne exatamente esta estrutura JSON:\n${SCHEMA}`}
function reviewerPrompt(p,text,draft){return `${SYSTEM_BASE}\n\nVocê está na SEGUNDA PASSAGEM DE AUDITORIA. Revise criticamente o rascunho abaixo contra TODO o conjunto documental.\n- Remova ou corrija qualquer afirmação sem suporte.\n- Procure requisitos relevantes omitidos, especialmente habilitação técnica/econômico-financeira, prazos, garantias, amostras, visita, ME/EPP, execução, pagamento, penalidades e recursos.\n- Corrija conflitos considerando retificações/adendos.\n- Preserve apenas evidências com trechos realmente presentes no texto.\n- Entregue novamente o relatório COMPLETO na mesma estrutura JSON, não apenas uma lista de correções.\n\nMETADADOS PNCP:\n${JSON.stringify(metadataFor(p))}\n\nRASCUNHO DA PRIMEIRA PASSAGEM:\n${JSON.stringify(draft)}\n\nDOCUMENTOS EXTRAÍDOS:\n${text}\n\nESTRUTURA OBRIGATÓRIA:\n${SCHEMA}`}

async function invokeGemini(key,model,prompt,maxOutputTokens){
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},signal:AbortSignal.timeout(70000),body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:0.05,maxOutputTokens,responseMimeType:'application/json',thinkingConfig:{thinkingLevel:'low'}}})});
  const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data?.error?.message||`Gemini ${model} HTTP ${r.status}`);
  const output=(data.candidates?.[0]?.content?.parts||[]).map(x=>x.text||'').join('').trim();if(!output)throw new Error(`Gemini ${model} não retornou conteúdo.`);
  return parseTenderIntelligenceV2Json(output);
}
async function callGeminiVerified(p,text){
  const key=await geminiKey();if(!key)throw Object.assign(new Error('Gemini não está configurado para a Análise Inteligente de Edital.'),{status:503});
  let last=null;
  for(const model of [...new Set(MODELS)]){
    try{
      const first=normalizeTenderIntelligenceV2(await invokeGemini(key,model,primaryPrompt(p,text),7600));
      let reviewed=first,verificationPass=false,verificationError=null;
      try{reviewed=normalizeTenderIntelligenceV2(await invokeGemini(key,model,reviewerPrompt(p,text,first),8200));verificationPass=true}catch(e){verificationError=clean(e.message,240);console.warn('tender intelligence v2 reviewer fallback:',model,verificationError)}
      return{model,analysis:reviewed,verificationPass,verificationError};
    }catch(e){last=e;console.warn('tender intelligence v2 Gemini:',model,clean(e.message,260))}
  }
  throw Object.assign(new Error(`A IA não conseguiu concluir a análise agora${last?.message?`: ${clean(last.message,180)}`:''}.`),{status:503});
}

function sourceIndex(text){return compact(text).toLowerCase()}
function evidenceFound(e,index){const q=compact(e?.quote).toLowerCase();if(!q||q.length<16)return false;return index.includes(q)}
function verifyEvidenceObject(e,index,stats){if(!e||typeof e!=='object')return e;const verified=evidenceFound(e,index);if(e.quote){if(verified)stats.verified++;else stats.rejected++}return{...e,verified}}
export function verifyTenderEvidenceV2(analysis,text){
  const a=structuredClone(analysis),index=sourceIndex(text),stats={verified:0,rejected:0};
  const one=e=>verifyEvidenceObject(e,index,stats),many=v=>(Array.isArray(v)?v:[]).map(one);
  a.requirements=(a.requirements||[]).map(x=>({...x,evidence:one(x.evidence)}));
  a.critical_points=(a.critical_points||[]).map(x=>({...x,evidence:one(x.evidence)}));
  a.deadlines=(a.deadlines||[]).map(x=>({...x,evidence:one(x.evidence)}));
  a.scope_items_lots=(a.scope_items_lots||[]).map(x=>({...x,evidence:one(x.evidence)}));
  a.clarification_or_challenge_points=(a.clarification_or_challenge_points||[]).map(x=>({...x,evidence:one(x.evidence)}));
  for(const key of ['participation_rules','proposal_and_bidding','technical_qualification','economic_financial','execution_and_contract','legal_and_procedural_notes'])if(a[key])a[key]={...a[key],evidence:many(a[key].evidence)};
  if(stats.rejected>0)a.uncertainties=[...(a.uncertainties||[]),`${stats.rejected} evidência(s) citada(s) pela IA não foram confirmadas por correspondência literal automática e exigem conferência humana.`];
  return{analysis:a,stats};
}
function completeness(analysis,docsRead){
  const checks=[analysis.executive_summary,analysis.tender_overview?.object,analysis.tender_overview?.judgment_criterion,analysis.participation_rules?.summary,analysis.proposal_and_bidding?.proposal_requirements,analysis.technical_qualification?.summary,analysis.economic_financial?.summary,analysis.execution_and_contract?.delivery_or_execution_deadline,(analysis.requirements||[]).length,(analysis.deadlines||[]).length,(analysis.critical_points||[]).length,docsRead];
  const hit=checks.filter(v=>Array.isArray(v)?v.length>0:typeof v==='number'?v>0:Boolean(v)).length;return Math.round(hit/checks.length*100);
}

async function getReadiness(req,p){
  try{const r=await fetch(`http://127.0.0.1:${PORT}/api/tender-readiness/analyze`,{method:'POST',headers:{cookie:String(req.headers.cookie||''),'content-type':'application/json',accept:'application/json'},body:JSON.stringify({cnpj:p.org_cnpj,year:p.year,sequence:p.sequence}),signal:AbortSignal.timeout(50000)});if(!r.ok)return null;return(await r.json().catch(()=>({}))).analysis||null}catch{return null}
}
async function save(uid,p,result){
  const key=`${p.org_cnpj}-${p.year}-${p.sequence}`;
  await pool.query(`INSERT INTO tender_intelligence_analyses(user_id,pncp_key,org_cnpj,year,sequence,model,analysis,source_documents,readiness,diagnostics,analyzed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW()) ON CONFLICT(user_id,pncp_key) DO UPDATE SET model=EXCLUDED.model,analysis=EXCLUDED.analysis,source_documents=EXCLUDED.source_documents,readiness=EXCLUDED.readiness,diagnostics=EXCLUDED.diagnostics,analyzed_at=NOW()`,[uid,key,p.org_cnpj,p.year,p.sequence,result.model,JSON.stringify(result.analysis),JSON.stringify(result.source_documents),result.readiness?JSON.stringify(result.readiness):null,JSON.stringify(result.diagnostics)]);
}
async function analyze(req,uid,b){
  const p=await getProcurement(b.cnpj,b.year,b.sequence),all=await listPncpDocs(p.org_cnpj,p.year,p.sequence),picked=pickTenderDocsV2(all),extracted=await extractDocs(picked,{cnpj:p.org_cnpj,year:p.year,sequence:p.sequence});
  if(!extracted.text||extracted.used.length===0)throw Object.assign(new Error('Não foi possível extrair texto suficiente do edital/anexos para uma análise confiável. O documento pode estar digitalizado como imagem ou indisponível no PNCP.'),{status:422});
  const ai=await callGeminiVerified(p,extracted.text),verified=verifyTenderEvidenceV2(ai.analysis,extracted.text),readiness=await getReadiness(req,p),coverage=completeness(verified.analysis,extracted.used.length);
  const result={procurement:{pncp_key:`${p.org_cnpj}-${p.year}-${p.sequence}`,org_cnpj:p.org_cnpj,year:p.year,sequence:p.sequence,object_text:p.object_text,org_name:p.org_name,modality_name:p.modality_name,municipality:p.municipality,uf:p.uf,estimated_value:p.estimated_value,closes_at:p.closes_at,pncp_url:p.pncp_url,origin_url:p.origin_url},model:ai.model,analysis:verified.analysis,readiness,source_documents:extracted.used.map(d=>({sequencialDocumento:d.sequencialDocumento,marker:d.marker,titulo:d.titulo,tipoDocumentoNome:d.tipoDocumentoNome,url:d.url,extracted_chars:d.extracted_chars})),diagnostics:{analysis_version:'2.0-verified',pncp_documents:all.length,selected_documents:picked.length,read_documents:extracted.used.length,extracted_chars:extracted.text.length,verification_pass:ai.verificationPass,verification_error:ai.verificationError,evidence_verified:verified.stats.verified,evidence_rejected:verified.stats.rejected,coverage_percent:coverage,errors:extracted.errors,grounding:'document-only-double-pass',notice:'Relatório produzido em duas passagens e validado contra os documentos extraídos do PNCP. Evidências não confirmadas literalmente são sinalizadas para conferência humana.'}};
  await save(uid,p,result);return result;
}

export async function initTenderIntelligenceV2(){if(!pool)return;await initTables();console.log('tender intelligence v2 ready: double-pass verified edital report + evidence validation')}
export async function handleTenderIntelligenceV2Route(req,res,url){
  if(!url.pathname.startsWith('/api/tender-intelligence'))return false;
  if(!pool){json(res,503,{error:'Banco de dados indisponível.'});return true}
  try{
    await initTables();const user=await authUser(req);if(!user){json(res,401,{error:'Faça login para continuar.'});return true}
    if(req.method==='POST'&&url.pathname==='/api/tender-intelligence/analyze'){json(res,200,{result:await analyze(req,user.id,await readJson(req))});return true}
    if(req.method==='GET'&&url.pathname==='/api/tender-intelligence/history'){
      const limit=Math.min(Math.max(Number(url.searchParams.get('limit')||10),1),30);const r=await pool.query(`SELECT pncp_key,org_cnpj,year,sequence,model,analysis,source_documents,diagnostics,analyzed_at FROM tender_intelligence_analyses WHERE user_id=$1 ORDER BY analyzed_at DESC LIMIT $2`,[user.id,limit]);json(res,200,{items:r.rows});return true
    }
    json(res,404,{error:'Rota de análise inteligente não encontrada.'});return true;
  }catch(e){console.error('tender intelligence v2:',e?.stack||e);json(res,e?.status||500,{error:e?.status?e.message:'Erro interno na Análise Inteligente de Edital.'});return true}
}
