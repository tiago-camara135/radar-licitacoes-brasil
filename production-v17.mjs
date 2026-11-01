import fs from 'node:fs';
import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';

const nativeCreateServer=http.createServer.bind(http);
const searchJs=fs.readFileSync(new URL('./search-results-v2.js',import.meta.url));
const searchCss=fs.readFileSync(new URL('./search-results-v2.css',import.meta.url));
const sourceJs=fs.readFileSync(new URL('./source-transparency-v1.js',import.meta.url));
const sourceCss=fs.readFileSync(new URL('./source-transparency-v1.css',import.meta.url));

function asset(res,type,body){
  res.statusCode=200;
  res.setHeader('Content-Type',type);
  res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('X-RLB-UI-Build','2.11.3');
  res.end(body);
}

http.createServer=function directSearchAssetsCreateServer(...args){
  const listenerIndex=args.findIndex(x=>typeof x==='function');
  if(listenerIndex<0)return nativeCreateServer(...args);
  const listener=args[listenerIndex];
  args[listenerIndex]=async(req,res)=>{
    try{
      const url=new URL(req.url||'/','http://localhost');
      if(req.method==='GET'&&url.pathname==='/assets/search-results-v2.js')return asset(res,'application/javascript; charset=utf-8',searchJs);
      if(req.method==='GET'&&url.pathname==='/assets/search-results-v2.css')return asset(res,'text/css; charset=utf-8',searchCss);
      if(req.method==='GET'&&url.pathname==='/assets/source-transparency-v1.js')return asset(res,'application/javascript; charset=utf-8',sourceJs);
      if(req.method==='GET'&&url.pathname==='/assets/source-transparency-v1.css')return asset(res,'text/css; charset=utf-8',sourceCss);
      if(req.method==='GET'&&url.pathname==='/api/ui-build'){
        res.statusCode=200;
        res.setHeader('Content-Type','application/json; charset=utf-8');
        res.setHeader('Cache-Control','no-store');
        return res.end(JSON.stringify({ok:true,frontend:'2.11.3',search_results:'active-local-first',source_transparency:'v1.2'}));
      }
    }catch(error){
      console.error('direct search assets middleware:',error?.message||error);
    }
    return listener(req,res);
  };
  return nativeCreateServer(...args);
};

syncBuiltinESMExports();
await import('./production-v16.mjs');
console.log('RLB direct frontend assets ready: active search + source transparency v1.2 stable actions');
