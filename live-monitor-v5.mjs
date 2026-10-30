import { Pool } from 'pg';
import { PNCP_MODALITY_CODES, resultKey, pncpUrl, originUrl, municipalityOf, closingOf } from './pncp-client-v3.mjs';

const DATABASE_URL=process.env.DATABASE_URL||'';
const PNCP_BASE_URL=process.env.PNCP_BASE_URL||'https://pncp.gov.br/api/consulta';
const CYCLE_MS=90_000;
const PAGE_SIZE=50;
const START_SPACING_MS=450;
const REQUEST_TIMEOUT_MS=8_000;
const WORKERS=4;
const pool=DATABASE_URL?new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:3,idleTimeoutMillis:30_000}):null;
const subscribers=new Set();
let timer=null,running=false,ready=false,firstScan=true,totalStored=0,lastScanAt=null,lastSuccessAt=null,lastDetectedAt=null,lastNewCount=0,lastError=null,consecutiveFailures=0,nextStartAt=0,gate=Promise.resolve();
const digits=v=>String(v??'').replace(/\D/g,'');
const clean=(v,n=500)=>String(v??'').trim().slice(0,n);
const validDate=v=>{if(!v)return null;const t=Date.parse(v);return Number.isFinite(t)?new Date(t).toISOString():null};
const ymd=d=>new Date(d).toISOString().slice(0,10).replaceAll('-','');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
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
    const r=await pool.query('SELECT COUNT(*)::int count FROM monitored_procurements');
    totalStored=Number(r.rows[0]?.count||0);firstScan=totalStored===0;
  }
  ready=true;
  console.log(`live monitor v5 ready: ${pool?'postgresql':'memory'} (${totalStored} stored; 14 modalities every 90s; dedicated collector)`);
}

async function waitTurn(){
  const step=gate.then(async()=>{const wait=Math.max(0,nextStartAt-Date.now());if(wait)await sleep(wait);nextStartAt=Date.now()+START_SPACING_MS});
  gate=step.catch(()=>{});await step;
}
async function fetchModality(code,date){
  await waitTurn();
  const params=new URLSearchParams({dataInicial:ymd(date),dataFinal:ymd(date),codigoModalidadeContratacao:String(code),pagina:'1',tamanhoPagina:String(PAGE_SIZE)});
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);
  try{
    const r=await fetch(`${PNCP_BASE_URL}/v1/contratacoes/publicacao?${params}`,{headers:{accept:'application/json','user-agent':'RadarLicitacoesBrasil-Live/5.2'},signal:controller.signal});
    if(r.status===204)return {code,items:[],ok:true,status:204};
    const body=await r.json().catch(()=>({}));
    if(!r.ok)return {code,items:[],ok:false,status:r.status,error:`HTTP ${r.status}`};
    const data=Array.isArray(body?.data)?body.data:Array.isArray(body)?body:[];
    return {code,items:data.map(x=>({...x,_modalidadeConsultada:code})),ok:true,status:r.status};
  }catch(e){return {code,items:[],ok:false,status:null,error:e?.name==='AbortError'?'timeout':clean(e?.message||'falha',120)}}finally{clearTimeout(timeout)}
}
async function collectSnapshot(){
  const date=new Date(),results=new Array(PNCP_MODALITY_CODES.length);let cursor=0;
  async function worker(){while(true){const i=cursor++;if(i>=PNCP_MODALITY_CODES.length)return;results[i]=await fetchModality(PNCP_MODALITY_CODES[i],date)}}
  await Promise.all(Array.from({length:WORKERS},()=>worker()));
  const errors=[],seen=new Set(),items=[];
  for(const r of results){if(!r?.ok){errors.push({code:r?.code,status:r?.status,error:r?.error});continue}for(const x of r.items){const k=resultKey(x);if(!k||seen.has(k))continue;seen.add(k);items.push(x)}}
  return {items,errors,successfulModalities:results.filter(x=>x?.ok).length};
}

