import { Pool } from 'pg';

const DATABASE_URL=process.env.DATABASE_URL||'';
const pool=DATABASE_URL?new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:1,idleTimeoutMillis:30000}):null;

export async function initNotificationPolicyV2(){
  if(!pool)return;
  await pool.query(`
    CREATE OR REPLACE FUNCTION rlb_force_onsite_notification()
    RETURNS trigger AS $$
    BEGIN
      NEW.onsite_enabled := TRUE;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await pool.query('DROP TRIGGER IF EXISTS trg_rlb_force_onsite_notification ON notification_alert_settings');
  await pool.query(`
    CREATE TRIGGER trg_rlb_force_onsite_notification
    BEFORE INSERT OR UPDATE ON notification_alert_settings
    FOR EACH ROW EXECUTE FUNCTION rlb_force_onsite_notification()
  `);
  await pool.query('UPDATE notification_alert_settings SET onsite_enabled=TRUE WHERE onsite_enabled IS DISTINCT FROM TRUE');
  console.log('notification policy v2 ready: onsite delivery enforced');
}
