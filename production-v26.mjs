import fs from 'node:fs';
import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { initAccountRecovery,handleAccountRecoveryRoute } from './account-recovery-v1.mjs';

const nativeCreateServer=http.createServer.bind(http);
const recoveryJs=fs.readFileSync(new URL('./account-recovery-v1.js',import.meta.url));
const recoveryCss=fs.readFileSync(new URL('./account-recovery-v1.css',import.meta.url));
const adminJs=fs.readFileSync(new URL('./admin-user-support-v1.js',import.meta.url));
const adminCss=fs.readFileSync(new URL('./admin-user-support-v1.css',import.meta.url));
const combinedAdminJs=Buffer.concat([adminJs,Buffer.from('\n\n'),recoveryJs]);
const combinedAdminCss=Buffer.concat([adminCss,Buffer.from('\n\n'),recoveryCss]);
new Function(combinedAdminJs.toString('utf8'));

function asset(res,type,body){res.statusCode=200;res.setHeader('Content-Type',type);res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-RLB-Account-Recovery','v1');res.end(body)}

http.createServer=function accountRecoveryCreateServer(...args){
  const listenerIndex=args.findIndex(x=>typeof x==='function');
  if(listenerIndex<0)return nativeCreateServer(...args);
  const listener=args[listenerIndex];
  args[listenerIndex]=async(req,res)=>{
    try{
      const url=new URL(req.url||'/','http://localhost');
      if(req.method==='GET'&&url.pathname==='/assets/admin-user-support-v1.js')return asset(res,'application/javascript; charset=utf-8',combinedAdminJs);
      if(req.method==='GET'&&url.pathname==='/assets/admin-user-support-v1.css')return asset(res,'text/css; charset=utf-8',combinedAdminCss);
      if(req.method==='GET'&&url.pathname==='/assets/account-recovery-v1.js')return asset(res,'application/javascript; charset=utf-8',recoveryJs);
      if(req.method==='GET'&&url.pathname==='/assets/account-recovery-v1.css')return asset(res,'text/css; charset=utf-8',recoveryCss);
      if(await handleAccountRecoveryRoute(req,res,url))return;
    }catch(error){
      console.error('account recovery middleware error:',error?.stack||error);
      if(!res.headersSent){res.statusCode=500;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({error:'Erro interno na recuperação de conta.'}))}else try{res.end()}catch{}
      return;
    }
    return listener(req,res);
  };
  return nativeCreateServer(...args);
};

syncBuiltinESMExports();
await import('./production-v25.mjs');
await initAccountRecovery();
console.log('account recovery v1 frontend ready: self-service + assisted admin workflow + adaptive themes');
