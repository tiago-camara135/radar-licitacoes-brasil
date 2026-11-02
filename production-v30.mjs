import fs from 'node:fs';
import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { initUserDashboard,handleUserDashboardRoute } from './user-dashboard-v1.mjs';

const nativeCreateServer=http.createServer.bind(http);
const stabilityJs=fs.readFileSync(new URL('./stability-ui-v1.js',import.meta.url));
const dashboardJs=fs.readFileSync(new URL('./user-dashboard-v1.js',import.meta.url));
const dashboardCss=fs.readFileSync(new URL('./user-dashboard-v1.css',import.meta.url));
const combinedStabilityJs=Buffer.concat([stabilityJs,Buffer.from('\n\n'),dashboardJs]);
new Function(combinedStabilityJs.toString('utf8'));

function asset(res,type,body){res.statusCode=200;res.setHeader('Content-Type',type);res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-RLB-User-Dashboard','v1');res.end(body)}

http.createServer=function userDashboardCreateServer(...args){
  const listenerIndex=args.findIndex(x=>typeof x==='function');
  if(listenerIndex<0)return nativeCreateServer(...args);
  const listener=args[listenerIndex];
  args[listenerIndex]=async(req,res)=>{
    try{
      const url=new URL(req.url||'/','http://localhost');
      if(req.method==='GET'&&url.pathname==='/assets/stability-ui-v1.js')return asset(res,'application/javascript; charset=utf-8',combinedStabilityJs);
      if(req.method==='GET'&&url.pathname==='/assets/user-dashboard-v1.css')return asset(res,'text/css; charset=utf-8',dashboardCss);
      if(await handleUserDashboardRoute(req,res,url))return;
    }catch(error){
      console.error('user dashboard middleware error:',error?.stack||error);
      if(!res.headersSent){res.statusCode=500;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({error:'Erro interno no dashboard.'}))}else try{res.end()}catch{}
      return;
    }
    return listener(req,res);
  };
  return nativeCreateServer(...args);
};

syncBuiltinESMExports();
await import('./production-v29.mjs');
await initUserDashboard();
console.log('user dashboard v1 frontend ready: personalized KPIs + recommendations + agenda + tracking + IA-RLB history');
