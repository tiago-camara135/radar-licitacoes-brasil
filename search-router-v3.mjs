import { Pool } from 'pg';
import { fetchPncpSearch, normalizeSearchFilters, applySearchFilters, resultKey, pncpUrl, originUrl, municipalityOf, closingOf, pncpClientHealth } from './pncp-client-v3.mjs';

const PORT=Number(process.env.PORT||10000);
const DATABASE_URL=process.env.DATABASE_URL||'';
const pool=DATABASE_URL?new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:3,idleTimeoutMillis:30000}):null;
const cache=new Map();
let ready=false;
let lastRemote={at:null,ok:null,errors:0,partial:false,count:0};
const digits=v=>String(v??'').replace(/\D/g,'');
const clean=(v,n=500)=>String(v??'').trim().slice(0,n);
const validDate=v=>{if(!v)return null;const t=Date.parse(v);return Number.isFinite(t)?new Date(t).toISOString():null};

async function init(){
  if(ready||!pool)return;
  await pool.query(`CREATE TABLE IF NOT EXISTS monitored_procurements(
    pncp_id TEXT PRIMARY KEY,
    org_cnpj TEXT,
    year INTEGER,
    sequence INTEGER,
    modality_code INTEGER,
    modality_name TEXT,
    object_text TEXT,
    org_name TEXT,
    unit_name TEXT,
    municipality TEXT,
    uf TEXT,
    power_id TEXT,
    sphere_id TEXT,
    estimated_value NUMERIC(18,2),
    published_at TIMESTAMPTZ,
    closes_at TIMESTAMPTZ,
    pncp_url TEXT,
    origin_url TEXT,
    raw JSONB NOT NULL,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_monitored_uf_pub_v3 ON monitored_procurements(uf,published_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_monitored_mod_pub_v3 ON monitored_procurements(modality_code,published_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_monitored_close_v3 ON monitored_procurements(closes_at)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_monitored_cnpj_v3 ON monitored_procurements(org_cnpj)');
  ready=true;
}

async function auth(req){
  try{
    const r=await fetch(`http://127.0.0.1:${PORT}/api/me`,{headers:{cookie:String(req.headers.cookie||'')},signal:AbortSignal.timeout(5000)});
    if(!r.ok)return null;const d=await r.json().catch(()=>({}));return d.user||null;
  }catch{return null}
}
function send(res,status,data){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(data))}
function filtersFromUrl(url){return normalizeSearchFilters({
  keyword:url.searchParams.get('keyword')||'',uf:url.searchParams.get('uf')||'',municipality:url.searchParams.get('municipality')||'',municipalityIbge:url.searchParams.get('municipalityIbge')||'',
  modality:url.searchParams.get('modalidade')||'',org:url.searchParams.get('org')||'',cnpj:url.searchParams.get('cnpj')||'',minValue:url.searchParams.get('minValue'),maxValue:url.searchParams.get('maxValue'),
  openOnly:url.searchParams.get('openOnly')==='true',days:url.searchParams.get('days')||'7',order:url.searchParams.get('order')||'newest'
})}

async function localSearch(filters,limit=900){
  if(!pool)return [];
  await init();
  const f=normalizeSearchFilters(filters),where=['published_at >= NOW() - ($1::int * INTERVAL \'1 day\')'],params=[f.days];let n=2;
  const add=(sql,val)=>{where.push(sql.replace('?',`$${n++}`));params.push(val)};
  if(f.uf)add('uf=?',f.uf);
  if(f.modality)add('modality_code=?',f.modality);
  if(f.cnpj.length===14)add('org_cnpj=?',f.cnpj);
  if(f.municipalityIbge.length===7)add("COALESCE(raw->'unidadeOrgao'->>'codigoIbge','')=?",f.municipalityIbge);
  if(f.municipality)add('municipality ILIKE ?',`%${f.municipality}%`);
  if(f.org)add('(org_name ILIKE ? OR unit_name ILIKE ?)'.replace('?',`$${n}`).replace('?',`$${n+1}`),null);
  if(f.org){where.pop();where.push(`(org_name ILIKE $${n} OR unit_name ILIKE $${n+1})`);params.push(`%${f.org}%`,`%${f.org}%`);n+=2}
  if(f.keyword){where.push(`(object_text ILIKE $${n} OR org_name ILIKE $${n} OR unit_name ILIKE $${n})`);params.push(`%${f.keyword}%`);n++}
  if(f.minValue!==null){where.push(`estimated_value >= $${n++}`);params.push(f.minValue)}
  if(f.maxValue!==null){where.push(`estimated_value <= $${n++}`);params.push(f.maxValue)}
  if(f.openOnly)where.push('closes_at IS NOT NULL AND closes_at >= NOW()');
  params.push(Math.min(Math.max(limit,1),1500));
  const order=f.order==='value_desc'?'estimated_value DESC NULLS LAST':f.order==='value_asc'?'estimated_value ASC NULLS LAST':f.order==='deadline'?'closes_at ASC NULLS LAST':'published_at DESC NULLS LAST';
  const r=await pool.query(`SELECT raw,pncp_url,origin_url,detected_at FROM monitored_procurements WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT $${n}`,params);
  return r.rows.map(row=>({...row.raw,_pncpUrl:row.pncp_url||pncpUrl(row.raw||{}),_originUrl:row.origin_url||originUrl(row.raw||{}),_detectedAt:row.detected_at?new Date(row.detected_at).toISOString():null,_liveMonitor:true}));
}

