import assert from 'node:assert/strict';
import { Pool } from 'pg';

const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:false,max:1});
try{
  await pool.query("CREATE ROLE radar_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD 'radar_app_test_password'");
  await pool.query("ALTER DATABASE radar_test OWNER TO radar_app");
  await pool.query("GRANT ALL ON DATABASE radar_test TO radar_app");
  await pool.query("ALTER SCHEMA public OWNER TO radar_app");
  await pool.query("GRANT USAGE, CREATE ON SCHEMA public TO radar_app");
  const role=await pool.query("SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname='radar_app'");
  assert.deepEqual(role.rows[0],{rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false,rolbypassrls:false});
  const db=await pool.query("SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname='radar_test'");
  assert.equal(db.rows[0].owner,'radar_app');
  console.log('CI app role created as database/schema owner without superuser, createdb, createrole, replication or bypassrls');
}finally{
  await pool.end();
}
