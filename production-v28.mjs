import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { initAccountRecoveryDeliveryV3,handleAccountRecoveryDeliveryV3Route } from './account-recovery-delivery-v3.mjs';

const nativeCreateServer=http.createServer.bind(http);

http.createServer=function accountRecoveryDeliveryV3CreateServer(...args){
  const listenerIndex=args.findIndex(x=>typeof x==='function');
  if(listenerIndex<0)return nativeCreateServer(...args);
  const listener=args[listenerIndex];
  args[listenerIndex]=async(req,res)=>{
    try{
      const url=new URL(req.url||'/','http://localhost');
      if(await handleAccountRecoveryDeliveryV3Route(req,res,url))return;
    }catch(error){
      console.error('account recovery delivery v3 middleware error:',error?.stack||error);
      if(!res.headersSent){res.statusCode=500;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({error:'Erro interno na recuperação de conta.'}))}else try{res.end()}catch{}
      return;
    }
    return listener(req,res);
  };
  return nativeCreateServer(...args);
};

syncBuiltinESMExports();
await import('./production-v27.mjs');
await initAccountRecoveryDeliveryV3();
console.log('account recovery delivery v3 active: correlated requests + verified recipient lookup + Resend last_event diagnostics');
