import fs from 'node:fs';
import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { handleAdminUserSupport } from './admin-user-support-v1.mjs';

const nativeCreateServer=http.createServer.bind(http);
const supportJs=fs.readFileSync(new URL('./admin-user-support-v1.js',import.meta.url));
const supportCss=fs.readFileSync(new URL('./admin-user-support-v1.css',import.meta.url));

http.createServer=function adminUserSupportCreateServer(...args){
  const listenerIndex=args.findIndex(x=>typeof x==='function');
  if(listenerIndex<0)return nativeCreateServer(...args);
  const listener=args[listenerIndex];
  args[listenerIndex]=async(req,res)=>{
    try{
      const url=new URL(req.url||'/','http://localhost');
      if(req.method==='GET'&&url.pathname==='/assets/admin-user-support-v1.js'){
        res.statusCode=200;
        res.setHeader('Content-Type','application/javascript; charset=utf-8');
        res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
        res.setHeader('X-RLB-UI-Build','2.9.0');
        return res.end(supportJs);
      }
      if(req.method==='GET'&&url.pathname==='/assets/admin-user-support-v1.css'){
        res.statusCode=200;
        res.setHeader('Content-Type','text/css; charset=utf-8');
        res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
        res.setHeader('X-RLB-UI-Build','2.9.0');
        return res.end(supportCss);
      }
      if(req.method==='GET'&&url.pathname==='/api/ui-build'){
        res.statusCode=200;
        res.setHeader('Content-Type','application/json; charset=utf-8');
        res.setHeader('Cache-Control','no-store');
        return res.end(JSON.stringify({ok:true,frontend:'2.9.0',search_results:'v2-direct-assets',habilitation_badge:'v2-direct-load',admin_user_support:'v1'}));
      }
      if(await handleAdminUserSupport(req,res,url))return;
    }catch(error){
      console.error('admin user support middleware:',error?.stack||error);
      if(!res.headersSent){
        res.statusCode=500;
        res.setHeader('Content-Type','application/json; charset=utf-8');
        res.setHeader('Cache-Control','no-store');
        return res.end(JSON.stringify({error:'Erro interno na gestão administrativa de usuários.'}));
      }
      try{res.end()}catch{}
      return;
    }
    return listener(req,res);
  };
  return nativeCreateServer(...args);
};

syncBuiltinESMExports();
await import('./production-v18.mjs');
console.log('admin user support v1 ready: account, alerts, habilitation, notifications, sessions and audit');
