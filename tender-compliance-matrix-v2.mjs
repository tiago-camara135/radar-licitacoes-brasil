import { Pool } from 'pg';
import { PDFParse } from 'pdf-parse';

const PORT=Number(process.env.PORT||10000);
const DATABASE_URL=String(process.env.DATABASE_URL||'');
const APP_ORIGIN=String(process.env.APP_ORIGIN||'');
const pool=DATABASE_URL?new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:2,idleTimeoutMillis:30000}):null;
const MAX_COMPANY_TEXT=120000;
let initialized=false;

const TECHNICAL_TYPES=new Set(['registro_conselho','atestado_tecnico','acervo_tecnico','licenca']);
const NO_NATURAL_EXPIRY=new Set(['cartao_cnpj','contrato_social','alteracao_contratual','documento_socio','procuracao']);
const PREPARE_TYPES=new Set(['declaracao','garantia_proposta','visita_tecnica','amostra_catalogo']);
const TYPE_LABELS={
  cartao_cnpj:'Inscrição no CNPJ',contrato_social:'Contrato Social / ato constitutivo',alteracao_contratual:'Alteração / consolidação contratual',junta_comercial:'Certidão da Junta Comercial',federal:'Regularidade Federal / RFB e PGFN',fgts:'Regularidade perante o FGTS',cndt:'Regularidade Trabalhista / CNDT',estadual:'Regularidade Estadual',municipal:'Regularidade Municipal',falencia:'Certidão de Falência / Recuperação Judicial',balanco:'Balanço Patrimonial e Demonstrações Contábeis',indices:'Índices Econômico-Financeiros',capital_patrimonio:'Capital social / patrimônio líquido mínimo',registro_conselho:'Registro em Conselho Profissional',atestado_tecnico:'Atestado de Capacidade Técnica',acervo_tecnico:'CAT / Acervo Técnico',licenca:'Licença / Alvará / Autorização Técnica',declaracao:'Declarações exigidas pelo edital',procuracao:'Procuração',documento_socio:'Documento de sócio / representante',garantia_proposta:'Garantia de proposta',visita_tecnica:'Visita / vistoria técnica',amostra_catalogo:'Amostra / catálogo / ficha técnica'
};
const TYPE_PATTERNS={
  cartao_cnpj:[/cadastro\s+nacional\s+da\s+pessoa\s+jur[ií]dica/i,/comprovante[^\n]{0,100}inscri[cç][aã]o[^\n]{0,120}cnpj/i],
  contrato_social:[/contrato\s+social/i,/ato\s+constitutivo/i,/requerimento\s+de\s+empres[aá]rio/i,/estatuto\s+social/i],
  alteracao_contratual:[/altera[cç][aã]o\s+contratual/i,/consolida[cç][aã]o\s+contratual/i],
  junta_comercial:[/junta\s+comercial/i,/certid[aã]o\s+simplificada/i,/certid[aã]o\s+espec[ií]fica/i],
  federal:[/tributos\s+federais/i,/receita\s+federal/i,/procuradoria[^\n]{0,100}fazenda\s+nacional/i,/d[ií]vida\s+ativa\s+da\s+uni[aã]o/i],
  fgts:[/certificado\s+de\s+regularidade[^\n]{0,100}fgts/i,/fundo\s+de\s+garantia\s+do\s+tempo\s+de\s+servi[cç]o/i,/\bfgts\b/i],
  cndt:[/certid[aã]o\s+negativa[^\n]{0,100}d[eé]bitos\s+trabalhistas/i,/\bcndt\b/i,/justi[cç]a\s+do\s+trabalho/i],
  estadual:[/fazenda\s+estadual/i,/tributos\s+estaduais/i,/d[eé]bitos[^\n]{0,100}estadual/i],
  municipal:[/fazenda\s+municipal/i,/tributos\s+municipais/i,/d[eé]bitos[^\n]{0,100}municipal/i],
  falencia:[/fal[eê]ncia/i,/recupera[cç][aã]o\s+judicial/i],
  balanco:[/balan[cç]o\s+patrimonial/i,/ativo\s+circulante/i,/passivo\s+circulante/i,/demonstra[cç][oõ]es\s+cont[aá]beis/i],
  indices:[/liquidez\s+geral/i,/liquidez\s+corrente/i,/solv[eê]ncia\s+geral/i,/índices?\s+econ[oô]mico/i],
  registro_conselho:[/\bcrea\b/i,/\bcau\b/i,/\bcft\b/i,/conselho\s+profissional/i],
  atestado_tecnico:[/atestado[^\n]{0,120}capacidade\s+t[eé]cnica/i,/atestamos[^\n]{0,220}(forneceu|executou|prestou|realizou)/i],
  acervo_tecnico:[/certid[aã]o\s+de\s+acervo\s+t[eé]cnico/i,/\bcat\b[^\n]{0,100}(crea|cau|cft|acervo)/i],
  licenca:[/licen[cç]a[^\n]{0,120}(sanit[aá]ria|ambiental|opera[cç][aã]o|funcionamento)/i,/alvar[aá][^\n]{0,100}funcionamento/i],
  declaracao:[/declara[cç][aã]o/i],
  procuracao:[/procura[cç][aã]o/i],
  documento_socio:[/carteira\s+de\s+identidade/i,/documento\s+de\s+identifica[cç][aã]o/i,/\bcpf\b/i]
};
const CLASSIFIERS=[
  ['cartao_cnpj',/cnpj|cadastro\s+nacional\s+da\s+pessoa\s+jur/i],['contrato_social',/contrato\s+social|ato\s+constitutivo|estatuto\s+social|registro\s+comercial/i],['junta_comercial',/junta\s+comercial|certid[aã]o\s+simplificada|certid[aã]o\s+espec[ií]fica/i],['federal',/federal|receita\s+federal|pgfn|d[ií]vida\s+ativa\s+da\s+uni[aã]o/i],['fgts',/\bfgts\b|fundo\s+de\s+garantia/i],['cndt',/\bcndt\b|d[eé]bitos\s+trabalhistas|regularidade\s+trabalhista/i],['estadual',/fazenda\s+estadual|tributos\s+estaduais|regularidade\s+estadual/i],['municipal',/fazenda\s+municipal|tributos\s+municipais|regularidade\s+municipal/i],['falencia',/fal[eê]ncia|recupera[cç][aã]o\s+judicial/i],['balanco',/balan[cç]o\s+patrimonial|demonstra[cç][oõ]es\s+cont[aá]beis/i],['indices',/liquidez|solv[eê]ncia|[ií]ndices?\s+econ[oô]mico/i],['capital_patrimonio',/capital\s+social|patrim[oô]nio\s+l[ií]quido/i],['registro_conselho',/\bcrea\b|\bcau\b|\bcft\b|conselho\s+profissional|registro\s+profissional/i],['atestado_tecnico',/atestado|capacidade\s+t[eé]cnica|experi[eê]ncia\s+anterior/i],['acervo_tecnico',/acervo\s+t[eé]cnico|\bcat\b/i],['licenca',/licen[cç]a|alvar[aá]|autoriza[cç][aã]o\s+t[eé]cnica/i],['garantia_proposta',/garantia\s+de\s+proposta|garantia\s+da\s+proposta/i],['visita_tecnica',/visita\s+t[eé]cnica|vistoria\s+t[eé]cnica/i],['amostra_catalogo',/amostra|cat[aá]logo|ficha\s+t[eé]cnica/i],['procuracao',/procura[cç][aã]o/i],['documento_socio',/documento[^\n]{0,60}(s[oó]cio|representante)|identifica[cç][aã]o[^\n]{0,60}(s[oó]cio|representante)/i],['declaracao',/declara[cç][aã]o/i]
];
const STOP=new Set('para com uma umas uns dos das que por seu sua seus suas como nos nas nao não sim sob sem entre sobre esta está esse essa estes estas aos de da do em no na e ou a o as os um ser ter apresentar apresentação exigido exigida documento documentos licitacao licitação edital empresa licitante comprovar comprovação'.split(/\s+/));

