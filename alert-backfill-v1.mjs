import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { Pool } from 'pg';

const DATABASE_URL=String(process.env.DATABASE_URL||'');
const BACKFILL_LIMIT=Math.min(Math.max(Number(process.env.ALERT_BACKFILL_LIMIT||12),5),50);
const PAGE_SIZE=300;
const MAX_SCAN=9000;
const STARTUP_ALERT_LIMIT=100;
const pool=DATABASE_URL?new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:2,idleTimeoutMillis:30000,connectionTimeoutMillis:5000}):null;
pool?.on('error',error=>console.warn('alert backfill pool:',error?.code||error?.message||error));

const REGIONS={
  NORTE:new Set(['AC','AP','AM','PA','RO','RR','TO']),
  NORDESTE:new Set(['AL','BA','CE','MA','PB','PE','PI','RN','SE']),
  'CENTRO-OESTE':new Set(['DF','GO','MT','MS']),
  SUDESTE:new Set(['ES','MG','RJ','SP']),
  SUL:new Set(['PR','RS','SC'])
};
const pending=new Set();
let hookInstalled=false,startupScheduled=false;

const clean=(v,n=500)=>String(v??'').trim().slice(0,n);
const digits=v=>String(v??'').replace(/\D/g,'');
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const safeUrl=v=>{try{const u=new URL(String(v||''));return /^https?:$/.test(u.protocol)?u.href:''}catch{return''}};
const toIso=v=>{if(!v)return null;const d=v instanceof Date?v:new Date(v);return Number.isNaN(d.getTime())?null:d.toISOString()};
function regionMatches(region,uf){if(!region||region==='ALL')return true;return Boolean(REGIONS[region]?.has(String(uf||'').toUpperCase()))}
function rowIbge(row){const x=row?.raw||{};return digits(x?.unidadeOrgao?.codigoIbge||x?.municipioIbge||x?.codigoMunicipioIbge)}

export function alertBackfillMatches(a,row){
  if(!a||!row)return false;
  const text=norm([row.object_text,row?.raw?.informacaoComplementar,row.org_name,row.unit_name].filter(Boolean).join(' '));
  if(a.keyword&&!text.includes(norm(a.keyword)))return false;
  const uf=clean(row.uf,2).toUpperCase();
  if(a.uf&&String(a.uf).toUpperCase()!==uf)return false;
  if(!regionMatches(a.region||'ALL',uf))return false;
  if(a.municipality&&!norm(row.municipality).includes(norm(a.municipality)))return false;
  if(a.municipality_ibge&&rowIbge(row)!==digits(a.municipality_ibge))return false;
  if(a.modality_code&&Number(a.modality_code)!==Number(row.modality_code))return false;
  if(a.org_name&&!norm([row.org_name,row.unit_name].filter(Boolean).join(' ')).includes(norm(a.org_name)))return false;
  if(a.org_cnpj&&digits(a.org_cnpj)!==digits(row.org_cnpj).slice(0,14))return false;
  const value=Number(row.estimated_value);
  if(a.min_value!==null&&a.min_value!==undefined&&Number.isFinite(value)&&value<Number(a.min_value))return false;
  if(a.max_value!==null&&a.max_value!==undefined&&Number.isFinite(value)&&value>Number(a.max_value))return false;
  return true;
}

export function isAlertMutation(method,pathname){
  const m=String(method||'GET').toUpperCase(),p=String(pathname||'');
  return (m==='POST'&&p==='/api/alerts')||(m==='PATCH'&&/^\/api\/alerts\/\d+$/.test(p));
}

function payloadFor(a,row){
  return {
    alert_name:a.name,
    pncp_id:clean(row.pncp_id,180),
    modality:clean(row.modality_name||row.modality_code||'Não informada',180),
    object:clean(row.object_text||'Objeto não informado',4000),
    org:clean(row.org_name||'Órgão não informado',500),
    municipality:clean(row.municipality,180),
    uf:clean(row.uf,2).toUpperCase(),
    estimated_value:Number.isFinite(Number(row.estimated_value))?Number(row.estimated_value):null,
    published_at:toIso(row.published_at),
    closes_at:toIso(row.closes_at),
    pncp_url:safeUrl(row.pncp_url),
    origin_url:safeUrl(row.origin_url),
    detected_at:toIso(row.detected_at)||new Date().toISOString(),
    source:'alert_backfill_v1'
  };
}