function values(x,historical=false){
  const estimated=Number(x?.valorTotalEstimado),pub=validDate(x?.dataPublicacaoPncp),detected=historical?(pub||new Date().toISOString()):new Date().toISOString();
  return [resultKey(x),digits(x?.orgaoEntidade?.cnpj).slice(0,14)||null,Number.isInteger(Number(x?.anoCompra))?Number(x.anoCompra):null,Number.isInteger(Number(x?.sequencialCompra))?Number(x.sequencialCompra):null,Number.isInteger(Number(x?._modalidadeConsultada||x?.modalidadeId))?Number(x?._modalidadeConsultada||x?.modalidadeId):null,clean(x?.modalidadeNome,180)||null,clean(x?.objetoCompra,4000)||null,clean(x?.orgaoEntidade?.razaoSocial,500)||null,clean(x?.unidadeOrgao?.nomeUnidade,500)||null,clean(municipalityOf(x),180)||null,clean(x?.unidadeOrgao?.ufSigla||x?.ufSigla,2).toUpperCase()||null,clean(x?.orgaoEntidade?.poderId,20)||null,clean(x?.orgaoEntidade?.esferaId,20)||null,Number.isFinite(estimated)?estimated:null,pub,validDate(closingOf(x)),pncpUrl(x)||null,originUrl(x)||null,JSON.stringify(x),detected];
}
async function persist(items,{historical=false}={}){
  if(!items?.length||!pool)return [];
  const ids=items.map(resultKey).filter(Boolean);const knownResult=await pool.query('SELECT pncp_id FROM monitored_procurements WHERE pncp_id=ANY($1::text[])',[ids]);const known=new Set(knownResult.rows.map(r=>r.pncp_id)),fresh=[];
  const client=await pool.connect();
  try{await client.query('BEGIN');for(const x of items){const k=resultKey(x);if(!k)continue;const v=values(x,historical);await client.query(`INSERT INTO monitored_procurements(pncp_id,org_cnpj,year,sequence,modality_code,modality_name,object_text,org_name,unit_name,municipality,uf,power_id,sphere_id,estimated_value,published_at,closes_at,pncp_url,origin_url,raw,detected_at,last_seen_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,NOW()) ON CONFLICT(pncp_id) DO UPDATE SET org_cnpj=EXCLUDED.org_cnpj,year=EXCLUDED.year,sequence=EXCLUDED.sequence,modality_code=EXCLUDED.modality_code,modality_name=EXCLUDED.modality_name,object_text=EXCLUDED.object_text,org_name=EXCLUDED.org_name,unit_name=EXCLUDED.unit_name,municipality=EXCLUDED.municipality,uf=EXCLUDED.uf,power_id=EXCLUDED.power_id,sphere_id=EXCLUDED.sphere_id,estimated_value=EXCLUDED.estimated_value,published_at=EXCLUDED.published_at,closes_at=EXCLUDED.closes_at,pncp_url=EXCLUDED.pncp_url,origin_url=EXCLUDED.origin_url,raw=EXCLUDED.raw,last_seen_at=NOW()`,v);if(!known.has(k))fresh.push(decorate(x,v[19]))}await client.query('COMMIT')}catch(e){try{await client.query('ROLLBACK')}catch{}throw e}finally{client.release()}
  totalStored+=fresh.length;return fresh;
}
async function latest(limit=60){const n=Math.min(Math.max(Number(limit)||60,1),100);if(!pool)return[];const r=await pool.query('SELECT raw,detected_at,pncp_url,origin_url FROM monitored_procurements ORDER BY detected_at DESC,pncp_id DESC LIMIT $1',[n]);return r.rows.map(row=>({...row.raw,_detectedAt:new Date(row.detected_at).toISOString(),_pncpUrl:row.pncp_url||pncpUrl(row.raw||{}),_originUrl:row.origin_url||originUrl(row.raw||{}),_liveMonitor:true}))}
function status(){return {enabled:true,version:'5.2',source:'PNCP',storage:pool?'postgresql':'unavailable',interval_seconds:90,running,baseline_completed:!firstScan,last_scan_at:lastScanAt,last_success_at:lastSuccessAt,last_detected_at:lastDetectedAt,last_new_count:lastNewCount,total_stored:totalStored,subscribers:subscribers.size,consecutive_failures:consecutiveFailures,last_error:lastError,live:{modalities_per_cycle:14,page_budget:1,workers:WORKERS,timeout_seconds:REQUEST_TIMEOUT_MS/1000}}}
function broadcast(event,data){const packet=`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;for(const res of [...subscribers]){try{res.write(packet)}catch{subscribers.delete(res)}}}
function schedule(startedAt=Date.now()){if(timer)clearTimeout(timer);const elapsed=Date.now()-startedAt;timer=setTimeout(scan,Math.max(5_000,CYCLE_MS-elapsed));timer.unref?.()}

async function scan(){
  if(running)return;const startedAt=Date.now();running=true;lastScanAt=new Date().toISOString();
  try{await initStorage();const result=await collectSnapshot();if(result.successfulModalities===0)throw new Error('PNCP indisponível em todas as modalidades neste ciclo');const warmup=firstScan,fresh=await persist(result.items,{historical:warmup});lastSuccessAt=new Date().toISOString();consecutiveFailures=0;lastError=result.errors.length?`${result.errors.length} modalidade(s) indisponíveis neste ciclo`:null;lastNewCount=warmup?0:fresh.length;if(warmup)firstScan=false;if(!warmup&&fresh.length){lastDetectedAt=new Date().toISOString();console.log(`live monitor v5 detected ${fresh.length} new procurement(s)`);broadcast('procurement',{items:fresh.slice(0,100),detected_at:lastDetectedAt})}console.log(`live monitor v5 cycle: modalities=${result.successfulModalities}/14 scanned=${result.items.length} new=${lastNewCount} errors=${result.errors.length} duration_ms=${Date.now()-startedAt}`);broadcast('status',status())}
  catch(e){consecutiveFailures++;lastError=clean(e?.message||'falha no monitor',500);console.warn('live monitor v5 cycle deferred:',lastError);broadcast('status',status())}
  finally{running=false;schedule(startedAt)}
}

export async function initLiveMonitor(){await initStorage();if(!timer&&!running){timer=setTimeout(scan,5_000);timer.unref?.()}}
function common(res,type='application/json; charset=utf-8'){res.setHeader('Content-Type',type);res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin')}
export async function handleLiveRoute(req,res,url){
  if(req.method==='GET'&&url.pathname==='/api/live-feed'){common(res);res.statusCode=200;res.end(JSON.stringify({source:'PNCP-live-monitor-v5',items:await latest(url.searchParams.get('limit')||60),status:status(),fetched_at:new Date().toISOString()}));return true}
  if(req.method==='GET'&&url.pathname==='/api/live-status'){common(res);res.statusCode=200;res.end(JSON.stringify({status:status()}));return true}
  if(req.method==='GET'&&url.pathname==='/api/live-events'){common(res,'text/event-stream; charset=utf-8');res.setHeader('Connection','keep-alive');res.setHeader('X-Accel-Buffering','no');res.statusCode=200;res.flushHeaders?.();subscribers.add(res);res.write(`retry: 6000\nevent: status\ndata: ${JSON.stringify(status())}\n\n`);const hb=setInterval(()=>{try{res.write(`: heartbeat ${Date.now()}\n\n`)}catch{clearInterval(hb);subscribers.delete(res)}},20_000);hb.unref?.();req.on('close',()=>{clearInterval(hb);subscribers.delete(res)});return true}
  return false;
}