const clean=(v,n=1600)=>String(v??'').trim().slice(0,n);
const digits=v=>String(v??'').replace(/\D/g,'');
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const dateOnly=v=>{if(!v)return null;const s=String(v).slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:null};
const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));
function secure(res){res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin')}
function json(res,status,data){secure(res);res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data))}
async function readJson(req,max=120000){let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>max)throw Object.assign(new Error('Payload muito grande.'),{status:413});chunks.push(c)}if(!chunks.length)return{};try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw Object.assign(new Error('JSON inválido.'),{status:400})}}
function normalizeOrigin(value){try{const u=new URL(String(value||'').trim());return ['http:','https:'].includes(u.protocol)?u.origin:''}catch{return''}}
function requestOrigin(req){const host=String(req.headers.host||'').trim(),proto=String(req.headers['x-forwarded-proto']||'').split(',')[0].trim().toLowerCase()||((req.socket&&req.socket.encrypted)?'https':'http');return host?normalizeOrigin(`${proto}://${host}`):''}
function sameOrigin(req){if(!['POST','PUT','PATCH','DELETE'].includes(String(req.method||'').toUpperCase()))return true;const raw=String(req.headers.origin||'').trim();if(!raw)return true;const origin=normalizeOrigin(raw);if(!origin)return false;const allowed=String(APP_ORIGIN||'').split(',').map(normalizeOrigin).filter(Boolean);return origin===requestOrigin(req)||allowed.includes(origin)}
async function authUser(req){try{const r=await fetch(`http://127.0.0.1:${PORT}/api/me`,{headers:{cookie:String(req.headers.cookie||'')},signal:AbortSignal.timeout(5000)});if(!r.ok)return null;return(await r.json().catch(()=>({}))).user||null}catch{return null}}