function dbValues(x,historical=true){
  const estimated=Number(x?.valorTotalEstimado),pub=validDate(x?.dataPublicacaoPncp),detected=historical?(pub||new Date(Date.now()-86400000).toISOString()):new Date().toISOString();
  return [resultKey(x),digits(x?.orgaoEntidade?.cnpj).slice(0,14)||null,Number.isInteger(Number(x?.anoCompra))?Number(x.anoCompra):null,Number.isInteger(Number(x?.sequencialCompra))?Number(x.sequencialCompra):null,
    Number.isInteger(Number(x?._modalidadeConsultada||x?.modalidadeId))?Number(x?._modalidadeConsultada||x?.modalidadeId):null,clean(x?.modalidadeNome,180)||null,clean(x?.objetoCompra,4000)||null,clean(x?.orgaoEntidade?.razaoSocial,500)||null,
    clean(x?.unidadeOrgao?.nomeUnidade,500)||null,clean(municipalityOf(x),180)||null,clean(x?.unidadeOrgao?.ufSigla||x?.ufSigla,2).toUpperCase()||null,clean(x?.orgaoEntidade?.poderId,20)||null,clean(x?.orgaoEntidade?.esferaId,20)||null,
    Number.isFinite(estimated)?estimated:null,pub,validDate(closingOf(x)),pncpUrl(x)||null,originUrl(x)||null,JSON.stringify(x),detected];
}
async function persistRemote(items){
  if(!pool||!items?.length)return;
  await init();
  for(const x of items.slice(0,4000)){
    const v=dbValues(x,true);
    await pool.query(`INSERT INTO monitored_procurements(pncp_id,org_cnpj,year,sequence,modality_code,modality_name,object_text,org_name,unit_name,municipality,uf,power_id,sphere_id,estimated_value,published_at,closes_at,pncp_url,origin_url,raw,detected_at,last_seen_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,NOW())
      ON CONFLICT(pncp_id) DO UPDATE SET modality_code=EXCLUDED.modality_code,modality_name=EXCLUDED.modality_name,object_text=EXCLUDED.object_text,org_name=EXCLUDED.org_name,unit_name=EXCLUDED.unit_name,municipality=EXCLUDED.municipality,uf=EXCLUDED.uf,estimated_value=EXCLUDED.estimated_value,published_at=EXCLUDED.published_at,closes_at=EXCLUDED.closes_at,pncp_url=EXCLUDED.pncp_url,origin_url=EXCLUDED.origin_url,raw=EXCLUDED.raw,last_seen_at=NOW()`,v).catch(()=>{});
  }
}
function mergeItems(a,b,filters){const map=new Map();for(const x of [...a,...b]){const k=resultKey(x);if(k)map.set(k,x)}return applySearchFilters([...map.values()],filters).slice(0,500)}

