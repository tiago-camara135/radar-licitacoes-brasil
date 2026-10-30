import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || '';
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
let timer = null;

async function syncConfiguredAdmin() {
  if (!DATABASE_URL) {
    console.warn('admin self-heal skipped: DATABASE_URL not configured');
    return { ok: false, reason: 'database_not_configured' };
  }
  if (!ADMIN_EMAIL) {
    console.warn('admin self-heal skipped: ADMIN_EMAIL not configured');
    return { ok: false, reason: 'admin_email_not_configured' };
  }

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
    idleTimeoutMillis: 5000
  });

  try {
    const result = await pool.query(
      `UPDATE users
       SET role='admin', active=TRUE
       WHERE LOWER(email)=LOWER($1)
         AND (role <> 'admin' OR active IS DISTINCT FROM TRUE)
       RETURNING id`,
      [ADMIN_EMAIL]
    );

    const exists = await pool.query(
      'SELECT id, role, active FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1',
      [ADMIN_EMAIL]
    );

    if (!exists.rows[0]) {
      console.log('admin self-heal ready: configured administrator has not registered yet');
      return { ok: true, found: false, changed: 0 };
    }

    console.log(`admin self-heal ready: configured administrator verified; changed=${result.rowCount || 0}`);
    return { ok: true, found: true, changed: result.rowCount || 0 };
  } catch (error) {
    console.error('admin self-heal error:', error?.message || error);
    return { ok: false, reason: 'sync_failed' };
  } finally {
    await pool.end().catch(() => {});
  }
}

export async function initAdminSelfHeal() {
  await syncConfiguredAdmin();
  if (!timer) {
    timer = setInterval(() => {
      syncConfiguredAdmin().catch(error => console.error('admin self-heal interval error:', error?.message || error));
    }, 60_000);
    timer.unref?.();
  }
}