async function initTables(){if(!pool||initialized)return;await pool.query(`CREATE TABLE IF NOT EXISTS tender_compliance_matrices(id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,pncp_key TEXT NOT NULL,readiness_score INTEGER NOT NULL,confidence_score INTEGER NOT NULL,matrix JSONB NOT NULL DEFAULT '{}'::jsonb,analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(user_id,pncp_key))`);await pool.query('CREATE INDEX IF NOT EXISTS idx_tender_compliance_user ON tender_compliance_matrices(user_id,analyzed_at DESC)');initialized=true}

function requirementText(x){return clean([x?.title,x?.requirement,x?.label,x?.group,x?.category,x?.evidence?.quote,x?.evidence].filter(Boolean).join(' '),5000)}
export function classifyRequirementV2(req){if(req?.type&&TYPE_LABELS[req.type])return req.type;const text=requirementText(req);for(const [type,re] of CLASSIFIERS)if(re.test(text))return type;return null}
function evidenceVerified(req){return req?.evidence?.verified===true||Boolean(typeof req?.evidence==='string'&&req.evidence.trim())}
function daysBetween(expiry,reference){if(!expiry||!reference)return null;const e=dateOnly(expiry),r=dateOnly(reference);if(!e||!r)return null;const a=Date.parse(`${e}T12:00:00Z`),b=Date.parse(`${r}T12:00:00Z`);return Number.isFinite(a)&&Number.isFinite(b)?Math.round((a-b)/86400000):null}
function keywords(s){return [...new Set(norm(s).replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w=>w.length>=5&&!STOP.has(w)))].slice(0,90)}
function excerpt(text,re,max=520){const m=re?.exec(text);if(!m)return null;const start=Math.max(0,m.index-130),end=Math.min(text.length,m.index+m[0].length+250);return clean(text.slice(start,end).replace(/\s+/g,' '),max)}
function identityEvidence(text,profile){const cnpj=digits(profile?.cnpj);if(cnpj&&digits(text).includes(cnpj))return{confirmed:true,method:'cnpj',evidence:`CNPJ ${cnpj.slice(0,2)}.${cnpj.slice(2,5)}.${cnpj.slice(5,8)}/${cnpj.slice(8,12)}-${cnpj.slice(12)}`};const name=norm(profile?.legal_name||profile?.trade_name);if(name&&name.length>=8&&norm(text).includes(name))return{confirmed:true,method:'name',evidence:clean(profile?.legal_name||profile?.trade_name,180)};return{confirmed:false,method:null,evidence:null}}
function typeEvidence(type,text){const patterns=TYPE_PATTERNS[type]||[];for(const re of patterns){const ev=excerpt(text,re);if(ev)return{confirmed:true,evidence:ev}}return{confirmed:false,evidence:null}}
function statusWeight(code){return({verified:1,near_expiry:.9,valid_today:.86,apparently_compatible:.82,identity_unconfirmed:.7,partial_match:.62,content_unconfirmed:.55,manual_review:.5,unknown_validity:.52,to_prepare:.35,missing:0,expired_at_reference:0})[code]??.45}
function confidenceLevel(v){if(v>=90)return'muito_alta';if(v>=80)return'alta';if(v>=65)return'moderada';return'baixa'}

