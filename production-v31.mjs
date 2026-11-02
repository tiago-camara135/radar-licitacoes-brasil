import fs from 'node:fs';
import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';

const nativeCreateServer=http.createServer.bind(http);
const stabilityJs=fs.readFileSync(new URL('./stability-ui-v1.js',import.meta.url));
const dashboardJs=fs.readFileSync(new URL('./user-dashboard-v2.js',import.meta.url));
const operationPipelineJs=fs.readFileSync(new URL('./user-operation-pipeline-v1.js',import.meta.url));
const dashboardCss=fs.readFileSync(new URL('./user-dashboard-v2.css',import.meta.url));
const operationPipelineCss=fs.readFileSync(new URL('./user-operation-pipeline-v1.css',import.meta.url));
const combinedStabilityJs=Buffer.concat([stabilityJs,Buffer.from('\n\n'),dashboardJs,Buffer.from('\n\n'),operationPipelineJs]);
const combinedDashboardCss=Buffer.concat([dashboardCss,Buffer.from('\n\n'),operationPipelineCss]);
new Function(combinedStabilityJs.toString('utf8'));

function asset(res,type,body){res.statusCode=200;res.setHeader('Content-Type',type);res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-RLB-User-Dashboard','v2');res.end(body)}

http.createServer=function userDashboardV2CreateServer(...args){
  const listenerIndex=args.findIndex(x=>typeof x==='function');
  if(listenerIndex<0)return nativeCreateServer(...args);
  const listener=args[listenerIndex];
  args[listenerIndex]=async(req,res)=>{
    try{
      const url=new URL(req.url||'/','http://localhost');
      if(req.method==='GET'&&url.pathname==='/assets/stability-ui-v1.js')return asset(res,'application/javascript; charset=utf-8',combinedStabilityJs);
      if(req.method==='GET'&&url.pathname==='/assets/user-dashboard-v2.css')return asset(res,'text/css; charset=utf-8',combinedDashboardCss);
    }catch(error){
      console.error('user dashboard v2 middleware error:',error?.stack||error);
      if(!res.headersSent){res.statusCode=500;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({error:'Erro interno no dashboard.'}))}else try{res.end()}catch{}
      return;
    }
    return listener(req,res);
  };
  return nativeCreateServer(...args);
};

syncBuiltinESMExports();
await import('./production-v30.mjs');
console.log('user dashboard v2 frontend ready: cleaner dashboard + full interactive operation pipeline');
