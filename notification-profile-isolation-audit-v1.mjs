import { Pool } from 'pg';

const DATABASE_URL=process.env.DATABASE_URL||'';
const pool=DATABASE_URL?new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:1,idleTimeoutMillis:15000}):null;

export async function runNotificationProfileIsolationAudit(){
  if(!pool){console.log('notification profile isolation audit: no database');return null}
  try{
    const [summary,dupEmail,dupWhatsapp,orphans]=await Promise.all([
      pool.query(`SELECT COUNT(*)::int profiles,COUNT(*) FILTER(WHERE email IS NOT NULL)::int with_email,COUNT(*) FILTER(WHERE email_verified_at IS NOT NULL)::int verified_email,COUNT(*) FILTER(WHERE whatsapp_e164 IS NOT NULL)::int with_whatsapp FROM notification_profiles`),
      pool.query(`SELECT COUNT(*)::int groups,COALESCE(SUM(n),0)::int rows FROM (SELECT LOWER(TRIM(email)) email_key,COUNT(DISTINCT user_id)::int n FROM notification_profiles WHERE NULLIF(TRIM(email),'') IS NOT NULL GROUP BY LOWER(TRIM(email)) HAVING COUNT(DISTINCT user_id)>1) d`),
      pool.query(`SELECT COUNT(*)::int groups,COALESCE(SUM(n),0)::int rows FROM (SELECT whatsapp_e164,COUNT(DISTINCT user_id)::int n FROM notification_profiles WHERE NULLIF(TRIM(whatsapp_e164),'') IS NOT NULL GROUP BY whatsapp_e164 HAVING COUNT(DISTINCT user_id)>1) d`),
      pool.query(`SELECT COUNT(*)::int n FROM notification_profiles p LEFT JOIN users u ON u.id=p.user_id WHERE u.id IS NULL`)
    ]);
    const s=summary.rows[0]||{},de=dupEmail.rows[0]||{},dw=dupWhatsapp.rows[0]||{},o=orphans.rows[0]||{};
    const result={profiles:Number(s.profiles||0),with_email:Number(s.with_email||0),verified_email:Number(s.verified_email||0),with_whatsapp:Number(s.with_whatsapp||0),duplicate_email_groups:Number(de.groups||0),duplicate_email_rows:Number(de.rows||0),duplicate_whatsapp_groups:Number(dw.groups||0),duplicate_whatsapp_rows:Number(dw.rows||0),orphan_profiles:Number(o.n||0)};
    console.log('notification profile isolation audit:',JSON.stringify(result));
    return result;
  }catch(e){console.error('notification profile isolation audit error:',e?.message||e);return null}
  finally{try{await pool.end()}catch{}}
}