export function evaluateMatrixItemV2({requirement,doc,docText='',profile={},referenceDate,objectText=''}){
  const type=classifyRequirementV2(requirement)||requirement?.type||'outro';
  const editalEvidence=evidenceVerified(requirement);
  if(PREPARE_TYPES.has(type)&&!doc){return{type,state:'to_prepare',status_label:'Providenciar para este certame',readiness_weight:.35,confidence:editalEvidence?95:84,detail:'Exigência identificada no edital que normalmente demanda providência específica para o certame.',document_evidence:null,identity_confirmed:null}}
  if(type==='capital_patrimonio'){return{type,state:'manual_review',status_label:'Validar cálculo no balanço / contrato social',readiness_weight:.5,confidence:editalEvidence?91:78,detail:'A exigência financeira foi identificada; o Radar localizou a fonte disponível quando existente, mas o atendimento depende de cálculo/valor que deve ser conferido.',document_evidence:null,identity_confirmed:null}}
  if(!doc){return{type,state:'missing',status_label:'Documento não localizado',readiness_weight:0,confidence:editalEvidence?98:90,detail:'Nenhum documento atual correspondente foi localizado na Central de Habilitação.',document_evidence:null,identity_confirmed:null}}
  const days=NO_NATURAL_EXPIRY.has(type)?null:daysBetween(doc.expiry_date,referenceDate);
  if(days!==null&&days<0)return{type,state:'expired_at_reference',status_label:'Vencido na data de referência',readiness_weight:0,confidence:99,detail:`O documento vence ${Math.abs(days)} dia(s) antes da data de referência.`,document_evidence:null,identity_confirmed:null};
  if(!docText){const state=NO_NATURAL_EXPIRY.has(type)?'content_unconfirmed':(!doc.expiry_date?'unknown_validity':'content_unconfirmed');return{type,state,status_label:state==='unknown_validity'?'Validade não informada; conteúdo requer conferência':'Arquivo cadastrado; conteúdo requer conferência',readiness_weight:statusWeight(state),confidence:58,detail:'O Radar localizou o arquivo, mas não conseguiu extrair texto suficiente para validar seu conteúdo.',document_evidence:null,identity_confirmed:null}}
  const identity=identityEvidence(docText,profile),typeCheck=typeEvidence(type,docText);
  if(TECHNICAL_TYPES.has(type)){
    const target=keywords(`${objectText} ${requirementText(requirement)}`),hay=new Set(keywords(docText)),overlap=target.filter(k=>hay.has(k));
    if(!typeCheck.confirmed)return{type,state:'content_unconfirmed',status_label:'Tipo documental não confirmado no conteúdo',readiness_weight:.55,confidence:64,detail:'O arquivo está classificado nesta categoria, mas o texto extraído não confirmou sinais suficientes do tipo documental.',document_evidence:null,identity_confirmed:identity.confirmed};
    if(overlap.length>=5)return{type,state:'apparently_compatible',status_label:'Compatibilidade técnica aparente — revisar',readiness_weight:.82,confidence:88,detail:`Foram encontrados ${overlap.length} termos relevantes em comum com o objeto/exigência: ${overlap.slice(0,7).join(', ')}.`,document_evidence:typeCheck.evidence,identity_confirmed:identity.confirmed};
    if(overlap.length>=2)return{type,state:'partial_match',status_label:'Compatibilidade técnica parcial — revisar',readiness_weight:.62,confidence:76,detail:`Correspondência parcial com ${overlap.length} termo(s): ${overlap.slice(0,6).join(', ')}.`,document_evidence:typeCheck.evidence,identity_confirmed:identity.confirmed};
    return{type,state:'manual_review',status_label:'Compatibilidade técnica não confirmada',readiness_weight:.5,confidence:62,detail:'O documento técnico existe, mas a correspondência com o objeto e a exigência não foi suficientemente demonstrada de forma automática.',document_evidence:typeCheck.evidence,identity_confirmed:identity.confirmed};
  }
  if(!typeCheck.confirmed)return{type,state:'content_unconfirmed',status_label:'Conteúdo não confirma a classificação',readiness_weight:.55,confidence:68,detail:'O arquivo foi localizado, mas o conteúdo extraído não confirmou de forma suficiente o tipo documental esperado.',document_evidence:null,identity_confirmed:identity.confirmed};
  if(profile?.cnpj&&!identity.confirmed)return{type,state:'identity_unconfirmed',status_label:'Documento localizado; identidade da empresa não confirmada',readiness_weight:.7,confidence:76,detail:'O tipo documental foi confirmado, mas o CNPJ/razão social cadastrados não foram localizados de forma inequívoca no texto extraído.',document_evidence:typeCheck.evidence,identity_confirmed:false};
  if(days===0)return{type,state:'valid_today',status_label:'Válido até a data de referência',readiness_weight:.86,confidence:97,detail:'Conteúdo e identidade foram confirmados, mas a validade termina na própria data de referência.',document_evidence:typeCheck.evidence,identity_confirmed:identity.confirmed};
  if(days!==null&&days<=7)return{type,state:'near_expiry',status_label:`Vence ${days} dia(s) após a data de referência`,readiness_weight:.9,confidence:97,detail:'O documento aparenta atender ao tipo exigido e está válido, porém com margem curta de validade.',document_evidence:typeCheck.evidence,identity_confirmed:identity.confirmed};
  return{type,state:'verified',status_label:'Documento compatível e validado automaticamente',readiness_weight:1,confidence:97,detail:'O Radar confirmou sinais do tipo documental, identidade da empresa e validade aplicável.',document_evidence:typeCheck.evidence,identity_confirmed:identity.confirmed};
}