async function loadAlert(alertId){
  const r=await pool.query(`SELECT a.*,u.active,
    COALESCE(s.region,'ALL') AS region,COALESCE(s.onsite_enabled,TRUE) AS onsite_enabled
    FROM saved_alerts a
    JOIN users u ON u.id=a.user_id
    LEFT JOIN notification_alert_settings s ON s.alert_id=a.id
    WHERE a.id=$1 AND a.enabled=TRUE AND u.active=TRUE LIMIT 1`,[alertId]);
  return r.rows[0]||null;
}

function candidateFilter(a){
  const where=[`((closes_at IS NOT NULL AND closes_at>NOW()) OR (closes_at IS NULL AND last_seen_at>=NOW()-INTERVAL '30 days'))`];
  const params=[];
  const add=(sql,value)=>{params.push(value);where.push(sql.replace('?',`$${params.length}`))};
  if(a.uf)add('UPPER(uf)=?',String(a.uf).toUpperCase());
  else if(a.region&&a.region!=='ALL'&&REGIONS[a.region])add('UPPER(uf)=ANY(?::text[])',[...REGIONS[a.region]]);
  if(a.modality_code)add('modality_code=?',Number(a.modality_code));
  if(a.org_cnpj)add(`regexp_replace(COALESCE(org_cnpj,''),'\\D','','g')=?`,digits(a.org_cnpj));
  if(a.min_value!==null&&a.min_value!==undefined)add('(estimated_value IS NULL OR estimated_value>=?)',Number(a.min_value));
  if(a.max_value!==null&&a.max_value!==undefined)add('(estimated_value IS NULL OR estimated_value<=?)',Number(a.max_value));
  return{where,params};
}

async function insertOnsite(a,row){
  const payload=payloadFor(a,row);
  const r=await pool.query(`INSERT INTO notification_deliveries(user_id,alert_id,pncp_id,channel,status,payload,sent_at)
    VALUES($1,$2,$3,'onsite','sent',$4,NOW())
    ON CONFLICT(alert_id,pncp_id,channel) DO NOTHING
    RETURNING id`,[a.user_id,a.id,payload.pncp_id,payload]);
  return Boolean(r.rows[0]);
}

export async function reconcileAlertBackfill(alertId,{reason='mutation',limit=BACKFILL_LIMIT}={}){
  if(!pool)return{ok:false,reason:'no_database',alert_id:Number(alertId)||null,created:0,matched:0,scanned:0};
  const id=Number(alertId);if(!Number.isInteger(id)||id<1)return{ok:false,reason:'invalid_alert_id',alert_id:null,created:0,matched:0,scanned:0};
  const a=await loadAlert(id);
  if(!a||!a.onsite_enabled)return{ok:true,reason:a?'onsite_disabled':'inactive_or_missing',alert_id:id,created:0,matched:0,scanned:0};
  const safeLimit=Math.min(Math.max(Number(limit)||BACKFILL_LIMIT,1),50);
  const base=candidateFilter(a);
  let offset=0,created=0,matched=0,scanned=0;
  while(matched<safeLimit&&scanned<MAX_SCAN){
    const params=[...base.params,PAGE_SIZE,offset],limitPos=base.params.length+1,offsetPos=base.params.length+2;
    const q=await pool.query(`SELECT pncp_id,org_cnpj,modality_code,modality_name,object_text,org_name,unit_name,municipality,uf,estimated_value,published_at,closes_at,pncp_url,origin_url,raw,detected_at,last_seen_at
      FROM monitored_procurements
      WHERE ${base.where.join(' AND ')}
      ORDER BY COALESCE(published_at,detected_at) DESC,detected_at DESC,pncp_id DESC
      LIMIT $${limitPos} OFFSET $${offsetPos}`,params);
    if(!q.rows.length)break;
    scanned+=q.rows.length;offset+=q.rows.length;
    for(const row of q.rows){
      if(!alertBackfillMatches(a,row))continue;
      matched+=1;
      if(await insertOnsite(a,row))created+=1;
      if(matched>=safeLimit)break;
    }
    if(q.rows.length<PAGE_SIZE)break;
  }
  if(created){
    try{await pool.query('INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,$2,$3)',[a.user_id,'alert.backfill',{alert_id:id,reason,created,matched,scanned,limit:safeLimit}])}catch{}
  }
  console.log(`alert backfill v1: alert=${id} reason=${reason} scanned=${scanned} matched=${matched} created=${created} limit=${safeLimit}`);
  return{ok:true,reason,alert_id:id,created,matched,scanned,limit:safeLimit};
}

