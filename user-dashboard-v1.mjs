import { Pool } from 'pg';
import { createHash } from 'node:crypto';
import { effectivePncpDeadline } from './pncp-operational-date-v1.mjs';
import {nationalIntelligence,contracts} from './pulse-business-v1.mjs';

const DATABASE_URL=String(process.env.DATABASE_URL||'');
const APP_ORIGIN=String(process.env.APP_ORIGIN||'');
const pool=DATABASE_URL?new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:3,idleTimeoutMillis:30000}):null;
const STATUSES=new Set(['analisar','preparando_documentacao','proposta_pronta','participando','recurso','vencida','perdida','arquivada']);
const WIDGETS=new Set(['recommendations','priorities','agenda','habilitation','tracking','funnel','ai']);
const BASELINE=[['cartao_cnpj','Cartão do CNPJ'],['contrato_social','Contrato Social'],['federal','Certidão Federal'],['fgts','CRF do FGTS'],['cndt','CNDT'],['estadual','Certidão Estadual'],['municipal','Certidão Municipal'],['falencia','Certidão de Falência'],['balanco','Balanço Patrimonial']];
const NO_NATURAL_EXPIRY=new Set(['cartao_cnpj','contrato_social']);
const UFS=new Set(['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']);
const REGIONS={
  Norte:['AC','AP','AM','PA','RO','RR','TO'],
  Nordeste:['AL','BA','CE','MA','PB','PE','PI','RN','SE'],
  'Centro-Oeste':['DF','GO','MT','MS'],
  Sudeste:['ES','MG','RJ','SP'],
  Sul:['PR','RS','SC']
};
let initialized=false;