export function calculateMatrixScoresV2(items,{scope='edital',coverage=100,verificationPass=true,profilePresent=true}={}){
  if(!items.length)return{readiness_score:0,confidence_score:0,confidence_level:'baixa'};
  const readiness=Math.round(items.reduce((s,x)=>s+(Number.isFinite(x.readiness_weight)?x.readiness_weight:statusWeight(x.state)),0)/items.length*100);
  let conf=items.reduce((s,x)=>s+clamp(x.confidence,0,100),0)/items.length;
  if(scope!=='edital')conf*=.78;
  conf*=verificationPass===false?.9:1;
  conf*=clamp((Number(coverage)||0)/100,.72,1);
  if(!profilePresent)conf*=.94;
  const confidence=Math.round(clamp(conf,0,100));
  return{readiness_score:readiness,confidence_score:confidence,confidence_level:confidenceLevel(confidence)};
}

export function buildActionPlanV2(items){
  const priority=code=>['expired_at_reference','missing'].includes(code)?'urgente':['to_prepare'].includes(code)?'providenciar':['identity_unconfirmed','content_unconfirmed','manual_review','partial_match','apparently_compatible','unknown_validity','near_expiry','valid_today'].includes(code)?'revisar':'ok';
  return items.filter(x=>priority(x.state)!=='ok').map(x=>({priority:priority(x.state),type:x.type,label:x.label,status:x.status_label,action:priority(x.state)==='urgente'?(x.state==='missing'?'Cadastrar/providenciar o documento antes da participação.':'Renovar ou substituir o documento antes da data de referência.'):priority(x.state)==='providenciar'?'Preparar a exigência específica deste certame e validar o modelo/formato do edital.':'Conferir conteúdo, validade e aderência antes do envio da habilitação.'}));
}