async function searchCore(filters){
  const f=normalizeSearchFilters(filters),key=JSON.stringify(f),hit=cache.get(key);
  if(hit&&Date.now()-hit.at<90000)return hit.data;
  const local=await localSearch(f,900).catch(()=>[]);
  let remote=null,remoteError=null;
  try{
    remote=await fetchPncpSearch(f);
    lastRemote={at:new Date().toISOString(),ok:true,errors:remote.errors.length,partial:remote.partial,count:remote.items.length};
    persistRemote(remote.items).catch(()=>{});
  }catch(e){
    remoteError=e;lastRemote={at:new Date().toISOString(),ok:false,errors:1,partial:true,count:0,message:clean(e?.message||'PNCP indisponível',180)};
  }
  const items=mergeItems(local,remote?.items||[],f);
  if(!items.length&&(!remote||remote.successfulModalities===0)){
    const err=Object.assign(new Error('O PNCP está temporariamente limitando as consultas. Tente novamente em instantes; o Radar não irá exibir zero resultados como se a pesquisa tivesse sido concluída.'),{status:503,code:'pncp_temporarily_unavailable'});throw err;
  }
  const data={items,source:remote?.successfulModalities?'PNCP + base do Radar':'base do Radar',partial:Boolean(remote?.partial||remoteError),remote_errors:remote?.errors||[],local_count:local.length,remote_count:remote?.items?.length||0,fetched_at:new Date().toISOString()};
  cache.set(key,{at:Date.now(),data});return data;
}

async function alertFeed(userId){
  if(!pool)return [];
  await init();
  const a=await pool.query('SELECT * FROM saved_alerts WHERE user_id=$1 AND enabled=TRUE ORDER BY id DESC LIMIT 20',[userId]);
  const matches=[];
  for(const alert of a.rows){
    const filters={keyword:alert.keyword||'',uf:alert.uf||'',municipality:alert.municipality||'',municipalityIbge:alert.municipality_ibge||'',modality:alert.modality_code||'',org:alert.org_name||'',cnpj:alert.org_cnpj||'',minValue:alert.min_value,maxValue:alert.max_value,days:7,openOnly:false,order:'newest'};
    const items=await localSearch(filters,120).catch(()=>[]);
    for(const item of items.slice(0,60))matches.push({alert:{id:alert.id,name:alert.name},item});
  }
  const seen=new Set();return matches.filter(m=>{const k=`${m.alert.id}:${resultKey(m.item)}`;if(seen.has(k))return false;seen.add(k);return true}).sort((a,b)=>(Date.parse(b.item?.dataPublicacaoPncp||0)||0)-(Date.parse(a.item?.dataPublicacaoPncp||0)||0)).slice(0,180);
}

async function status(){
  let db={total:0,last_seen_at:null,states:[]};
  if(pool){
    await init();
    const [t,s]=await Promise.all([pool.query('SELECT COUNT(*)::int total,MAX(last_seen_at) last_seen_at FROM monitored_procurements'),pool.query('SELECT uf,COUNT(*)::int count FROM monitored_procurements WHERE published_at>=NOW()-INTERVAL \'7 days\' GROUP BY uf ORDER BY count DESC LIMIT 27')]);
    db={total:t.rows[0]?.total||0,last_seen_at:t.rows[0]?.last_seen_at||null,states:s.rows};
  }
  return {ok:true,database:db,pncp:pncpClientHealth(),last_remote:lastRemote};
}

export async function initSearchRouterV3(){await init();console.log('search router v3 ready: resilient PNCP + local PostgreSQL cache')}
export async function handleSearchV3Route(req,res,url){
  if(!['/api/licitacoes','/api/alerts/feed','/api/search-status'].includes(url.pathname))return false;
  const user=await auth(req);if(!user){send(res,401,{error:'Faça login para continuar.'});return true}
  try{
    if(req.method==='GET'&&url.pathname==='/api/licitacoes'){
      const result=await searchCore(filtersFromUrl(url));send(res,200,result);return true;
    }
    if(req.method==='GET'&&url.pathname==='/api/alerts/feed'){
      send(res,200,{items:await alertFeed(user.id),source:'base monitorada do Radar',fetched_at:new Date().toISOString()});return true;
    }
    if(req.method==='GET'&&url.pathname==='/api/search-status'){
      send(res,200,{status:await status()});return true;
    }
    return false;
  }catch(e){console.error('search router v3 error:',e?.message||e);send(res,e?.status||500,{error:e?.status?e.message:'Falha temporária na pesquisa.',code:e?.code||'search_error'});return true}
}