function scheduleAlertBackfill(alertId,reason){
  const id=Number(alertId);if(!Number.isInteger(id)||id<1||pending.has(id))return;
  pending.add(id);
  const t=setTimeout(async()=>{try{await reconcileAlertBackfill(id,{reason})}catch(error){console.error(`alert backfill v1 alert=${id}:`,error?.code||error?.message||error)}finally{pending.delete(id)}},80);
  t.unref?.();
}

async function reconcileExistingAlerts(){
  if(!pool)return;
  const r=await pool.query(`SELECT a.id FROM saved_alerts a JOIN users u ON u.id=a.user_id WHERE a.enabled=TRUE AND u.active=TRUE ORDER BY a.updated_at DESC,a.id DESC LIMIT $1`,[STARTUP_ALERT_LIMIT]);
  for(const row of r.rows)scheduleAlertBackfill(row.id,'startup');
  console.log(`alert backfill v1 startup: scheduled=${r.rows.length} limit_per_alert=${BACKFILL_LIMIT}`);
}

export function installAlertBackfillHook(){
  if(hookInstalled)return;hookInstalled=true;
  const nativeCreateServer=http.createServer.bind(http);
  http.createServer=function alertBackfillCreateServer(...args){
    const i=args.findIndex(x=>typeof x==='function');if(i<0)return nativeCreateServer(...args);
    const listener=args[i];
    args[i]=(req,res)=>{
      let pathname='/';try{pathname=new URL(req.url||'/','http://localhost').pathname}catch{}
      if(isAlertMutation(req.method,pathname)){
        const originalEnd=res.end.bind(res);let scheduled=false;
        res.end=function alertBackfillEnd(chunk,encoding,callback){
          let alertId=null;
          if(!scheduled&&res.statusCode>=200&&res.statusCode<300){
            try{const body=JSON.parse(Buffer.isBuffer(chunk)?chunk.toString('utf8'):String(chunk||''));alertId=Number(body?.item?.id)||null}catch{}
            if(!alertId&&req.method==='PATCH'){const m=pathname.match(/^\/api\/alerts\/(\d+)$/);alertId=m?Number(m[1]):null}
          }
          const result=originalEnd(chunk,encoding,callback);
          if(alertId&&!scheduled){scheduled=true;scheduleAlertBackfill(alertId,req.method==='POST'?'create':'update')}
          return result;
        };
      }
      return listener(req,res);
    };
    return nativeCreateServer(...args);
  };
  syncBuiltinESMExports();
}

export async function initAlertBackfill(){
  if(!pool){console.log('alert backfill v1 disabled: no database');return}
  if(startupScheduled)return;startupScheduled=true;
  const t=setTimeout(()=>reconcileExistingAlerts().catch(error=>console.error('alert backfill v1 startup:',error?.code||error?.message||error)),1200);
  t.unref?.();
  console.log(`alert backfill v1 ready: create/update reconciliation + startup repair; onsite_limit=${BACKFILL_LIMIT}`);
}
