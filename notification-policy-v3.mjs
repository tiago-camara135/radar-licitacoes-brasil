import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const EMAIL_FROM = process.env.NOTIFICATION_EMAIL_FROM || '';
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || '';
const TWILIO_MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID || '';
const TWILIO_WHATSAPP_CONTENT_SID = process.env.TWILIO_WHATSAPP_CONTENT_SID || '';
const TWILIO_WHATSAPP_VERIFY_CONTENT_SID = process.env.TWILIO_WHATSAPP_VERIFY_CONTENT_SID || '';
const delaySeconds = Math.min(Math.max(Number(process.env.NOTIFICATION_EXTERNAL_DELAY_SECONDS || 45), 15), 300);

const pool = DATABASE_URL ? new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
  idleTimeoutMillis: 30000
}) : null;

function readiness() {
  const senderReady = Boolean(TWILIO_WHATSAPP_FROM || TWILIO_MESSAGING_SERVICE_SID);
  return {
    email: Boolean(RESEND_API_KEY && EMAIL_FROM),
    whatsapp: Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_WHATSAPP_CONTENT_SID && senderReady),
    whatsappVerification: Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_WHATSAPP_VERIFY_CONTENT_SID && senderReady)
  };
}

export async function initNotificationPolicyV3() {
  if (!pool) {
    console.log('notification policy v3 disabled: no database');
    return;
  }

  await pool.query(`
    CREATE OR REPLACE FUNCTION rlb_delay_external_notification()
    RETURNS trigger AS $$
    BEGIN
      IF NEW.channel IN ('email','whatsapp') AND NEW.status = 'queued' THEN
        NEW.available_at := GREATEST(COALESCE(NEW.available_at, NOW()), NOW() + INTERVAL '${delaySeconds} seconds');
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await pool.query('DROP TRIGGER IF EXISTS trg_rlb_delay_external_notification ON notification_deliveries');
  await pool.query(`
    CREATE TRIGGER trg_rlb_delay_external_notification
    BEFORE INSERT ON notification_deliveries
    FOR EACH ROW EXECUTE FUNCTION rlb_delay_external_notification()
  `);

  const recovered = await pool.query(`
    UPDATE notification_deliveries
       SET status='queued',
           available_at=NOW()+INTERVAL '15 seconds',
           error='Envio recuperado automaticamente após reinicialização do serviço.'
     WHERE channel IN ('email','whatsapp')
       AND status='sending'
       AND created_at < NOW()-INTERVAL '5 minutes'
  `);

  const r = readiness();
  console.log(`notification policy v3 ready: Radar-first delay=${delaySeconds}s; recovered=${recovered.rowCount || 0}; email_provider=${r.email ? 'ready' : 'missing'}; whatsapp_provider=${r.whatsapp ? 'ready' : 'missing'}; whatsapp_verification=${r.whatsappVerification ? 'ready' : 'missing'}`);
}