async function pdfText(buffer){const parser=new PDFParse({data:new Uint8Array(buffer)});try{const out=await parser.getText();return clean(out?.text||'',MAX_COMPANY_TEXT)}finally{try{await parser.destroy()}catch{}}}
async function currentDocs(uid){const r=await pool.query(`SELECT id,doc_type,label,category,issuer,jurisdiction,document_number,issue_date,expiry_date,filename,mime_type,size_bytes,notes,content FROM company_documents WHERE user_id=$1 AND is_current=TRUE ORDER BY id DESC`,[uid]);return r.rows.map(d=>({...d,issue_date:dateOnly(d.issue_date),expiry_date:dateOnly(d.expiry_date)}))}
async function profile(uid){const r=await pool.query('SELECT user_id,cnpj,legal_name,trade_name,state,municipality FROM company_profiles WHERE user_id=$1 LIMIT 1',[uid]);return r.rows[0]||null}
async function latestIntelligence(uid,key){const r=await pool.query('SELECT analysis,readiness,diagnostics,source_documents,analyzed_at FROM tender_intelligence_analyses WHERE user_id=$1 AND pncp_key=$2 LIMIT 1',[uid,key]);return r.rows[0]||null}
function mergeRequirements(readiness,ai){const out=[];const add=(x,source)=>{const type=classifyRequirementV2(x);if(!type)return;const existing=out.find(y=>y.type===type);if(existing){if(source==='ai'&&!existing.requirement)existing.requirement=clean(x.requirement||x.title,1800)||null;if(source==='ai'&&x.evidence?.quote&&(!existing.evidence||typeof existing.evidence==='string'))existing.ai_evidence=x.evidence;return}out.push({type,label:TYPE_LABELS[type]||clean(x.label||x.title,240)||'Requisito',group:clean(x.group||x.category,180)||'Outros',requirement:clean(x.requirement||x.title,1800)||null,evidence:x.evidence||null,source,mandatory:x.mandatory!==false,risk_level:x.risk_level||null})};for(const x of readiness?.requirements||[])add(x,'readiness');for(const x of ai?.requirements||[])add(x,'ai');return out.slice(0,70)}
async function enrich(uid,key){
  const intel=await latestIntelligence(uid,key);if(!intel)throw Object.assign(new Error('Execute primeiro a Análise Completa do Edital para gerar a matriz.'),{status:409});
  const readiness=intel.readiness||{},ai=intel.analysis||{},diag=intel.diagnostics||{},p=readiness.procurement||{};
  const prof=await profile(uid),docs=await currentDocs(uid),byType=new Map();for(const d of docs){if(!byType.has(d.doc_type))byType.set(d.doc_type,d)}
  const textCache=new Map();async function textOf(doc){if(!doc||doc.mime_type!=='application/pdf')return'';if(textCache.has(doc.id))return textCache.get(doc.id);let t='';try{t=await pdfText(doc.content)}catch{}textCache.set(doc.id,t);return t}
  const requirements=mergeRequirements(readiness,ai),items=[];
  for(const req of requirements){let doc=byType.get(req.type)||null;if(req.type==='capital_patrimonio')doc=byType.get('balanco')||byType.get('contrato_social')||null;const evaluated=evaluateMatrixItemV2({requirement:req,doc,docText:await textOf(doc),profile:prof||{},referenceDate:p.reference_date||p.closes_at||new Date().toISOString().slice(0,10),objectText:p.object_text||ai.tender_overview?.object||''});items.push({...req,...evaluated,document:doc?{id:doc.id,doc_type:doc.doc_type,label:doc.label,filename:doc.filename,issuer:doc.issuer,issue_date:doc.issue_date,expiry_date:doc.expiry_date}:null})}
  const scores=calculateMatrixScoresV2(items,{scope:readiness.scope||'edital',coverage:diag.coverage_percent||0,verificationPass:diag.verification_pass!==false,profilePresent:Boolean(prof?.cnpj||prof?.legal_name)}),counts={total:items.length,attended:items.filter(x=>['verified','near_expiry','valid_today'].includes(x.state)).length,blockers:items.filter(x=>['missing','expired_at_reference'].includes(x.state)).length,to_prepare:items.filter(x=>x.state==='to_prepare').length,review:items.filter(x=>['identity_unconfirmed','content_unconfirmed','manual_review','partial_match','apparently_compatible','unknown_validity'].includes(x.state)).length};
  const result={version:'2.0',pncp_key:key,procurement:p,company_profile:prof?{cnpj:prof.cnpj,legal_name:prof.legal_name,trade_name:prof.trade_name,state:prof.state,municipality:prof.municipality}:null,...scores,counts,requirements:items,action_plan:buildActionPlanV2(items),diagnostics:{source:'edital+company-documents',full_analysis_coverage:diag.coverage_percent||0,full_analysis_verification_pass:diag.verification_pass!==false,company_documents:docs.length,company_pdfs_parsed:[...textCache.values()].filter(Boolean).length,method:'deterministic-evidence-crosscheck-v2',notice:'Confiabilidade mede a força das evidências usadas pelo Radar; não é garantia jurídica de habilitação.'},analyzed_at:new Date().toISOString()};
  await pool.query(`INSERT INTO tender_compliance_matrices(user_id,pncp_key,readiness_score,confidence_score,matrix,analyzed_at) VALUES($1,$2,$3,$4,$5,NOW()) ON CONFLICT(user_id,pncp_key) DO UPDATE SET readiness_score=EXCLUDED.readiness_score,confidence_score=EXCLUDED.confidence_score,matrix=EXCLUDED.matrix,analyzed_at=NOW()`,[uid,key,result.readiness_score,result.confidence_score,JSON.stringify(result)]);
  return result;
}
function keyFromBody(b){const c=digits(b.cnpj).slice(0,14),y=Number(b.year),s=Number(b.sequence);if(c.length!==14||!Number.isInteger(y)||!Number.isInteger(s)||s<1)throw Object.assign(new Error('Identificação PNCP inválida.'),{status:400});return`${c}-${y}-${s}`}