const clean=(v,n=1000)=>String(v??'').trim().slice(0,n);
const digits=v=>String(v??'').replace(/\D/g,'');
const num=v=>Number(v||0);
const dateOnly=v=>{if(!v)return null;const s=String(v).slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:null};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function json(res,status,data){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.end(JSON.stringify(data))}
async function readJson(req,max=100000){let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>max)throw Object.assign(new Error('Payload muito grande.'),{status:413});chunks.push(c)}if(!chunks.length)return{};try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw Object.assign(new Error('JSON inválido.'),{status:400})}}
// Internal dashboard authentication must not consume the shared loopback HTTP rate bucket.
// Use the identical hashed session, expiration and active-account conditions as core /api/me.
function sessionHash(cookie){
  let token='';
  for(const entry of String(cookie||'').split(';')){
    const i=entry.indexOf('=');
    if(i<1||entry.slice(0,i).trim()!=='radar_session')continue;
    try{token=decodeURIComponent(entry.slice(i+1).trim())}catch{return null}
  }
  if(!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
  return createHash('sha256').update(token).digest('hex');
}
async function authUser(req){
  const hash=sessionHash(req.headers.cookie);if(!hash)return null;
  const r=await pool.query('SELECT u.id,u.email,u.role,u.active,u.created_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.active=TRUE LIMIT 1',[hash]);
  return r.rows[0]||null;
}
// Preserve an independent authenticated rate limit without a shared localhost bottleneck.
const dashboardRates=new Map();
function allowDashboard(uid,now=Date.now()){
  const key=String(uid);let entry=dashboardRates.get(key);
  if(!entry||now-entry.at>=60000){entry={at:now,count:0};dashboardRates.set(key,entry)}
  if(dashboardRates.size>1000)for(const [k,v] of dashboardRates)if(now-v.at>=60000)dashboardRates.delete(k);
  return ++entry.count<=120;
}
function requestOrigin(req){const host=clean(req.headers.host,300),proto=clean(String(req.headers['x-forwarded-proto']||'').split(',')[0],10).toLowerCase()||((req.socket&&req.socket.encrypted)?'https':'http');if(!host||!['http','https'].includes(proto))return'';try{return new URL(`${proto}://${host}`).origin}catch{return''}}
function configuredOrigins(){return [...new Set(APP_ORIGIN.split(',').map(x=>{try{return new URL(x.trim()).origin}catch{return''}}).filter(Boolean))]}
function trustedOrigin(req){if(!['POST','PUT','PATCH','DELETE'].includes(String(req.method||'').toUpperCase()))return true;const raw=clean(req.headers.origin,500);if(!raw)return true;let origin='';try{origin=new URL(raw).origin}catch{return false}return origin===requestOrigin(req)||configuredOrigins().includes(origin)}
async function tableExists(name){if(!pool)return false;const r=await pool.query('SELECT to_regclass($1) AS t',[`public.${name}`]);return Boolean(r.rows[0]?.t)}
async function qMaybe(sql,params=[],fallback=[]){try{return(await pool.query(sql,params)).rows}catch{return fallback}}

function normalizeGeo(value){
  const raw=value&&typeof value==='object'?value:{};
  const scope=['brasil','regiao','ufs'].includes(clean(raw.scope,20))?clean(raw.scope,20):'brasil';
  const region=Object.prototype.hasOwnProperty.call(REGIONS,clean(raw.region,40))?clean(raw.region,40):null;
  const ufs=[...new Set((Array.isArray(raw.ufs)?raw.ufs:[]).map(x=>clean(x,2).toUpperCase()).filter(x=>UFS.has(x)))].slice(0,27);
  if(scope==='regiao'&&region)return{scope:'regiao',region,ufs:REGIONS[region]};
  if(scope==='ufs'&&ufs.length)return{scope:'ufs',region:null,ufs};
  return{scope:'brasil',region:null,ufs:[]};
}
function geoLabel(geo){if(geo.scope==='regiao')return geo.region;if(geo.scope==='ufs')return geo.ufs.join(', ');return'Brasil inteiro'}

export async function initUserDashboard(){
  if(!pool||initialized)return;
  await pool.query(`CREATE TABLE IF NOT EXISTS user_tender_tracking(
    id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pncp_key TEXT NOT NULL,org_cnpj TEXT NOT NULL,year INTEGER NOT NULL,sequence INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'analisar',notes TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id,pncp_key)
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_user_tender_tracking_user_status ON user_tender_tracking(user_id,status,updated_at DESC)');
  await pool.query(`CREATE TABLE IF NOT EXISTS user_dashboard_preferences(
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  initialized=true;
  console.log('user dashboard v2 backend ready: personalized recommendations + geographic scope + operation tracking');
}

async function currentDocs(uid){
  const rows=await qMaybe(`SELECT id,doc_type,label,expiry_date FROM company_documents WHERE user_id=$1 AND is_current=TRUE ORDER BY expiry_date NULLS LAST,id DESC`,[uid]);
  const map=new Map();for(const d of rows)if(!map.has(d.doc_type))map.set(d.doc_type,d);return{rows,map};
}
function docState(doc,reference=today()){
  if(!doc)return{state:'missing',weight:0};const expiry=dateOnly(doc.expiry_date);
  if(!expiry)return NO_NATURAL_EXPIRY.has(doc.doc_type)?{state:'ok',weight:1}:{state:'unknown',weight:.65};
  if(expiry<reference)return{state:'expired',weight:0};return{state:'ok',weight:1};
}
function readinessFor(map,reference){let points=0,missing=0,expired=0,unknown=0;for(const[type]of BASELINE){const s=docState(map.get(type),reference);points+=s.weight;if(s.state==='missing')missing++;else if(s.state==='expired')expired++;else if(s.state==='unknown')unknown++}return{score:Math.round(points/BASELINE.length*100),missing,expired,unknown,blockers:missing+expired}}
async function documentHealth(uid){
  const {rows,map}=await currentDocs(uid);const ref=today();
  const states=BASELINE.map(([type,label])=>{const doc=map.get(type),st=docState(doc,ref),expiry=dateOnly(doc?.expiry_date);let days=null;if(expiry)days=Math.round((Date.parse(expiry+'T12:00:00Z')-Date.parse(ref+'T12:00:00Z'))/86400000);return{type,label,state:st.state,expiry_date:expiry,days}});
  const score=Math.round(states.reduce((s,x)=>s+(x.state==='ok'?1:(x.state==='unknown'?0.65:0)),0)/BASELINE.length*100);
  const expired=states.filter(x=>x.state==='expired').length,due7=states.filter(x=>x.days!==null&&x.days>=0&&x.days<=7).length,due30=states.filter(x=>x.days!==null&&x.days>=0&&x.days<=30).length,missing=states.filter(x=>x.state==='missing').length;
  const next=rows.filter(x=>dateOnly(x.expiry_date)).map(x=>{const expiry=dateOnly(x.expiry_date),days=Math.round((Date.parse(expiry+'T12:00:00Z')-Date.parse(ref+'T12:00:00Z'))/86400000);return{id:x.id,label:x.label,doc_type:x.doc_type,expiry_date:expiry,days}}).sort((a,b)=>a.days-b.days).slice(0,8);
  return{score,baseline_count:BASELINE.length,present:BASELINE.length-missing,missing,expired,due7,due30,states,next,map};
}

const deadlineSql=effectivePncpDeadline('m');
const recommendationSql=`SELECT m.pncp_id,m.org_cnpj,m.year,m.sequence,m.modality_code,m.modality_name,m.object_text,m.org_name,m.municipality,m.uf,m.estimated_value,m.published_at,${deadlineSql} AS closes_at,m.pncp_url,m.origin_url,m.detected_at,
  ARRAY_REMOVE(ARRAY_AGG(DISTINCT a.name),NULL) AS alert_names,
  JSONB_AGG(DISTINCT JSONB_BUILD_OBJECT('name',a.name,'keyword',a.keyword,'uf',a.uf,'municipality',a.municipality,'modality',a.modality_code,'org',a.org_name,'cnpj',a.org_cnpj,'min',a.min_value,'max',a.max_value)) AS matched_criteria
FROM monitored_procurements m
JOIN saved_alerts a ON a.user_id=$1 AND a.enabled=TRUE
 AND (a.keyword IS NULL OR a.keyword='' OR m.object_text ILIKE '%'||a.keyword||'%')
 AND (a.uf IS NULL OR a.uf='' OR UPPER(m.uf)=UPPER(a.uf))
 AND (a.municipality IS NULL OR a.municipality='' OR m.municipality ILIKE '%'||a.municipality||'%')
 AND (a.modality_code IS NULL OR m.modality_code=a.modality_code)
 AND (a.org_name IS NULL OR a.org_name='' OR m.org_name ILIKE '%'||a.org_name||'%')
 AND (a.org_cnpj IS NULL OR a.org_cnpj='' OR m.org_cnpj=a.org_cnpj)
 AND (a.min_value IS NULL OR m.estimated_value>=a.min_value)
 AND (a.max_value IS NULL OR m.estimated_value<=a.max_value)
WHERE ${deadlineSql}>=NOW()
 AND ($2::text[] IS NULL OR UPPER(m.uf)=ANY($2::text[]))
GROUP BY m.pncp_id,m.org_cnpj,m.year,m.sequence,m.modality_code,m.modality_name,m.object_text,m.org_name,m.municipality,m.uf,m.estimated_value,m.published_at,m.closes_at,m.pncp_url,m.origin_url,m.detected_at
ORDER BY m.detected_at DESC NULLS LAST,m.pncp_id ASC LIMIT 120`;
// Aderência is a transparent heuristic, never a prediction of award or a legal habilitation assessment.
function fitFor(row,ready,geo,alerts){
  const matches=Array.isArray(row.matched_criteria)?row.matched_criteria:[];
  const normalize=v=>String(v??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const object=normalize(row.object_text);
  const exactKeywords=[...new Set(matches.map(x=>normalize(x.keyword)).filter(x=>x.length>=3&&object.includes(x)))];
  const specific=matches.some(x=>String(x.uf||x.municipality||x.modality||x.org||x.cnpj||'').trim()||x.min!=null||x.max!=null);
  const alertPoints=exactKeywords.length?Math.min(60,52+Math.min(8,(exactKeywords.length-1)*4)+(specific?8:0)):specific?38:alerts.length?22:0;
  const regional=geo.scope!=='brasil'&&Array.isArray(geo.ufs)&&geo.ufs.includes(String(row.uf||'').toUpperCase());
  const geoPoints=geo.scope==='brasil'?8:regional?15:0;
  const docsPoints=Math.round(Math.max(0,Math.min(100,Number(ready.score)||0))*0.25);
  const score=Math.min(100,alertPoints+geoPoints+docsPoints);
  const reasons=[];
  if(alerts.length)reasons.push(`Alerta compatível: ${alerts.slice(0,2).join(' • ')}`);
  if(exactKeywords.length)reasons.push('Palavras-chave encontradas no objeto: '+exactKeywords.slice(0,4).join(', '));
  else reasons.push(specific?'Correspondência por outros filtros do alerta':'Alerta amplo: segmento não confirmado pelo objeto');
  if(regional)reasons.push(`Localização dentro da abrangência: ${geoLabel(geo)}`);else if(geo.scope==='brasil')reasons.push('Abrangência nacional selecionada');
  reasons.push(`Prontidão documental básica: ${ready.score}%`);
  return{score,reasons,components:[{label:'Compatibilidade dos alertas',points:alertPoints,max:60},{label:'Abrangência geográfica',points:geoPoints,max:15},{label:'Documentação básica',points:docsPoints,max:25}],limitations:'Estimativa por alertas, localização e documentação básica. Não comprova habilitação, segmento empresarial ou chance de vitória; confira as exigências do edital.'};
}
async function recommendations(uid,docsMap,geo){
  const filterUfs=geo.scope==='brasil'?null:geo.ufs;
  const rows=(await pool.query(recommendationSql,[uid,filterUfs])).rows;
  return rows.map(r=>{const ref=dateOnly(r.closes_at)||today(),ready=readinessFor(docsMap,ref),alerts=Array.isArray(r.alert_names)?r.alert_names.filter(Boolean):[],fit=fitFor(r,ready,geo,alerts);const {matched_criteria,...publicRow}=r;return{...publicRow,estimated_value:r.estimated_value==null?null:Number(r.estimated_value),readiness:ready,fit,match_reason:alerts.length?`Corresponde a ${alerts.slice(0,2).join(' • ')}`:'Compatível com seus filtros'}}).sort((a,b)=>b.fit.score-a.fit.score||b.readiness.score-a.readiness.score||new Date(a.closes_at)-new Date(b.closes_at)).slice(0,60);
}
async function tracking(uid){
  return (await pool.query(`SELECT t.id,t.pncp_key,t.org_cnpj,t.year,t.sequence,t.status,t.notes,t.created_at,t.updated_at,m.pncp_id,m.modality_name,m.object_text,m.org_name,m.municipality,m.uf,m.estimated_value,${deadlineSql} AS closes_at,m.pncp_url,m.origin_url
  FROM user_tender_tracking t LEFT JOIN monitored_procurements m ON m.org_cnpj=t.org_cnpj AND m.year=t.year AND m.sequence=t.sequence
  WHERE t.user_id=$1 ORDER BY CASE t.status WHEN 'participando' THEN 1 WHEN 'proposta_pronta' THEN 2 WHEN 'preparando_documentacao' THEN 3 WHEN 'analisar' THEN 4 WHEN 'recurso' THEN 5 ELSE 9 END,t.updated_at DESC`,[uid])).rows;
}
async function recentAi(uid){
  if(!await tableExists('tender_intelligence_analyses'))return[];
  const rows=await qMaybe(`SELECT id,pncp_key,org_cnpj,year,sequence,model,analysis,readiness,diagnostics,analyzed_at FROM tender_intelligence_analyses WHERE user_id=$1 ORDER BY analyzed_at DESC LIMIT 8`,[uid]);
  return rows.map(r=>{const a=r.analysis||{},overview=a.tender_overview||{},crit=Array.isArray(a.critical_points)?a.critical_points:[],high=crit.filter(x=>['high','critical'].includes(x?.risk_level)).length;return{id:r.id,pncp_key:r.pncp_key,org_cnpj:r.org_cnpj,year:r.year,sequence:r.sequence,model:r.model,analyzed_at:r.analyzed_at,confidence:a.confidence||'low',object:overview.object||null,organization:overview.organization||null,critical_points:crit.length,high_risk_points:high,coverage_percent:num(r.diagnostics?.coverage_percent),verification_pass:Boolean(r.diagnostics?.verification_pass)}});
}
async function preferences(uid){const r=await qMaybe('SELECT config FROM user_dashboard_preferences WHERE user_id=$1',[uid]);const config=r[0]?.config||{};return{...config,hidden_widgets:Array.isArray(config.hidden_widgets)?config.hidden_widgets:[],geo:normalizeGeo(config.geo)}}
function funnel(items){const counts={analisar:0,preparando_documentacao:0,proposta_pronta:0,participando:0,recurso:0,vencida:0,perdida:0,arquivada:0};for(const x of items)if(x.status in counts)counts[x.status]++;return counts}
function agenda(recs,tracked,health){
  const events=[],seen=new Set();
  for(const t of tracked){if(t.closes_at&&new Date(t.closes_at)>=new Date()&&!seen.has(t.pncp_key)){seen.add(t.pncp_key);events.push({type:'session',date:t.closes_at,title:t.object_text||'Licitação acompanhada',subtitle:[t.modality_name,t.org_name,t.municipality,t.uf].filter(Boolean).join(' • '),pncp_key:t.pncp_key,status:t.status})}}
  for(const r of recs){const key=`${r.org_cnpj}-${r.year}-${r.sequence}`;if(r.closes_at&&new Date(r.closes_at)>=new Date()&&!seen.has(key)){const days=(new Date(r.closes_at)-new Date())/86400000;if(days<=30){seen.add(key);events.push({type:'opportunity',date:r.closes_at,title:r.object_text||'Oportunidade recomendada',subtitle:[r.modality_name,r.org_name,r.municipality,r.uf].filter(Boolean).join(' • '),pncp_key:key})}}}
  for(const d of health.next){if(d.days<=30)events.push({type:'document',date:d.expiry_date,title:d.label,subtitle:d.days<0?'Documento vencido':d.days===0?'Vence hoje':`Vence em ${d.days} dia(s)`})}
  return events.sort((a,b)=>new Date(a.date)-new Date(b.date));
}
function priorities({alertsCount,health,tracked,ai,company}){
  const out=[];
  if(health.expired)out.push({tone:'critical',title:`${health.expired} documento(s) vencido(s)`,detail:'Regularize sua habilitação antes de novas disputas.',action:'habilitation'});
  if(health.due7)out.push({tone:'high',title:`${health.due7} documento(s) vencem em até 7 dias`,detail:'Antecipe a renovação para reduzir risco operacional.',action:'habilitation'});
  const soon=tracked.filter(x=>x.closes_at&&new Date(x.closes_at)>new Date()&&new Date(x.closes_at)-new Date()<=48*3600000&&!['vencida','perdida','arquivada'].includes(x.status));
  if(soon.length)out.push({tone:'high',title:`${soon.length} licitação(ões) acompanhada(s) com prazo em até 48h`,detail:'Revise proposta, documentos e condições antes da sessão.',action:'tracking'});
  const risky=ai.filter(x=>x.high_risk_points>0);if(risky.length)out.push({tone:'medium',title:`${risky.length} análise(s) recente(s) com ponto de alto risco`,detail:'Revise as evidências e recomendações da IA-RLB.',action:'ai'});
  if(!alertsCount)out.push({tone:'medium',title:'Nenhum alerta ativo',detail:'Crie filtros para receber oportunidades aderentes à sua atuação.',action:'alerts'});
  if(!company)out.push({tone:'medium',title:'Perfil da empresa incompleto',detail:'Cadastre os dados da empresa para melhorar a operação.',action:'habilitation'});
  if(!out.length)out.push({tone:'ok',title:'Operação em boa situação',detail:'Nenhuma ação crítica identificada neste momento.',action:'dashboard'});
  return out.slice(0,6);
}

// Public opportunities are separate from personal recommendations and tracking.
async function nationalPreview(geo){
 const ufs=geo.scope==='brasil'?null:geo.ufs;
 const {rows}=await pool.query(`WITH active AS (
 SELECT m.pncp_id,m.org_cnpj,m.year,m.sequence,m.object_text,m.org_name,m.municipality,m.uf,m.modality_name,m.pncp_url,m.detected_at,${deadlineSql} AS closes_at
 FROM monitored_procurements m WHERE m.closes_at>=NOW()-INTERVAL '3 hours' AND ($1::text[] IS NULL OR UPPER(m.uf)=ANY($1::text[]))
 ), recent AS (SELECT *, 'recent' AS preview_type FROM active WHERE closes_at>=NOW() ORDER BY detected_at DESC NULLS LAST,pncp_id LIMIT 6),
 due AS (SELECT *, 'deadline' AS preview_type FROM active WHERE closes_at>=NOW() AND closes_at<=NOW()+INTERVAL '30 days' ORDER BY closes_at,pncp_id LIMIT 8)
 SELECT * FROM recent UNION ALL SELECT * FROM due`,[ufs]);
 const opportunities=rows.filter(r=>r.preview_type==='recent');
 const deadlines=rows.filter(r=>r.preview_type==='deadline').map(r=>({type:'national',date:r.closes_at,title:r.object_text,subtitle:[r.modality_name,r.org_name,r.municipality,r.uf].filter(Boolean).join(' • '),pncp_key:[r.org_cnpj,r.year,r.sequence].join('-'),pncp_url:r.pncp_url}));
 return {opportunities,deadlines,scope:geoLabel(geo)};
}
async function overview(uid,user){
  const [prefs,health,tracked,ai,alertRows,companyRows]=await Promise.all([
    preferences(uid),
    documentHealth(uid),
    tracking(uid),
    recentAi(uid),
    pool.query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE enabled)::int active FROM saved_alerts WHERE user_id=$1`,[uid]).then(r=>r.rows),
    qMaybe('SELECT cnpj,legal_name,trade_name,state,municipality,contact_name FROM company_profiles WHERE user_id=$1 LIMIT 1',[uid])
  ]);
  const geo=prefs.geo,[recs,national]=await Promise.all([recommendations(uid,health.map,geo),nationalPreview(geo)]),alerts=alertRows[0]||{},company=companyRows[0]||null;
  const todayStart=Date.parse(today()+'T00:00:00-03:00'),matchedToday=recs.filter(x=>new Date(x.detected_at).getTime()>=todayStart).length,highReady=recs.filter(x=>x.fit.score>=85).length;
  const events=agenda(recs,tracked,health),upcoming7=events.filter(x=>['session','opportunity'].includes(x.type)&&new Date(x.date)-new Date()<=7*86400000&&new Date(x.date)>=new Date()).length;
  const pr=priorities({alertsCount:num(alerts.active),health,tracked,ai,company});
  const activeTracked=tracked.filter(x=>!['vencida','perdida','arquivada'].includes(x.status)).length;
  return{generated_at:new Date().toISOString(),user:{id:user.id,email:user.email,display_name:company?.contact_name||company?.trade_name||company?.legal_name||String(user.email||'Usuário').split('@')[0],company},metrics:{new_matches_today:matchedToday,recommended_high:highReady,tracked_active:activeTracked,upcoming_7d:upcoming7,documents_risk:health.expired+health.due30,critical_actions:pr.filter(x=>['critical','high'].includes(x.tone)).length,active_alerts:num(alerts.active)},recommendations:recs,national_preview:national,priorities:pr,agenda:events,habilitation:{score:health.score,baseline_count:health.baseline_count,present:health.present,missing:health.missing,expired:health.expired,due7:health.due7,due30:health.due30,next:health.next},tracking:tracked,funnel:funnel(tracked),recent_ai:ai,preferences:prefs,geo:{...geo,label:geoLabel(geo)}};
}

async function saveTracking(uid,b){
  const cnpj=digits(b.cnpj).slice(0,14),year=Number(b.year),sequence=Number(b.sequence),status=clean(b.status,50)||'analisar';
  if(cnpj.length!==14||!Number.isInteger(year)||!Number.isInteger(sequence)||sequence<1)throw Object.assign(new Error('Identificação da licitação inválida.'),{status:400});
  if(!STATUSES.has(status))throw Object.assign(new Error('Status de acompanhamento inválido.'),{status:400});
  const procurement=(await qMaybe(`SELECT pncp_id FROM monitored_procurements WHERE org_cnpj=$1 AND year=$2 AND sequence=$3 ORDER BY last_seen_at DESC LIMIT 1`,[cnpj,year,sequence]))[0];
  if(!procurement)throw Object.assign(new Error('Licitação não localizada na base do Radar.'),{status:404});
  const key=`${cnpj}-${year}-${sequence}`;
  const r=await pool.query(`INSERT INTO user_tender_tracking(user_id,pncp_key,org_cnpj,year,sequence,status,notes) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id,pncp_key) DO UPDATE SET status=EXCLUDED.status,notes=COALESCE(EXCLUDED.notes,user_tender_tracking.notes),updated_at=NOW() RETURNING *`,[uid,key,cnpj,year,sequence,status,b.notes===undefined?null:clean(b.notes,1500)]);return r.rows[0];
}
async function savePreferences(uid,b){
  const current=await preferences(uid);
  const hidden=b.hidden_widgets===undefined?current.hidden_widgets:[...new Set(Array.isArray(b.hidden_widgets)?b.hidden_widgets.map(x=>clean(x,60)).filter(x=>WIDGETS.has(x)):[])];
  const geo=b.geo===undefined?current.geo:normalizeGeo(b.geo);
  const config={hidden_widgets:hidden,geo};
  await pool.query(`INSERT INTO user_dashboard_preferences(user_id,config) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET config=EXCLUDED.config,updated_at=NOW()`,[uid,JSON.stringify(config)]);return config;
}

export async function handleUserDashboardRoute(req,res,url){
  if(!url.pathname.startsWith('/api/dashboard'))return false;
  if(!pool){json(res,503,{error:'Dashboard indisponível temporariamente.'});return true}
  try{
    await initUserDashboard();if(!trustedOrigin(req)){json(res,403,{error:'Origem não autorizada.',code:'origin_not_authorized'});return true}
    const user=await authUser(req);if(!user){json(res,401,{error:'Faça login para acessar seu dashboard.'});return true}
    if(!allowDashboard(user.id)){res.setHeader('Retry-After','60');json(res,429,{error:'Muitas consultas ao dashboard. Tente novamente em instantes.'});return true}
    if(req.method==='GET'&&url.pathname==='/api/dashboard/intelligence'){json(res,200,await nationalIntelligence(pool,url.searchParams));return true}
    if(req.method==='GET'&&url.pathname==='/api/dashboard/contracts'){try{json(res,200,await contracts(url.searchParams))}catch(e){json(res,e.status===400?400:503,{error:e.status===400?e.message:'PNCP temporariamente indisponível ou consulta adiada. Tente novamente.'})}return true}
    if(req.method==='GET'&&url.pathname==='/api/dashboard/overview'){json(res,200,await overview(user.id,user));return true}
    if(req.method==='GET'&&url.pathname==='/api/dashboard/tracking'){const items=await tracking(user.id);json(res,200,{items,funnel:funnel(items)});return true}
    if(req.method==='POST'&&url.pathname==='/api/dashboard/tracking'){json(res,200,{ok:true,item:await saveTracking(user.id,await readJson(req))});return true}
    const del=url.pathname.match(/^\/api\/dashboard\/tracking\/(\d+)$/);if(del&&req.method==='DELETE'){const r=await pool.query('DELETE FROM user_tender_tracking WHERE id=$1 AND user_id=$2 RETURNING id',[Number(del[1]),user.id]);if(!r.rows[0]){json(res,404,{error:'Acompanhamento não encontrado.'});return true}json(res,200,{ok:true});return true}
    if(req.method==='POST'&&url.pathname==='/api/dashboard/preferences'){json(res,200,{ok:true,preferences:await savePreferences(user.id,await readJson(req))});return true}
    json(res,404,{error:'Rota do dashboard não encontrada.'});return true;
  }catch(e){console.error('user dashboard v2:',e?.stack||e);json(res,e?.status||500,{error:e?.status?e.message:'Erro interno no dashboard.'});return true}
}

export const __test={STATUSES,WIDGETS,BASELINE,UFS,REGIONS,readinessFor,docState,normalizeGeo,fitFor,sessionHash,allowDashboard,agenda};