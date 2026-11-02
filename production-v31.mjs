import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { initUserDashboard,handleUserDashboardRoute } from './user-dashboard-v1.mjs';

const nativeCreateServer=http.createServer.bind(http);

http.createServer=function userDashboardBackendOnlyCreateServer(...args){
  const listenerIndex=args.findIndex(x=>typeof x==='function');
  if(listenerIndex<0)return nativeCreateServer(...args);
  const listener=args[listenerIndex];
  args[listenerIndex]=async(req,res)=>{
    try{
      const url=new URL(req.url||'/','http://localhost');
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
console.log('user dashboard backend preserved: Dashboard and Minha Operação UI disabled');