export async function initTenderComplianceMatrixV2(){if(!pool)return;await initTables();console.log('tender compliance matrix v2 ready: edital requirements x company document evidence + confidence score')}
export async function handleTenderComplianceMatrixV2Route(req,res,url){if(!url.pathname.startsWith('/api/tender-compliance-matrix'))return false;if(!pool){json(res,503,{error:'Banco de dados indisponível.'});return true}try{await initTables();if(!sameOrigin(req)){json(res,403,{error:'Origem não autorizada.',code:'origin_not_authorized'});return true}const user=await authUser(req);if(!user){json(res,401,{error:'Faça login para continuar.'});return true}if(req.method==='POST'&&url.pathname==='/api/tender-compliance-matrix/analyze'){const key=keyFromBody(await readJson(req));json(res,200,{matrix:await enrich(user.id,key)});return true}if(req.method==='GET'&&url.pathname==='/api/tender-compliance-matrix/latest'){const key=keyFromBody({cnpj:url.searchParams.get('cnpj'),year:url.searchParams.get('year'),sequence:url.searchParams.get('sequence')});const r=await pool.query('SELECT matrix,analyzed_at FROM tender_compliance_matrices WHERE user_id=$1 AND pncp_key=$2 LIMIT 1',[user.id,key]);if(!r.rows[0]){json(res,404,{error:'Matriz ainda não calculada.'});return true}json(res,200,{matrix:r.rows[0].matrix,analyzed_at:r.rows[0].analyzed_at});return true}json(res,404,{error:'Rota da matriz documental não encontrada.'});return true}catch(e){console.error('tender compliance matrix v2:',e?.stack||e);json(res,e?.status||500,{error:e?.status?e.message:'Erro interno na matriz documental.'});return true}}
