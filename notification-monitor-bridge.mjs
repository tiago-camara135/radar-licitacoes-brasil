import { Pool } from 'pg';
import { processProcurementNotifications } from './notifications-v1.mjs';

const DATABASE_URL = process.env.DATABASE_URL || '';
const INTERVAL_MS = 10_000;
const pool = DATABASE_URL ? new Pool({ connectionString:DATABASE_URL, ssl:{rejectUnauthorized:false}, max:1, idleTimeoutMillis:30_000 }) : null;
let timer=null;
let running=false;
let ready=false;

async function initState(){
  if(!pool||ready)return;
  await pool.query(`CREATE TABLE IF NOT EXISTS notification_monitor_state(
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK(id=1),
    last_detected_at TIMESTAMPTZ,
    last_pncp_id TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  const state=await pool.query('SELECT id FROM notification_monitor_state WHERE id=1');
  if(!state.rows[0]){
    let latest=null;
    try{const r=await pool.query('SELECT pncp_id,detected_at FROM monitored_procurements ORDER BY detected_at DESC,pncp_id DESC LIMIT 1');latest=r.rows[0]||null}catch{}
    await pool.query('INSERT INTO notification_monitor_state(id,last_detected_at,last_pncp_id) VALUES(1,$1,$2)',[latest?.detected_at||new Date(),latest?.pncp_id||'']);
  }
  ready=true;
  console.log('notification bridge ready: monitoring new procurement rows');
}

async function scan(){
  if(!pool||running)return;
  running=true;
  try{
    await initState();
    const s=await pool.query('SELECT last_detected_at,last_pncp_id FROM notification_monitor_state WHERE id=1');
    const last=s.rows[0]||{};
    const r=await pool.query(`SELECT pncp_id,raw,detected_at FROM monitored_procurements
      WHERE detected_at>$1 OR (detected_at=$1 AND pncp_id>$2)
      ORDER BY detected_at ASC,pncp_id ASC LIMIT 100`,[last.last_detected_at||new Date(0),last.last_pncp_id||'']);
    if(r.rows.length){
      const items=r.rows.map(x=>({...x.raw,_detectedAt:new Date(x.detected_at).toISOString()}));
      await processProcurementNotifications(items);
      const tail=r.rows[r.rows.length-1];
      await pool.query('UPDATE notification_monitor_state SET last_detected_at=$2,last_pncp_id=$3,updated_at=NOW() WHERE id=$1',[1,tail.detected_at,tail.pncp_id]);
    }
  }catch(e){console.error('notification bridge error:',e?.message||e)}
  finally{running=false;schedule()}
}
function schedule(){if(timer)clearTimeout(timer);timer=setTimeout(scan,INTERVAL_MS);timer.unref?.()}
export async function initNotificationMonitorBridge(){if(!pool){console.log('notification bridge disabled: no database');return}await initState();schedule()}
