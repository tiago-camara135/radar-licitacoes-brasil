import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { Pool } from 'pg';
import { initUserDashboard,handleUserDashboardRoute } from './user-dashboard-v1.mjs';
import { installPncpDocumentResilience } from './pncp-document-resilience-v1.mjs';

const DATABASE_URL=String(process.env.DATABASE_URL||'');
const healthPool=DATABASE_URL?new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:1,idleTimeoutMillis:10000,connectionTimeoutMillis:5000}):null;
healthPool?.on('error',error=>console.warn('runtime database health pool:',error?.code||error?.message||error));

installPncpDocumentResilience();

const nativeCreateServer=http.createServer.bind(http);

async function databaseHealth(){
  const started=Date.now();
  if(!healthPool)return{ok:false,latency_ms:0};
  try{
    await healthPool.query('SELECT 1 AS ok');
    return{ok:true,latency_ms:Date.now()-started};
  }catch(error){
    console.error('runtime database health check:',error?.code||error?.message||error);
    return{ok:false,latency_ms:Date.now()-started};
  }
}
function healthResponse(res,status,data){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.end(JSON.stringify(data));
}

http.createServer=function userDashboardBackendOnlyCreateServer(...args){
  const listenerIndex=args.findIndex(x=>typeof x==='function');
  if(listenerIndex<0)return nativeCreateServer(...args);
  const listener=args[listenerIndex];
  args[listenerIndex]=async(req,res)=>{
    try{
      const url=new URL(req.url||'/','http://localhost');
      if(req.method==='GET'&&url.pathname==='/api/health'){
        const database=await databaseHealth();
        return healthResponse(res,database.ok?200:503,{ok:database.ok,version:'2.17.1-pncp-failover',storage:database.ok?'postgresql':'postgresql-unavailable',runtime:'production-v31',database});
      }
      if(await handleUserDashboardRoute(req,res,url))return;
    }catch(error){
      console.error('user dashboard backend middleware error:',error?.stack||error);
      if(!res.headersSent){
        res.statusCode=500;
        res.setHeader('Content-Type','application/json; charset=utf-8');
        res.setHeader('Cache-Control','no-store');
        res.end(JSON.stringify({error:'Erro interno no módulo de acompanhamento.'}));
      }else try{res.end()}catch{}
      return;
    }
    return listener(req,res);
  };
  return nativeCreateServer(...args);
};

syncBuiltinESMExports();
await import('./production-v29.mjs');
await initUserDashboard();
console.log('runtime audit hardening ready: live PostgreSQL health probe + PNCP document gateway/backend failover');
console.log('user dashboard backend preserved: Dashboard and Minha Operação UI disabled');
