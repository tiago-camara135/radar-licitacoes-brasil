import { Pool } from 'pg';
import { fetchPncpRange, PNCP_MODALITY_CODES, resultKey, pncpUrl, originUrl, municipalityOf, closingOf } from './pncp-client-v3.mjs';

const DATABASE_URL=process.env.DATABASE_URL||'';
const NORMAL_INTERVAL_MS=Math.max(90_000,Number(process.env.PNCP_MONITOR_INTERVAL_MS||90_000));
const BACKOFF_INTERVAL_MS=Math.max(180_000,Number(process.env.PNCP_MONITOR_BACKOFF_MS||300_000));
const BACKFILL_DAYS=Math.min(Math.max(Number(process.env.PNCP_BACKFILL_DAYS||7),1),14);
const LIVE_BATCH=Math.min(Math.max(Number(process.env.PNCP_LIVE_MODALITIES_PER_CYCLE||4),1),7);
const BACKFILL_BATCH=Math.min(Math.max(Number(process.env.PNCP_BACKFILL_MODALITIES_PER_CYCLE||4),1),7);
const LIVE_PAGE_BUDGET=Math.min(Math.max(Number(process.env.PNCP_LIVE_PAGE_BUDGET||1),1),3);
const BACKFILL_PAGE_BUDGET=Math.min(Math.max(Number(process.env.PNCP_BACKFILL_PAGE_BUDGET||1),1),3);
const pool=DATABASE_URL?new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:3,idleTimeoutMillis:30_000}):null;
const memory=new Map(),subscribers=new Set();
let timer=null,backfillTimer=null,running=false,backfillRunning=false,ready=false,firstScan=true,totalStored=0,lastScanAt=null,lastSuccessAt=null,lastDetectedAt=null,lastNewCount=0,consecutiveFailures=0,lastError=null;
let liveCursor=0,backfillQueue=[],backfillCompleted=0,backfillLastError=null;
const digits=v=>String(v??'').replace(/\D/g,'');
const clean=(v,n=500)=>String(v??'').trim().slice(0,n);
const validDate=v=>{if(!v)return null;const t=Date.parse(v);return Number.isFinite(t)?new Date(t).toISOString():null};
const decorate=(x,detectedAt=null)=>({...x,_detectedAt:detectedAt||x?._detectedAt||null,_pncpUrl:pncpUrl(x),_originUrl:originUrl(x),_liveMonitor:true});

function nextLiveCodes(){
  const out=[];
  for(let i=0;i<LIVE_BATCH;i++)out.push(PNCP_MODALITY_CODES[(liveCursor+i)%PNCP_MODALITY_CODES.length]);
  liveCursor=(liveCursor+LIVE_BATCH)%PNCP_MODALITY_CODES.length;
  return [...new Set(out)];
}
function buildBackfillQueue(){
  const q=[],today=new Date();
  for(let d=1;d<BACKFILL_DAYS;d++){
    const date=new Date(today.getTime()-d*86_400_000);
    for(let i=0;i<PNCP_MODALITY_CODES.length;i+=BACKFILL_BATCH){
      q.push({date,codes:PNCP_MODALITY_CODES.slice(i,i+BACKFILL_BATCH),attempt:0});
    }
  }
  return q;
}

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
    const r=await pool.query('SELECT COUNT(*)::int count FROM monitored_procurements');
    totalStored=Number(r.rows[0]?.count||0);
    firstScan=totalStored===0;
  }
  backfillQueue=buildBackfillQueue();
  ready=true;
  console.log(`live monitor v4 ready: ${pool?'postgresql':'memory'} (${totalStored} stored; warmup=${firstScan}; ${LIVE_BATCH} modalities/cycle; ${LIVE_PAGE_BUDGET} page(s)/modality)`);
}

