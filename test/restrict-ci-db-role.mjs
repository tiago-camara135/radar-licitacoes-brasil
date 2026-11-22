import assert from 'node:assert/strict';
import { Pool } from 'pg';

const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:false,max:1});
const adminPassword='ci-only-temporary-superuser-password';
let adminPool;
try{
  const before=await pool.query("SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname=current_user");
  assert.equal(before.rowCount,1);
  await pool.query(`CREATE ROLE radar_ci_admin WITH LOGIN SUPERUSER PASSWORD '${adminPassword}'`);
  const adminUrl=new URL(process.env.DATABASE_URL);
  adminUrl.username='radar_ci_admin';
  adminUrl.password=adminPassword;
  adminPool=new Pool({connectionString:adminUrl.toString(),ssl:false,max:1});
  await adminPool.query("ALTER ROLE radar NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS");
  const after=await pool.query("SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname=current_user");
  assert.deepEqual(after.rows[0],{rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false,rolbypassrls:false});
  console.log('CI database role restricted: no superuser, createdb, createrole, replication or bypassrls');
}finally{
  await adminPool?.end();
  await pool.end();
}
