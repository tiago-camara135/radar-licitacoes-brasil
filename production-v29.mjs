import fs from 'node:fs';
import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { initAccountRecoveryAdminHistory,handleAccountRecoveryAdminHistoryRoute } from './account-recovery-admin-history-v1.mjs';

const APP_ORIGIN=process.env.APP_ORIGIN||'';
const nativeCreateServer=http.createServer.bind(http);
const adminJs=fs.readFileSync(new URL('./admin-user-support-v1.js',import.meta.url));
const recoveryJs=fs.readFileSync(new URL('./account-recovery-v1.js',import.meta.url));
const historyJs=fs.readFileSync(new URL('./account-recovery-admin-history-v1.js',import.meta.url));
const adminCss=fs.readFileSync(new URL('./admin-user-support-v1.css',import.meta.url));
const recoveryCss=fs.readFileSync(new URL('./account-recovery-v1.css',import.meta.url));
const historyCss=fs.readFileSync(new URL('./account-recovery-admin-history-v1.css',import.meta.url));
const combinedAdminJs=Buffer.concat([adminJs,Buffer.from('\n\n'),recoveryJs,Buffer.from('\n\n'),historyJs]);
const combinedAdminCss=Buffer.concat([adminCss,Buffer.from('\n\n'),recoveryCss,Buffer.from('\n\n'),historyCss]);
new Function(combinedAdminJs.toString('utf8'));

function asset(res,type,body){res.statusCode=200;res.setHeader('Content-Type',type);res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-RLB-Account-Recovery','v1');res.setHeader('X-RLB-Recovery-History','v1');res.end(body)}
function requestOrigin(req){const host=String(req.headers.host||'').trim(),proto=String(req.headers['x-forwarded-proto']||'').split(',')[0].trim().toLowerCase()||((req.socket&&req.socket.encrypted)?'https':'http');if(!host||!['http','https'].includes(proto))return'';try{return new URL(`${proto}://${host}`).origin}catch{return''}}
function configuredOrigins(){return [...new Set(String(APP_ORIGIN||'').split(',').map(x=>{try{return new URL(x.trim()).origin}catch{return''}}).filter(Boolean))]}
function trustedOrigin(req){if(!['POST','PUT','PATCH','DELETE'].includes(String(req.method||'').toUpperCase()))return true;const raw=String(req.headers.origin||'').trim();if(!raw)return true;let origin='';try{origin=new URL(raw).origin}catch{return false}return origin===requestOrigin(req)||configuredOrigins().includes(origin)}

http.createServer=function recoveryHistoryCreateServer(...args){
  const listenerIndex=args.findIndex(x=>typeof x==='function');
  if(listenerIndex<0)return nativeCreateServer(...args);
  const listener=args[listenerIndex];
  args[listenerIndex]=async(req,res)=>{
    try{
      const url=new URL(req.url||'/','http://localhost');
      if(req.method==='GET'&&url.pathname==='/assets/admin-user-support-v1.js')return asset(res,'application/javascript; charset=utf-8',combinedAdminJs);
      if(req.method==='GET'&&url.pathname==='/assets/admin-user-support-v1.css')return asset(res,'text/css; charset=utf-8',combinedAdminCss);
      if(url.pathname.startsWith('/api/account-recovery/admin/email-deliveries')&&!trustedOrigin(req)){res.statusCode=403;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({error:'Origem não autorizada.',code:'origin_not_authorized'}));return}
      if(await handleAccountRecoveryAdminHistoryRoute(req,res,url))return;
    }catch(error){
      console.error('account recovery admin history middleware error:',error?.stack||error);
      if(!res.headersSent){res.statusCode=500;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({error:'Erro interno no histórico de recuperação.'}))}else try{res.end()}catch{}
      return;
    }
    return listener(req,res);
  };
  return nativeCreateServer(...args);
};

syncBuiltinESMExports();
await import('./production-v28.mjs');
await initAccountRecoveryAdminHistory();
console.log('account recovery admin history v1 frontend ready: delivery status + audit timeline + adaptive themes');