function values(x,historical){
  const estimated=Number(x?.valorTotalEstimado),pub=validDate(x?.dataPublicacaoPncp),detected=historical?(pub||new Date(Date.now()-86_400_000).toISOString()):new Date().toISOString();
  return [resultKey(x),digits(x?.orgaoEntidade?.cnpj).slice(0,14)||null,Number.isInteger(Number(x?.anoCompra))?Number(x.anoCompra):null,Number.isInteger(Number(x?.sequencialCompra))?Number(x.sequencialCompra):null,
    Number.isInteger(Number(x?._modalidadeConsultada||x?.modalidadeId))?Number(x?._modalidadeConsultada||x?.modalidadeId):null,clean(x?.modalidadeNome,180)||null,clean(x?.objetoCompra,4000)||null,clean(x?.orgaoEntidade?.razaoSocial,500)||null,clean(x?.unidadeOrgao?.nomeUnidade,500)||null,
    clean(municipalityOf(x),180)||null,clean(x?.unidadeOrgao?.ufSigla||x?.ufSigla,2).toUpperCase()||null,clean(x?.orgaoEntidade?.poderId,20)||null,clean(x?.orgaoEntidade?.esferaId,20)||null,Number.isFinite(estimated)?estimated:null,pub,validDate(closingOf(x)),pncpUrl(x)||null,originUrl(x)||null,JSON.stringify(x),detected];
}
async function persist(items,{historical=false}={}){
  if(!items?.length)return [];
  if(!pool){
    const fresh=[];
    for(const x of items){
      const k=resultKey(x);if(!k)continue;
      if(!memory.has(k)){
        const t=historical?(validDate(x?.dataPublicacaoPncp)||new Date(Date.now()-86_400_000).toISOString()):new Date().toISOString();
        memory.set(k,decorate(x,t));fresh.push(decorate(x,t));
      }else memory.set(k,{...memory.get(k),...decorate(x,memory.get(k)?._detectedAt)});
    }
    totalStored=memory.size;return fresh;
  }
  const ids=items.map(resultKey).filter(Boolean);
  const knownResult=ids.length?await pool.query('SELECT pncp_id FROM monitored_procurements WHERE pncp_id=ANY($1::text[])',[ids]):{rows:[]};
  const known=new Set(knownResult.rows.map(r=>r.pncp_id)),fresh=[];
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
function status(){return {enabled:true,version:'4.0',storage:pool?'postgresql':'temporary-memory',interval_seconds:Math.round((consecutiveFailures?BACKOFF_INTERVAL_MS:NORMAL_INTERVAL_MS)/1000),running,baseline_completed:!firstScan,last_scan_at:lastScanAt,last_success_at:lastSuccessAt,last_detected_at:lastDetectedAt,last_new_count:lastNewCount,total_stored:totalStored,subscribers:subscribers.size,consecutive_failures:consecutiveFailures,last_error:lastError,live:{batch_size:LIVE_BATCH,page_budget:LIVE_PAGE_BUDGET,next_cursor:liveCursor},backfill:{days:BACKFILL_DAYS,pending:backfillQueue.length,completed:backfillCompleted,running:backfillRunning,batch_size:BACKFILL_BATCH,page_budget:BACKFILL_PAGE_BUDGET,last_error:backfillLastError}}}
function broadcast(event,data){const packet=`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;for(const res of [...subscribers]){try{res.write(packet)}catch{subscribers.delete(res)}}}

async function scan(){
  if(running)return;
  running=true;lastScanAt=new Date().toISOString();
  const codes=nextLiveCodes();
  try{
    await initStorage();const today=new Date();
    const result=await fetchPncpRange({startDate:today,endDate:today,filters:{},codes,maxPagesPerModality:LIVE_PAGE_BUDGET,concurrency:1});
    if(result.successfulModalities===0)throw new Error(`PNCP indisponível no lote ${codes.join(',')} (${result.errors.slice(0,2).map(x=>x.message).join(' | ')})`);
    const warmup=firstScan,fresh=await persist(result.items,{historical:warmup});
    lastSuccessAt=new Date().toISOString();consecutiveFailures=0;lastError=result.errors.length?`${result.errors.length} modalidade(s) com falha parcial no lote ${codes.join(',')}`:null;lastNewCount=warmup?0:fresh.length;
    if(warmup){firstScan=false;console.log(`live monitor v4 baseline: codes=${codes.join(',')} scanned=${result.items.length} gaps=${fresh.length} partial=${result.partial}`)}
    else if(fresh.length){lastDetectedAt=new Date().toISOString();console.log(`live monitor v4 detected ${fresh.length} new procurement(s); codes=${codes.join(',')}`);broadcast('procurement',{items:fresh.slice(0,100),detected_at:lastDetectedAt})}
    else console.log(`live monitor v4 scan ready: codes=${codes.join(',')} scanned=${result.items.length} new=0 partial=${result.partial}`);
    if(result.errors.length)console.warn(`live monitor v4 partial: ${result.errors.map(x=>`${x.code}:${x.status||'err'}`).join(', ')}`);
    broadcast('status',status());
    scheduleBackfill(30_000);
  }catch(e){
    consecutiveFailures++;lastError=clean(e?.message||'falha no monitor',500);console.warn('live monitor v4 cycle deferred:',lastError);broadcast('status',status());
  }finally{running=false;schedule()}
}
function schedule(){if(timer)clearTimeout(timer);timer=setTimeout(scan,consecutiveFailures?BACKOFF_INTERVAL_MS:NORMAL_INTERVAL_MS);timer.unref?.()}

async function backfill(){
  if(backfillRunning||running||!backfillQueue.length){if(backfillQueue.length)scheduleBackfill(60_000);return}
  backfillRunning=true;const task=backfillQueue.shift();
  try{
    const result=await fetchPncpRange({startDate:task.date,endDate:task.date,filters:{},codes:task.codes,maxPagesPerModality:BACKFILL_PAGE_BUDGET,concurrency:1});
    if(result.successfulModalities===0)throw new Error(`PNCP indisponível no backfill ${task.date.toISOString().slice(0,10)} / ${task.codes.join(',')}`);
    const fresh=await persist(result.items,{historical:true});backfillCompleted++;backfillLastError=result.errors.length?`Parcial em ${result.errors.length} modalidade(s)`:null;
    console.log(`live monitor v4 backfill ${task.date.toISOString().slice(0,10)} codes=${task.codes.join(',')}: scanned=${result.items.length} inserted=${fresh.length} partial=${result.partial}`);
    if(result.errors.length){
      const failed=result.errors.map(x=>x.code).filter(Boolean);
      if(failed.length&&task.attempt<2)backfillQueue.push({date:task.date,codes:failed,attempt:task.attempt+1});
    }
  }catch(e){
    backfillLastError=clean(e?.message||'falha',300);
    if(task.attempt<2)backfillQueue.push({...task,attempt:task.attempt+1});
    console.warn('live monitor v4 backfill deferred:',backfillLastError);
  }finally{
    backfillRunning=false;
    if(backfillQueue.length)scheduleBackfill(backfillLastError?180_000:120_000);
  }
}
function scheduleBackfill(ms=120_000){if(!backfillQueue.length)return;if(backfillTimer)clearTimeout(backfillTimer);backfillTimer=setTimeout(backfill,ms);backfillTimer.unref?.()}

export async function initLiveMonitor(){await initStorage();if(!timer&&!running){timer=setTimeout(scan,6_000);timer.unref?.()}}
function common(res,type='application/json; charset=utf-8'){res.setHeader('Content-Type',type);res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin')}
export async function handleLiveRoute(req,res,url){
  if(req.method==='GET'&&url.pathname==='/api/live-feed'){common(res);res.statusCode=200;res.end(JSON.stringify({source:'PNCP-live-monitor-v4',items:await latest(url.searchParams.get('limit')||40),status:status(),fetched_at:new Date().toISOString()}));return true}
  if(req.method==='GET'&&url.pathname==='/api/live-status'){common(res);res.statusCode=200;res.end(JSON.stringify({status:status()}));return true}
  if(req.method==='GET'&&url.pathname==='/api/live-events'){
    common(res,'text/event-stream; charset=utf-8');res.setHeader('Connection','keep-alive');res.setHeader('X-Accel-Buffering','no');res.statusCode=200;res.flushHeaders?.();subscribers.add(res);res.write(`retry: 6000\nevent: status\ndata: ${JSON.stringify(status())}\n\n`);
    const hb=setInterval(()=>{try{res.write(`: heartbeat ${Date.now()}\n\n`)}catch{clearInterval(hb);subscribers.delete(res)}},20_000);hb.unref?.();req.on('close',()=>{clearInterval(hb);subscribers.delete(res)});return true;
  }
  return false;
}
