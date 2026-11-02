import { Pool } from 'pg';

const PORT=Number(process.env.PORT||10000);
const DATABASE_URL=String(process.env.DATABASE_URL||'');
const APP_ORIGIN=String(process.env.APP_ORIGIN||'');
const pool=DATABASE_URL?new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:3,idleTimeoutMillis:30000}):null;
const STATUSES=new Set(['analisar','preparando_documentacao','proposta_pronta','participando','recurso','vencida','perdida','arquivada']);
const WIDGETS=new Set(['recommendations','priorities','agenda','habilitation','tracking','funnel','ai']);
const BASELINE=[['cartao_cnpj','Cartão do CNPJ'],['contrato_social','Contrato Social'],['federal','Certidão Federal'],['fgts','CRF do FGTS'],['cndt','CNDT'],['estadual','Certidão Estadual'],['municipal','Certidão Municipal'],['falencia','Certidão de Falência'],['balanco','Balanço Patrimonial']];
const NO_NATURAL_EXPIRY=new Set(['cartao_cnpj','contrato_social']);
let initialized=false;

const clean=(v,n=1000)=>String(v??'').trim().slice(0,n);
const digits=v=>String(v??'').replace(/\D/g,'');
const num=v=>Number(v||0);
const dateOnly=v=>{if(!v)return null;const s=String(v).slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:null};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function json(res,status,data){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.end(JSON.stringify(data))}
async function readJson(req,max=100000){let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>max)throw Object.assign(new Error('Payload muito grande.'),{status:413});chunks.push(c)}if(!chunks.length)return{};try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw Object.assign(new Error('JSON inválido.'),{status:400})}}
async function authUser(req){try{const r=await fetch(`http://127.0.0.1:${PORT}/api/me`,{headers:{cookie:String(req.headers.cookie||'')},signal:AbortSignal.timeout(5000)});if(!r.ok)return null;return(await r.json().catch(()=>({}))).user||null}catch{return null}}
function requestOrigin(req){const host=clean(req.headers.host,300),proto=clean(String(req.headers['x-forwarded-proto']||'').split(',')[0],10).toLowerCase()||((req.socket&&req.socket.encrypted)?'https':'http');if(!host||!['http','https'].includes(proto))return'';try{return new URL(`${proto}://${host}`).origin}catch{return''}}
function configuredOrigins(){return [...new Set(APP_ORIGIN.split(',').map(x=>{try{return new URL(x.trim()).origin}catch{return''}}).filter(Boolean))]}
function trustedOrigin(req){if(!['POST','PUT','PATCH','DELETE'].includes(String(req.method||'').toUpperCase()))return true;const raw=clean(req.headers.origin,500);if(!raw)return true;let origin='';try{origin=new URL(raw).origin}catch{return false}return origin===requestOrigin(req)||configuredOrigins().includes(origin)}
async function tableExists(name){if(!pool)return false;const r=await pool.query('SELECT to_regclass($1) AS t',[`public.${name}`]);return Boolean(r.rows[0]?.t)}
async function qMaybe(sql,params=[],fallback=[]){try{return(await pool.query(sql,params)).rows}catch{return fallback}}

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
  console.log('user dashboard v1 ready: personalized recommendations + agenda + habilitation + tracking + AI history');
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

