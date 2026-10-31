import fs from 'node:fs';
import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';

const nativeCreateServer=http.createServer.bind(http);
const corporateJs=fs.readFileSync(new URL('./corporate-ui-v3.js',import.meta.url));
const corporateCss=fs.readFileSync(new URL('./corporate-ui-v3.css',import.meta.url));

/* Falha cedo caso o script visual tenha erro de sintaxe. */
new Function(corporateJs.toString('utf8'));

http.createServer=function corporateUiCreateServer(...args){
  const listenerIndex=args.findIndex(x=>typeof x==='function');
  if(listenerIndex<0)return nativeCreateServer(...args);
  const listener=args[listenerIndex];
  args[listenerIndex]=async(req,res)=>{
    try{
      const url=new URL(req.url||'/','http://localhost');
      if(req.method==='GET'&&url.pathname==='/assets/corporate-ui-v3.js'){
        res.statusCode=200;
        res.setHeader('Content-Type','application/javascript; charset=utf-8');
        res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
        res.setHeader('X-RLB-UI-Build','3.0.0');
        return res.end(corporateJs);
      }
      if(req.method==='GET'&&url.pathname==='/assets/corporate-ui-v3.css'){
        res.statusCode=200;
        res.setHeader('Content-Type','text/css; charset=utf-8');
        res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
        res.setHeader('X-RLB-UI-Build','3.0.0');
        return res.end(corporateCss);
      }
      if(req.method==='GET'&&url.pathname==='/api/ui-build'){
        res.statusCode=200;
        res.setHeader('Content-Type','application/json; charset=utf-8');
        res.setHeader('Cache-Control','no-store');
        return res.end(JSON.stringify({ok:true,frontend:'3.0.0',visual_system:'corporate-govtech-v3',search_results:'v2-direct-assets',habilitation_badge:'v2-direct-load',admin_user_support:'v1'}));
      }
    }catch(error){
      console.error('corporate UI middleware:',error?.stack||error);
      if(!res.headersSent){
        res.statusCode=500;
        res.setHeader('Content-Type','application/json; charset=utf-8');
        res.setHeader('Cache-Control','no-store');
        return res.end(JSON.stringify({error:'Erro interno na camada visual corporativa.'}));
      }
      try{res.end()}catch{}
      return;
    }
    return listener(req,res);
  };
  return nativeCreateServer(...args);
};

syncBuiltinESMExports();
await import('./production-v19.mjs');
console.log('corporate UI v3 ready: professional GovTech visual layer active');
