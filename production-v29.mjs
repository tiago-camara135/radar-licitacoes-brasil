import fs from 'node:fs';
import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { initAccountRecoveryAdminHistory,handleAccountRecoveryAdminHistoryRoute } from './account-recovery-admin-history-v1.mjs';

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

http.createServer=function recoveryHistoryCreateServer(...args){
  const listenerIndex=args.findIndex(x=>typeof x==='function');
  if(listenerIndex<0)return nativeCreateServer(...args);
  const listener=args[listenerIndex];
  args[listenerIndex]=async(req,res)=>{
    try{
      const url=new URL(req.url||'/','http://localhost');
      if(req.method==='GET'&&url.pathname==='/assets/admin-user-support-v1.js')return asset(res,'application/javascript; charset=utf-8',combinedAdminJs);
      if(req.method==='GET'&&url.pathname==='/assets/admin-user-support-v1.css')return asset(res,'text/css; charset=utf-8',combinedAdminCss);
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