const recommendationSql=`SELECT m.pncp_id,m.org_cnpj,m.year,m.sequence,m.modality_code,m.modality_name,m.object_text,m.org_name,m.municipality,m.uf,m.estimated_value,m.published_at,m.closes_at,m.pncp_url,m.origin_url,m.detected_at,
  ARRAY_REMOVE(ARRAY_AGG(DISTINCT a.name),NULL) AS alert_names
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
WHERE m.closes_at IS NOT NULL AND m.closes_at>=NOW()
GROUP BY m.pncp_id,m.org_cnpj,m.year,m.sequence,m.modality_code,m.modality_name,m.object_text,m.org_name,m.municipality,m.uf,m.estimated_value,m.published_at,m.closes_at,m.pncp_url,m.origin_url,m.detected_at
ORDER BY m.detected_at DESC LIMIT 30`;
async function recommendations(uid,docsMap){
  const rows=await qMaybe(recommendationSql,[uid]);
  return rows.map(r=>{const ref=dateOnly(r.closes_at)||today(),ready=readinessFor(docsMap,ref),alerts=Array.isArray(r.alert_names)?r.alert_names.filter(Boolean):[];return{...r,estimated_value:r.estimated_value==null?null:Number(r.estimated_value),readiness:ready,match_reason:alerts.length?`Corresponde a ${alerts.slice(0,2).join(' • ')}`:'Compatível com seus filtros'}}).sort((a,b)=>b.readiness.score-a.readiness.score||new Date(a.closes_at)-new Date(b.closes_at)).slice(0,12);
}
async function tracking(uid){
  return qMaybe(`SELECT t.id,t.pncp_key,t.org_cnpj,t.year,t.sequence,t.status,t.notes,t.created_at,t.updated_at,m.pncp_id,m.modality_name,m.object_text,m.org_name,m.municipality,m.uf,m.estimated_value,m.closes_at,m.pncp_url,m.origin_url
  FROM user_tender_tracking t LEFT JOIN monitored_procurements m ON m.org_cnpj=t.org_cnpj AND m.year=t.year AND m.sequence=t.sequence
  WHERE t.user_id=$1 ORDER BY CASE t.status WHEN 'participando' THEN 1 WHEN 'proposta_pronta' THEN 2 WHEN 'preparando_documentacao' THEN 3 WHEN 'analisar' THEN 4 WHEN 'recurso' THEN 5 ELSE 9 END,t.updated_at DESC`,[uid]);
}
async function recentAi(uid){
  if(!await tableExists('tender_intelligence_analyses'))return[];
  const rows=await qMaybe(`SELECT id,pncp_key,org_cnpj,year,sequence,model,analysis,readiness,diagnostics,analyzed_at FROM tender_intelligence_analyses WHERE user_id=$1 ORDER BY analyzed_at DESC LIMIT 8`,[uid]);
  return rows.map(r=>{const a=r.analysis||{},overview=a.tender_overview||{},crit=Array.isArray(a.critical_points)?a.critical_points:[],high=crit.filter(x=>['high','critical'].includes(x?.risk_level)).length;return{id:r.id,pncp_key:r.pncp_key,org_cnpj:r.org_cnpj,year:r.year,sequence:r.sequence,model:r.model,analyzed_at:r.analyzed_at,confidence:a.confidence||'low',object:overview.object||null,organization:overview.organization||null,critical_points:crit.length,high_risk_points:high,coverage_percent:num(r.diagnostics?.coverage_percent),verification_pass:Boolean(r.diagnostics?.verification_pass)}});
}
async function preferences(uid){const r=await qMaybe('SELECT config FROM user_dashboard_preferences WHERE user_id=$1',[uid]);return r[0]?.config||{hidden_widgets:[]}}
function funnel(items){const counts={analisar:0,preparando_documentacao:0,proposta_pronta:0,participando:0,recurso:0,vencida:0,perdida:0,arquivada:0};for(const x of items)if(x.status in counts)counts[x.status]++;return counts}
function agenda(recs,tracked,health){
  const events=[],seen=new Set();
  for(const t of tracked){if(t.closes_at&&new Date(t.closes_at)>=new Date()&&!seen.has(t.pncp_key)){seen.add(t.pncp_key);events.push({type:'session',date:t.closes_at,title:t.object_text||'Licitação acompanhada',subtitle:[t.modality_name,t.org_name,t.municipality,t.uf].filter(Boolean).join(' • '),pncp_key:t.pncp_key,status:t.status})}}
  for(const r of recs){const key=`${r.org_cnpj}-${r.year}-${r.sequence}`;if(r.closes_at&&new Date(r.closes_at)>=new Date()&&!seen.has(key)){const days=(new Date(r.closes_at)-new Date())/86400000;if(days<=7){seen.add(key);events.push({type:'opportunity',date:r.closes_at,title:r.object_text||'Oportunidade recomendada',subtitle:[r.modality_name,r.org_name,r.municipality,r.uf].filter(Boolean).join(' • '),pncp_key:key})}}}
  for(const d of health.next){if(d.days<=30)events.push({type:'document',date:d.expiry_date,title:d.label,subtitle:d.days<0?'Documento vencido':d.days===0?'Vence hoje':`Vence em ${d.days} dia(s)`})}
  return events.sort((a,b)=>new Date(a.date)-new Date(b.date)).slice(0,16);
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

async function overview(uid,user){
  const health=await documentHealth(uid),recs=await recommendations(uid,health.map),tracked=await tracking(uid),ai=await recentAi(uid),prefs=await preferences(uid);
  const alerts=(await qMaybe(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE enabled)::int active FROM saved_alerts WHERE user_id=$1`,[uid],[{total:0,active:0}]))[0]||{};
  const company=(await qMaybe('SELECT cnpj,legal_name,trade_name,state,municipality,contact_name FROM company_profiles WHERE user_id=$1 LIMIT 1',[uid]))[0]||null;
  const todayStart=Date.parse(today()+'T00:00:00-03:00'),matchedToday=recs.filter(x=>new Date(x.detected_at).getTime()>=todayStart).length,highReady=recs.filter(x=>x.readiness.score>=90&&x.readiness.blockers===0).length;
  const events=agenda(recs,tracked,health),upcoming7=events.filter(x=>['session','opportunity'].includes(x.type)&&new Date(x.date)-new Date()<=7*86400000&&new Date(x.date)>=new Date()).length;
  const pr=priorities({alertsCount:num(alerts.active),health,tracked,ai,company});
  const activeTracked=tracked.filter(x=>!['vencida','perdida','arquivada'].includes(x.status)).length;
  return{generated_at:new Date().toISOString(),user:{id:user.id,email:user.email,display_name:company?.contact_name||company?.trade_name||company?.legal_name||String(user.email||'Usuário').split('@')[0],company},metrics:{new_matches_today:matchedToday,recommended_high:highReady,tracked_active:activeTracked,upcoming_7d:upcoming7,documents_risk:health.expired+health.due30,critical_actions:pr.filter(x=>['critical','high'].includes(x.tone)).length,active_alerts:num(alerts.active)},recommendations:recs,priorities:pr,agenda:events,habilitation:{score:health.score,baseline_count:health.baseline_count,present:health.present,missing:health.missing,expired:health.expired,due7:health.due7,due30:health.due30,next:health.next},tracking:tracked,funnel:funnel(tracked),recent_ai:ai,preferences:prefs};
}

async function saveTracking(uid,b){
  const cnpj=digits(b.cnpj).slice(0,14),year=Number(b.year),sequence=Number(b.sequence),status=clean(b.status,50)||'analisar';
  if(cnpj.length!==14||!Number.isInteger(year)||!Number.isInteger(sequence)||sequence<1)throw Object.assign(new Error('Identificação da licitação inválida.'),{status:400});
  if(!STATUSES.has(status))throw Object.assign(new Error('Status de acompanhamento inválido.'),{status:400});
  const procurement=(await qMaybe(`SELECT pncp_id FROM monitored_procurements WHERE org_cnpj=$1 AND year=$2 AND sequence=$3 ORDER BY last_seen_at DESC LIMIT 1`,[cnpj,year,sequence]))[0];
  if(!procurement)throw Object.assign(new Error('Licitação não localizada na base do Radar.'),{status:404});
  const key=`${cnpj}-${year}-${sequence}`;
  const r=await pool.query(`INSERT INTO user_tender_tracking(user_id,pncp_key,org_cnpj,year,sequence,status,notes) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id,pncp_key) DO UPDATE SET status=EXCLUDED.status,notes=COALESCE(EXCLUDED.notes,user_tender_tracking.notes),updated_at=NOW() RETURNING *`,[uid,key,cnpj,year,sequence,status,clean(b.notes,1500)||null]);return r.rows[0];
}
async function savePreferences(uid,b){const hidden=[...new Set(Array.isArray(b.hidden_widgets)?b.hidden_widgets.map(x=>clean(x,60)).filter(x=>WIDGETS.has(x)):[])];const config={hidden_widgets:hidden};await pool.query(`INSERT INTO user_dashboard_preferences(user_id,config) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET config=EXCLUDED.config,updated_at=NOW()`,[uid,JSON.stringify(config)]);return config}

export async function handleUserDashboardRoute(req,res,url){
  if(!url.pathname.startsWith('/api/dashboard'))return false;
  if(!pool){json(res,503,{error:'Dashboard indisponível temporariamente.'});return true}
  try{
    await initUserDashboard();if(!trustedOrigin(req)){json(res,403,{error:'Origem não autorizada.',code:'origin_not_authorized'});return true}
    const user=await authUser(req);if(!user){json(res,401,{error:'Faça login para acessar seu dashboard.'});return true}
    if(req.method==='GET'&&url.pathname==='/api/dashboard/overview'){json(res,200,await overview(user.id,user));return true}
    if(req.method==='GET'&&url.pathname==='/api/dashboard/tracking'){const items=await tracking(user.id);json(res,200,{items,funnel:funnel(items)});return true}
    if(req.method==='POST'&&url.pathname==='/api/dashboard/tracking'){json(res,200,{ok:true,item:await saveTracking(user.id,await readJson(req))});return true}
    const del=url.pathname.match(/^\/api\/dashboard\/tracking\/(\d+)$/);if(del&&req.method==='DELETE'){const r=await pool.query('DELETE FROM user_tender_tracking WHERE id=$1 AND user_id=$2 RETURNING id',[Number(del[1]),user.id]);if(!r.rows[0]){json(res,404,{error:'Acompanhamento não encontrado.'});return true}json(res,200,{ok:true});return true}
    if(req.method==='POST'&&url.pathname==='/api/dashboard/preferences'){json(res,200,{ok:true,preferences:await savePreferences(user.id,await readJson(req))});return true}
    json(res,404,{error:'Rota do dashboard não encontrada.'});return true;
  }catch(e){console.error('user dashboard v1:',e?.stack||e);json(res,e?.status||500,{error:e?.status?e.message:'Erro interno no dashboard.'});return true}
}

export const __test={STATUSES,WIDGETS,BASELINE,readinessFor,docState};
