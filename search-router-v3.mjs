import { Pool } from 'pg';
import { fetchPncpOpenSearch, normalizeSearchFilters, applySearchFilters, resultKey, pncpUrl, originUrl, municipalityOf, closingOf, pncpClientHealth } from './pncp-client-v3.mjs';

const PORT=Number(process.env.PORT||10000);
const DATABASE_URL=process.env.DATABASE_URL||'';
const pool=DATABASE_URL?new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:3,idleTimeoutMillis:30000}):null;
const cache=new Map();
let ready=false,refreshTimer=null,openRefreshRunning=false;
let lastRemote={at:null,ok:null,errors:0,partial:false,count:0,strategy:'open-proposals-background'};
const digits=v=>String(v??'').replace(/\D/g,'');
const clean=(v,n=500)=>String(v??'').trim().slice(0,n);
const validDate=v=>{if(!v)return null;const t=Date.parse(v);return Number.isFinite(t)?new Date(t).toISOString():null};

async function init(){
  if(ready||!pool)return;
  await pool.query(`CREATE TABLE IF NOT EXISTS monitored_procurements(
    pncp_id TEXT PRIMARY KEY,org_cnpj TEXT,year INTEGER,sequence INTEGER,modality_code INTEGER,modality_name TEXT,object_text TEXT,org_name TEXT,unit_name TEXT,municipality TEXT,uf TEXT,power_id TEXT,sphere_id TEXT,estimated_value NUMERIC(18,2),published_at TIMESTAMPTZ,closes_at TIMESTAMPTZ,pncp_url TEXT,origin_url TEXT,raw JSONB NOT NULL,detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
    if(!r.ok)return null;
    const d=await r.json().catch(()=>({}));
    return d.user||null;
  }catch{return null}
}
function send(res,status,data){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.end(JSON.stringify(data));
}
function filtersFromUrl(url){return normalizeSearchFilters({
  keyword:url.searchParams.get('keyword')||'',uf:url.searchParams.get('uf')||'',municipality:url.searchParams.get('municipality')||'',municipalityIbge:url.searchParams.get('municipalityIbge')||'',
  modality:url.searchParams.get('modalidade')||'',org:url.searchParams.get('org')||'',cnpj:url.searchParams.get('cnpj')||'',minValue:url.searchParams.get('minValue'),maxValue:url.searchParams.get('maxValue'),
  openOnly:true,days:url.searchParams.has('days')?url.searchParams.get('days'):'0',order:url.searchParams.get('order')||'newest'
})}
function sourcePlatform(raw={}){
  const direct=clean(raw?.usuarioNome||raw?.nomeSistemaOrigem||raw?.sistemaOrigem,180);
  if(direct)return direct;
  const u=originUrl(raw);
  try{return u?new URL(u).hostname.replace(/^www\./,''):''}catch{return ''}
}

async function localSearch(filters,limit=5000){
  if(!pool)return [];
  await init();
  const f={...normalizeSearchFilters(filters),openOnly:true};
  const where=['closes_at IS NOT NULL','closes_at >= NOW()'];
  const params=[];
  let n=1;
  const add=(sql,val)=>{where.push(sql.replace('?',`$${n++}`));params.push(val)};

  if(f.days>0){where.push(`published_at >= NOW() - ($${n++}::int * INTERVAL '1 day')`);params.push(f.days)}
  if(f.uf)add('uf=?',f.uf);
  if(f.modalities.length){where.push(`modality_code = ANY($${n++}::int[])`);params.push(f.modalities)}
  if(f.cnpj.length===14)add('org_cnpj=?',f.cnpj);
  if(f.municipalityIbge.length===7)add("COALESCE(raw->'unidadeOrgao'->>'codigoIbge','')=?",f.municipalityIbge);
  if(f.minValue!==null){where.push(`estimated_value >= $${n++}`);params.push(f.minValue)}
  if(f.maxValue!==null){where.push(`estimated_value <= $${n++}`);params.push(f.maxValue)}

  const maxRows=Math.min(Math.max(Number(limit)||5000,100),5000);
  params.push(maxRows);
  const order=f.order==='value_desc'?'estimated_value DESC NULLS LAST':f.order==='value_asc'?'estimated_value ASC NULLS LAST':f.order==='deadline'?'closes_at ASC NULLS LAST':'published_at DESC NULLS LAST, closes_at ASC NULLS LAST';
  const r=await pool.query(`SELECT raw,pncp_url,origin_url,detected_at,last_seen_at FROM monitored_procurements WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT $${n}`,params);
  const candidates=r.rows.map(row=>({...row.raw,_pncpUrl:row.pncp_url||pncpUrl(row.raw||{}),_originUrl:row.origin_url||originUrl(row.raw||{}),_sourcePlatform:sourcePlatform(row.raw||{}),_detectedAt:row.detected_at?new Date(row.detected_at).toISOString():null,_lastSeenAt:row.last_seen_at?new Date(row.last_seen_at).toISOString():null,_liveMonitor:true,_activeOpportunity:true}));
  return applySearchFilters(candidates,f);
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
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    for(const x of items.slice(0,5000)){
      const v=dbValues(x,true);
      await client.query(`INSERT INTO monitored_procurements(pncp_id,org_cnpj,year,sequence,modality_code,modality_name,object_text,org_name,unit_name,municipality,uf,power_id,sphere_id,estimated_value,published_at,closes_at,pncp_url,origin_url,raw,detected_at,last_seen_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,NOW())
        ON CONFLICT(pncp_id) DO UPDATE SET modality_code=EXCLUDED.modality_code,modality_name=EXCLUDED.modality_name,object_text=EXCLUDED.object_text,org_name=EXCLUDED.org_name,unit_name=EXCLUDED.unit_name,municipality=EXCLUDED.municipality,uf=EXCLUDED.uf,estimated_value=EXCLUDED.estimated_value,published_at=EXCLUDED.published_at,closes_at=EXCLUDED.closes_at,pncp_url=EXCLUDED.pncp_url,origin_url=EXCLUDED.origin_url,raw=EXCLUDED.raw,last_seen_at=NOW()`,v);
    }
    await client.query('COMMIT');
  }catch(e){try{await client.query('ROLLBACK')}catch{}throw e}finally{client.release()}
}
async function refreshOpenIndex(filters={}){
  if(openRefreshRunning)return false;
  openRefreshRunning=true;
  try{
    const remote=await fetchPncpOpenSearch({...filters,openOnly:true});
    await persistRemote(remote.items);
    lastRemote={at:new Date().toISOString(),ok:true,errors:remote.errors.length,partial:remote.partial,count:remote.items.length,strategy:'open-proposals-background',successful_modalities:remote.successfulModalities,failed_modalities:remote.failedModalities};
    cache.clear();
    console.log(`search router v4 open refresh: modalities=${remote.successfulModalities}/14 items=${remote.items.length} errors=${remote.failedModalities} partial=${Boolean(remote.partial)}`);
    return true;
  }catch(e){
    lastRemote={at:new Date().toISOString(),ok:false,errors:1,partial:true,count:0,strategy:'open-proposals-background',message:clean(e?.message||'PNCP indisponível',180)};
    console.warn('search router v4 open refresh deferred:',e?.message||e);
    return false;
  }finally{openRefreshRunning=false}
}
function scheduleOpenRefresh(){
  if(refreshTimer)return;
  setTimeout(()=>refreshOpenIndex({days:0}).catch(()=>{}),2500).unref?.();
  refreshTimer=setInterval(()=>refreshOpenIndex({days:0}).catch(()=>{}),300000);
  refreshTimer.unref?.();
}

async function searchCore(filters){
  const f={...normalizeSearchFilters(filters),openOnly:true},key=JSON.stringify(f),hit=cache.get(key);
  if(hit&&Date.now()-hit.at<15000)return hit.data;
  const started=Date.now();
  const items=await localSearch(f,5000);
  refreshOpenIndex(f).catch(()=>{});
  const platforms=[...new Set(items.map(x=>x?._sourcePlatform).filter(Boolean))].slice(0,12);
  const data={items,source:'PNCP sincronizado + base monitorada RLB',strategy:'active-local-first',active_only:true,remote_refresh:'background',platforms,partial:false,local_count:items.length,remote_count:lastRemote.count||0,query_ms:Date.now()-started,fetched_at:new Date().toISOString()};
  cache.set(key,{at:Date.now(),data});
  return data;
}

async function alertFeed(userId){
  if(!pool)return [];
  await init();
  const a=await pool.query('SELECT * FROM saved_alerts WHERE user_id=$1 AND enabled=TRUE ORDER BY id DESC LIMIT 100',[userId]);
  const matches=[];
  for(const alert of a.rows){
    const filters={keyword:alert.keyword||'',uf:alert.uf||'',municipality:alert.municipality||'',municipalityIbge:alert.municipality_ibge||'',modality:alert.modality_code||'',org:alert.org_name||'',cnpj:alert.org_cnpj||'',minValue:alert.min_value,maxValue:alert.max_value,days:0,openOnly:true,order:'newest'};
    const items=await localSearch(filters,5000).catch(()=>[]);
    for(const item of items.slice(0,100))matches.push({alert:{id:alert.id,name:alert.name},item});
  }
  const seen=new Set();
  return matches.filter(m=>{const k=`${m.alert.id}:${resultKey(m.item)}`;if(seen.has(k))return false;seen.add(k);return true}).sort((a,b)=>(Date.parse(b.item?._detectedAt||b.item?.dataPublicacaoPncp||0)||0)-(Date.parse(a.item?._detectedAt||a.item?.dataPublicacaoPncp||0)||0)).slice(0,250);
}

async function status(){
  let db={total:0,active:0,expired:0,no_deadline:0,last_seen_at:null,states:[]};
  if(pool){
    await init();
    const [t,s]=await Promise.all([
      pool.query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE closes_at>=NOW())::int active,COUNT(*) FILTER(WHERE closes_at<NOW())::int expired,COUNT(*) FILTER(WHERE closes_at IS NULL)::int no_deadline,MAX(last_seen_at) last_seen_at FROM monitored_procurements`),
      pool.query(`SELECT uf,COUNT(*)::int count FROM monitored_procurements WHERE closes_at>=NOW() GROUP BY uf ORDER BY count DESC LIMIT 27`)
    ]);
    db={...t.rows[0],states:s.rows};
  }
  return {ok:true,version:'4.0',search_strategy:'active-local-first',active_only:true,database:db,pncp:pncpClientHealth(),last_remote:lastRemote};
}

export async function initSearchRouterV3(){await init();scheduleOpenRefresh();console.log('search router v4 ready: active-only local-first search + PNCP open-proposal background refresh')}
export async function handleSearchV3Route(req,res,url){
  if(!['/api/licitacoes','/api/alerts/feed','/api/search-status'].includes(url.pathname))return false;
  const user=await auth(req);
  if(!user){send(res,401,{error:'Faça login para continuar.'});return true}
  try{
    if(req.method==='GET'&&url.pathname==='/api/licitacoes'){send(res,200,await searchCore(filtersFromUrl(url)));return true}
    if(req.method==='GET'&&url.pathname==='/api/alerts/feed'){send(res,200,{items:await alertFeed(user.id),source:'oportunidades ativas da base monitorada do Radar',active_only:true,fetched_at:new Date().toISOString()});return true}
    if(req.method==='GET'&&url.pathname==='/api/search-status'){send(res,200,{status:await status()});return true}
    return false;
  }catch(e){
    console.error('search router v4 error:',e?.message||e);
    send(res,e?.status||500,{error:e?.status?e.message:'Falha temporária na pesquisa.',code:e?.code||'search_error'});
    return true;
  }
}
