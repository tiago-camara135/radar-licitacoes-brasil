import { Pool } from 'pg';
import { fetchPncpRange, PNCP_MODALITY_CODES, resultKey, pncpUrl, originUrl, municipalityOf, closingOf } from './pncp-client-v3.mjs';

const DATABASE_URL=process.env.DATABASE_URL||'';
const NORMAL_INTERVAL_MS=Math.max(90000,Number(process.env.PNCP_MONITOR_INTERVAL_MS||120000));
const BACKOFF_INTERVAL_MS=300000;
const BACKFILL_DAYS=Math.min(Math.max(Number(process.env.PNCP_BACKFILL_DAYS||7),1),14);
const LIVE_PAGE_BUDGET=Math.min(Math.max(Number(process.env.PNCP_LIVE_PAGE_BUDGET||4),2),8);
const BACKFILL_PAGE_BUDGET=Math.min(Math.max(Number(process.env.PNCP_BACKFILL_PAGE_BUDGET||3),2),6);
const pool=DATABASE_URL?new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:3,idleTimeoutMillis:30000}):null;
const memory=new Map(),subscribers=new Set();
let timer=null,backfillTimer=null,running=false,backfillRunning=false,ready=false,firstScan=true,totalStored=0,lastScanAt=null,lastSuccessAt=null,lastDetectedAt=null,lastNewCount=0,consecutiveFailures=0,lastError=null;
let backfillQueue=[];let backfillCompleted=0;let backfillLastError=null;
const digits=v=>String(v??'').replace(/\D/g,'');
const clean=(v,n=500)=>String(v??'').trim().slice(0,n);
const validDate=v=>{if(!v)return null;const t=Date.parse(v);return Number.isFinite(t)?new Date(t).toISOString():null};
const decorate=(x,detectedAt=null)=>({...x,_detectedAt:detectedAt||x?._detectedAt||null,_pncpUrl:pncpUrl(x),_originUrl:originUrl(x),_liveMonitor:true});

