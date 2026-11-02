import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { Pool } from 'pg';
import { initUserDashboard,handleUserDashboardRoute } from './user-dashboard-v1.mjs';

const DATABASE_URL=String(process.env.DATABASE_URL||'');
const healthPool=DATABASE_URL?new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:1,idleTimeoutMillis:10000,connectionTimeoutMillis:5000}):null;
healthPool?.on('error',error=>console.warn('runtime database health pool:',error?.code||error?.message||error));

const nativeCreateServer=http.createServer.bind(http);
const nativeFetch=globalThis.fetch.bind(globalThis);
const PNCP_RETRYABLE=new Set([408,425,429,500,502,503,504]);
const PNCP_MAX_ATTEMPTS=3;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function requestUrl(input){try{return typeof input==='string'?input:input instanceof URL?input.href:input?.url||String(input)}catch{return''}}
function requestMethod(input,init){return String(init?.method||input?.method||'GET').toUpperCase()}
function retryAfterMs(response,attempt){
  const raw=String(response?.headers?.get?.('retry-after')||'').trim();
  if(raw){
    const seconds=Number(raw);if(Number.isFinite(seconds)&&seconds>=0)return Math.min(seconds*1000,5000);
    const at=Date.parse(raw);if(Number.isFinite(at))return Math.min(Math.max(at-Date.now(),0),5000);
  }
  return Math.min(5000,350*(2**attempt)+Math.floor(Math.random()*180));
}
function isPncpDocumentRequest(url,method){
  if(method!=='GET')return false;
  try{const u=new URL(url);return u.hostname==='pncp.gov.br'&&u.pathname.startsWith('/api/pncp/')&&u.pathname.includes('/arquivos')}catch{return false}
}

globalThis.fetch=async function rlbResilientFetch(input,init={}){
  const url=requestUrl(input),method=requestMethod(input,init);
  if(!isPncpDocumentRequest(url,method))return nativeFetch(input,init);
  let lastError=null;
  for(let attempt=0;attempt<PNCP_MAX_ATTEMPTS;attempt++){
    try{
      const response=await nativeFetch(input,{...init,signal:AbortSignal.timeout(22000)});
      if(!PNCP_RETRYABLE.has(response.status)||attempt===PNCP_MAX_ATTEMPTS-1)return response;
      console.warn(`pncp document retry: status=${response.status} attempt=${attempt+1}/${PNCP_MAX_ATTEMPTS}`);
      await sleep(retryAfterMs(response,attempt));
    }catch(error){
      lastError=error;
      if(attempt===PNCP_MAX_ATTEMPTS-1)throw error;
      console.warn(`pncp document retry: network=${String(error?.name||'error')} attempt=${attempt+1}/${PNCP_MAX_ATTEMPTS}`);
      await sleep(Math.min(5000,350*(2**attempt)+Math.floor(Math.random()*180)));
    }
  }
  throw lastError||new Error('PNCP document request failed');
};

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
        return healthResponse(res,database.ok?200:503,{ok:database.ok,version:'2.17.0-audit',storage:database.ok?'postgresql':'postgresql-unavailable',runtime:'production-v31',database});
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
console.log('runtime audit hardening ready: live PostgreSQL health probe + resilient PNCP document fetch');
console.log('user dashboard backend preserved: Dashboard and Minha Operação UI disabled');
