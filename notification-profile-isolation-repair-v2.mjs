import { Pool } from 'pg';

const DATABASE_URL=process.env.DATABASE_URL||'';
const pool=DATABASE_URL?new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:1,idleTimeoutMillis:15000}):null;
const key=v=>String(v||'').trim().toLowerCase();

export async function repairNotificationProfileIsolationV2(){
  if(!pool){console.log('notification isolation repair v2: no database');return null}
  let tx=false;
  try{
    const exists=await pool.query(`SELECT to_regclass('public.notification_profiles') AS table_name`);
    if(!exists.rows[0]?.table_name){console.log('notification isolation repair v2: notification_profiles not ready');return null}

    await pool.query('BEGIN');tx=true;

    const unverified=await pool.query(`
      UPDATE notification_profiles
         SET email=NULL, updated_at=NOW()
       WHERE email_verified_at IS NULL
         AND NULLIF(TRIM(email),'') IS NOT NULL
    `);

    const groups=await pool.query(`
      SELECT LOWER(TRIM(email)) AS email_key
        FROM notification_profiles
       WHERE email_verified_at IS NOT NULL
         AND NULLIF(TRIM(email),'') IS NOT NULL
       GROUP BY LOWER(TRIM(email))
      HAVING COUNT(DISTINCT user_id)>1
    `);

    let clearedDuplicates=0;
    let unresolvedGroups=0;
    let ownerByLogin=0;
    let ownerByAdmin=0;

    for(const group of groups.rows){
      const rows=await pool.query(`
        SELECT p.user_id,p.email,p.email_verified_at,u.email AS login_email,u.role
          FROM notification_profiles p
          JOIN users u ON u.id=p.user_id
         WHERE LOWER(TRIM(p.email))=$1
         FOR UPDATE OF p
      `,[group.email_key]);

      let keep=null;
      const loginOwners=rows.rows.filter(r=>key(r.login_email)===group.email_key);
      if(loginOwners.length===1){keep=loginOwners[0];ownerByLogin+=1;}
      else{
        const admins=rows.rows.filter(r=>String(r.role||'').toLowerCase()==='admin');
        if(admins.length===1){keep=admins[0];ownerByAdmin+=1;}
      }

      if(!keep){unresolvedGroups+=1;continue}

      const keepId=String(keep.user_id);
      const removeIds=rows.rows.filter(r=>String(r.user_id)!==keepId).map(r=>String(r.user_id));
      if(!removeIds.length)continue;

      const cleaned=await pool.query(`
        UPDATE notification_profiles
           SET email=NULL,
               email_verified_at=NULL,
               email_enabled=TRUE,
               updated_at=NOW()
         WHERE user_id = ANY($1::bigint[])
      `,[removeIds]);
      clearedDuplicates+=cleaned.rowCount||0;
      await pool.query(`DELETE FROM notification_verifications WHERE channel='email' AND user_id = ANY($1::bigint[])`,[removeIds]);
    }

    await pool.query('COMMIT');tx=false;

    let uniqueGuard='not_created';
    try{
      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_profiles_verified_email_ci
            ON notification_profiles (LOWER(TRIM(email)))
         WHERE email_verified_at IS NOT NULL
           AND NULLIF(TRIM(email),'') IS NOT NULL
      `);
      uniqueGuard='ready';
    }catch(e){
      uniqueGuard='pending';
      console.error('notification isolation unique guard v2:',e?.message||e);
    }

    await pool.query(`
      CREATE OR REPLACE FUNCTION rlb_notification_profile_verified_email_only()
      RETURNS trigger AS $$
      BEGIN
        IF NEW.email_verified_at IS NULL THEN NEW.email := NULL; END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await pool.query('DROP TRIGGER IF EXISTS trg_rlb_notification_profile_verified_email_only ON notification_profiles');
    await pool.query(`
      CREATE TRIGGER trg_rlb_notification_profile_verified_email_only
      BEFORE INSERT OR UPDATE OF email,email_verified_at ON notification_profiles
      FOR EACH ROW EXECUTE FUNCTION rlb_notification_profile_verified_email_only()
    `);

    const audit=await pool.query(`
      SELECT
        COUNT(*)::int AS profiles,
        COUNT(*) FILTER(WHERE email_verified_at IS NOT NULL)::int AS verified_email,
        COUNT(*) FILTER(WHERE email IS NOT NULL AND email_verified_at IS NULL)::int AS unverified_email_rows,
        (SELECT COUNT(*)::int FROM (
           SELECT LOWER(TRIM(email))
             FROM notification_profiles
            WHERE email_verified_at IS NOT NULL AND NULLIF(TRIM(email),'') IS NOT NULL
            GROUP BY LOWER(TRIM(email))
           HAVING COUNT(DISTINCT user_id)>1
         ) x) AS duplicate_verified_email_groups
      FROM notification_profiles
    `);

    const result={
      cleared_unverified:Number(unverified.rowCount||0),
      cleared_duplicates:clearedDuplicates,
      owner_by_login:ownerByLogin,
      owner_by_admin:ownerByAdmin,
      unresolved_groups:unresolvedGroups,
      unique_guard:uniqueGuard,
      ...(audit.rows[0]||{})
    };
    console.log('notification isolation repair v2:',JSON.stringify(result));
    return result;
  }catch(e){
    if(tx){try{await pool.query('ROLLBACK')}catch{}}
    console.error('notification isolation repair v2 error:',e?.message||e);
    return null;
  }finally{
    try{await pool.end()}catch{}
  }
}