async function initStorage(){
  if(ready)return;
  if(pool){
    await pool.query(`CREATE TABLE IF NOT EXISTS monitored_procurements(
      pncp_id TEXT PRIMARY KEY,org_cnpj TEXT,year INTEGER,sequence INTEGER,modality_code INTEGER,modality_name TEXT,object_text TEXT,org_name TEXT,unit_name TEXT,municipality TEXT,uf TEXT,power_id TEXT,sphere_id TEXT,estimated_value NUMERIC(18,2),published_at TIMESTAMPTZ,closes_at TIMESTAMPTZ,pncp_url TEXT,origin_url TEXT,raw JSONB NOT NULL,detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_monitored_detected ON monitored_procurements(detected_at DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_monitored_published ON monitored_procurements(published_at DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_monitored_location ON monitored_procurements(uf,municipality)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_monitored_uf_pub_v3 ON monitored_procurements(uf,published_at DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_monitored_mod_pub_v3 ON monitored_procurements(modality_code,published_at DESC)');
    const r=await pool.query('SELECT COUNT(*)::int count FROM monitored_procurements');totalStored=Number(r.rows[0]?.count||0);
  }
  const today=new Date();backfillQueue=[];
  for(let d=1;d<BACKFILL_DAYS;d++)backfillQueue.push(new Date(today.getTime()-d*86400000));
  ready=true;console.log(`live monitor v3 storage ready: ${pool?'postgresql':'memory'} (${totalStored} stored; backfill ${BACKFILL_DAYS}d; live pages ${LIVE_PAGE_BUDGET})`);
}

function values(x,historical){
  const estimated=Number(x?.valorTotalEstimado),pub=validDate(x?.dataPublicacaoPncp),detected=historical?(pub||new Date(Date.now()-86400000).toISOString()):new Date().toISOString();
  return [resultKey(x),digits(x?.orgaoEntidade?.cnpj).slice(0,14)||null,Number.isInteger(Number(x?.anoCompra))?Number(x.anoCompra):null,Number.isInteger(Number(x?.sequencialCompra))?Number(x.sequencialCompra):null,
    Number.isInteger(Number(x?._modalidadeConsultada||x?.modalidadeId))?Number(x?._modalidadeConsultada||x?.modalidadeId):null,clean(x?.modalidadeNome,180)||null,clean(x?.objetoCompra,4000)||null,clean(x?.orgaoEntidade?.razaoSocial,500)||null,clean(x?.unidadeOrgao?.nomeUnidade,500)||null,
    clean(municipalityOf(x),180)||null,clean(x?.unidadeOrgao?.ufSigla||x?.ufSigla,2).toUpperCase()||null,clean(x?.orgaoEntidade?.poderId,20)||null,clean(x?.orgaoEntidade?.esferaId,20)||null,Number.isFinite(estimated)?estimated:null,pub,validDate(closingOf(x)),pncpUrl(x)||null,originUrl(x)||null,JSON.stringify(x),detected];
}
async function persist(items,{historical=false}={}){
  if(!items?.length)return [];
  if(!pool){const fresh=[];for(const x of items){const k=resultKey(x);if(!memory.has(k)){const t=historical?(validDate(x?.dataPublicacaoPncp)||new Date(Date.now()-86400000).toISOString()):new Date().toISOString();memory.set(k,decorate(x,t));fresh.push(decorate(x,t))}else memory.set(k,{...memory.get(k),...decorate(x,memory.get(k)?._detectedAt)})}totalStored=memory.size;return fresh}
  const ids=items.map(resultKey).filter(Boolean);const knownResult=ids.length?await pool.query('SELECT pncp_id FROM monitored_procurements WHERE pncp_id=ANY($1::text[])',[ids]):{rows:[]};const known=new Set(knownResult.rows.map(r=>r.pncp_id));const fresh=[];
  for(const x of items){
    const k=resultKey(x);if(!k)continue;const v=values(x,historical);
    await pool.query(`INSERT INTO monitored_procurements(pncp_id,org_cnpj,year,sequence,modality_code,modality_name,object_text,org_name,unit_name,municipality,uf,power_id,sphere_id,estimated_value,published_at,closes_at,pncp_url,origin_url,raw,detected_at,last_seen_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,NOW())
      ON CONFLICT(pncp_id) DO UPDATE SET org_cnpj=EXCLUDED.org_cnpj,year=EXCLUDED.year,sequence=EXCLUDED.sequence,modality_code=EXCLUDED.modality_code,modality_name=EXCLUDED.modality_name,object_text=EXCLUDED.object_text,org_name=EXCLUDED.org_name,unit_name=EXCLUDED.unit_name,municipality=EXCLUDED.municipality,uf=EXCLUDED.uf,power_id=EXCLUDED.power_id,sphere_id=EXCLUDED.sphere_id,estimated_value=EXCLUDED.estimated_value,published_at=EXCLUDED.published_at,closes_at=EXCLUDED.closes_at,pncp_url=EXCLUDED.pncp_url,origin_url=EXCLUDED.origin_url,raw=EXCLUDED.raw,last_seen_at=NOW()`,v);
    if(!known.has(k))fresh.push(decorate(x,v[19]));
  }
  totalStored+=fresh.length;return fresh;
}
async function latest(limit=40){
  const n=Math.min(Math.max(Number(limit)||40,1),100);
  if(!pool)return [...memory.values()].sort((a,b)=>Date.parse(b?.dataPublicacaoPncp||b?._detectedAt||0)-Date.parse(a?.dataPublicacaoPncp||a?._detectedAt||0)).slice(0,n);
  const r=await pool.query('SELECT raw,detected_at,pncp_url,origin_url FROM monitored_procurements ORDER BY COALESCE(published_at,detected_at) DESC LIMIT $1',[n]);
  return r.rows.map(row=>({...row.raw,_detectedAt:new Date(row.detected_at).toISOString(),_pncpUrl:row.pncp_url||pncpUrl(row.raw||{}),_originUrl:row.origin_url||originUrl(row.raw||{}),_liveMonitor:true}));
}
function status(){return {enabled:true,version:'3.1',storage:pool?'postgresql':'temporary-memory',interval_seconds:Math.round((consecutiveFailures?BACKOFF_INTERVAL_MS:NORMAL_INTERVAL_MS)/1000),running,baseline_completed:!firstScan,last_scan_at:lastScanAt,last_success_at:lastSuccessAt,last_detected_at:lastDetectedAt,last_new_count:lastNewCount,total_stored:totalStored,subscribers:subscribers.size,consecutive_failures:consecutiveFailures,last_error:lastError,page_budget:LIVE_PAGE_BUDGET,backfill:{days:BACKFILL_DAYS,pending:backfillQueue.length,completed:backfillCompleted,running:backfillRunning,page_budget:BACKFILL_PAGE_BUDGET,last_error:backfillLastError}}}
function broadcast(event,data){const packet=`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;for(const res of [...subscribers]){try{res.write(packet)}catch{subscribers.delete(res)}}}

async function scan(){
  if(running)return;running=true;lastScanAt=new Date().toISOString();
  try{
    await initStorage();const today=new Date();
    const result=await fetchPncpRange({startDate:today,endDate:today,filters:{},codes:PNCP_MODALITY_CODES,maxPagesPerModality:LIVE_PAGE_BUDGET,concurrency:2});
    if(result.successfulModalities===0)throw new Error(`PNCP indisponível em todas as modalidades (${result.errors.slice(0,3).map(x=>x.message).join(' | ')})`);
    const warmup=firstScan;const fresh=await persist(result.items,{historical:warmup});
    lastSuccessAt=new Date().toISOString();consecutiveFailures=0;lastError=result.errors.length?`${result.errors.length} modalidade(s) com falha parcial`:null;lastNewCount=warmup?0:fresh.length;
    if(warmup){firstScan=false;console.log(`live monitor v3 baseline ready: ${result.items.length} scanned, ${fresh.length} cache gaps filled, partial=${result.partial}`)}
    else if(fresh.length){lastDetectedAt=new Date().toISOString();console.log(`live monitor v3 detected ${fresh.length} new procurement(s)`);broadcast('procurement',{items:fresh.slice(0,100),detected_at:lastDetectedAt})}
    if(result.partial)console.warn(`live monitor v3 partial scan: ${result.errors.map(x=>`${x.code}:${x.status||'err'}`).join(', ')||'page budget reached'}`);
    broadcast('status',status());scheduleBackfill(20000);
  }catch(e){consecutiveFailures++;lastError=clean(e?.message||'falha no monitor',500);console.error('live monitor v3 error:',lastError);broadcast('status',status())}
  finally{running=false;schedule()}
}
function schedule(){if(timer)clearTimeout(timer);timer=setTimeout(scan,consecutiveFailures?BACKOFF_INTERVAL_MS:NORMAL_INTERVAL_MS);timer.unref?.()}

async function backfill(){
  if(backfillRunning||running||!backfillQueue.length){if(backfillQueue.length)scheduleBackfill(30000);return}
  backfillRunning=true;const date=backfillQueue.shift();
  try{
    const result=await fetchPncpRange({startDate:date,endDate:date,filters:{},codes:PNCP_MODALITY_CODES,maxPagesPerModality:BACKFILL_PAGE_BUDGET,concurrency:2});
    if(result.successfulModalities===0)throw new Error('PNCP indisponível durante preenchimento histórico');
    const fresh=await persist(result.items,{historical:true});backfillCompleted++;backfillLastError=result.partial?`Parcial: ${result.errors.length} modalidade(s)`:null;
    console.log(`live monitor v3 backfill ${date.toISOString().slice(0,10)}: ${result.items.length} scanned, ${fresh.length} inserted, partial=${result.partial}`);
  }catch(e){backfillLastError=clean(e?.message||'falha',300);backfillQueue.push(date);console.warn('live monitor v3 backfill error:',backfillLastError)}
  finally{backfillRunning=false;if(backfillQueue.length)scheduleBackfill(backfillLastError?90000:45000)}
}
function scheduleBackfill(ms=30000){if(!backfillQueue.length)return;if(backfillTimer)clearTimeout(backfillTimer);backfillTimer=setTimeout(backfill,ms);backfillTimer.unref?.()}

export async function initLiveMonitor(){await initStorage();if(!timer&&!running){timer=setTimeout(scan,5000);timer.unref?.()}}
function common(res,type='application/json; charset=utf-8'){res.setHeader('Content-Type',type);res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin')}
export async function handleLiveRoute(req,res,url){
  if(req.method==='GET'&&url.pathname==='/api/live-feed'){common(res);res.statusCode=200;res.end(JSON.stringify({source:'PNCP-live-monitor-v3',items:await latest(url.searchParams.get('limit')||40),status:status(),fetched_at:new Date().toISOString()}));return true}
  if(req.method==='GET'&&url.pathname==='/api/live-status'){common(res);res.statusCode=200;res.end(JSON.stringify({status:status()}));return true}
  if(req.method==='GET'&&url.pathname==='/api/live-events'){
    common(res,'text/event-stream; charset=utf-8');res.setHeader('Connection','keep-alive');res.setHeader('X-Accel-Buffering','no');res.statusCode=200;res.flushHeaders?.();subscribers.add(res);res.write(`retry: 6000\nevent: status\ndata: ${JSON.stringify(status())}\n\n`);
    const hb=setInterval(()=>{try{res.write(`: heartbeat ${Date.now()}\n\n`)}catch{clearInterval(hb);subscribers.delete(res)}},20000);hb.unref?.();req.on('close',()=>{clearInterval(hb);subscribers.delete(res)});return true
  }
  return false;
}
