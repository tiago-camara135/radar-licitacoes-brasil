import assert from 'node:assert/strict';
import { Pool } from 'pg';

const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:false,max:1});
try{
  const before=await pool.query("SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname=current_user");
  assert.equal(before.rowCount,1);
  await pool.query("ALTER ROLE radar NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS");
  const after=await pool.query("SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname=current_user");
  assert.deepEqual(after.rows[0],{rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false,rolbypassrls:false});
  console.log('CI database role restricted: no superuser, createdb, createrole, replication or bypassrls');
}finally{
  await pool.end();
}
