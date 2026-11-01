import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { runDatabaseMigrationIfRequested } from './database-migration-v1.mjs';

const FREEZE=String(process.env.RLB_MIGRATION_FREEZE||'0')==='1';
const RUN=String(process.env.RLB_MIGRATION_RUN||'0')==='1';
const nativeCreateServer=http.createServer.bind(http);

function frozen(res){res.statusCode=503;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('Retry-After','60');res.end(JSON.stringify({error:'Manutenção rápida de banco em andamento. Tente novamente em instantes.',code:'database_migration_maintenance'}))}

http.createServer=function migrationFreezeCreateServer(...args){
  const i=args.findIndex(x=>typeof x==='function');if(i<0)return nativeCreateServer(...args);
  const listener=args[i];args[i]=(req,res)=>{
    if(FREEZE&&String(req.url||'/').startsWith('/api/')&&['POST','PUT','PATCH','DELETE'].includes(String(req.method||'GET').toUpperCase()))return frozen(res);
    return listener(req,res);
  };
  return nativeCreateServer(...args);
};

syncBuiltinESMExports();
await import('./production-v21.mjs');
console.log(`database migration runtime ready: freeze=${FREEZE?'on':'off'} run=${RUN?'on':'off'}`);
if(RUN){setTimeout(()=>runDatabaseMigrationIfRequested().catch(e=>console.error('database migration runtime:',e?.message||e)),1500).unref?.()}
