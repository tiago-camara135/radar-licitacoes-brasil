import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { initAccountRecoveryEmailV2,handleAccountRecoveryEmailV2Route } from './account-recovery-email-v2.mjs';

const nativeCreateServer=http.createServer.bind(http);

http.createServer=function accountRecoveryEmailV2CreateServer(...args){
  const listenerIndex=args.findIndex(x=>typeof x==='function');
  if(listenerIndex<0)return nativeCreateServer(...args);
  const listener=args[listenerIndex];
  args[listenerIndex]=async(req,res)=>{
    try{
      const url=new URL(req.url||'/','http://localhost');
      if(await handleAccountRecoveryEmailV2Route(req,res,url))return;
    }catch(error){
      console.error('account recovery email v2 middleware error:',error?.stack||error);
      if(!res.headersSent){res.statusCode=500;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({error:'Erro interno na recuperação de conta.'}))}else try{res.end()}catch{}
      return;
    }
    return listener(req,res);
  };
  return nativeCreateServer(...args);
};

syncBuiltinESMExports();
await import('./production-v26.mjs');
await initAccountRecoveryEmailV2();
console.log('account recovery email hotfix v2 active: self-service supports user + admin with Resend delivery telemetry');
