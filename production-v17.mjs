import fs from 'node:fs';
import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';

const nativeCreateServer=http.createServer.bind(http);
const searchJs=fs.readFileSync(new URL('./search-results-v2.js',import.meta.url));
const searchCss=fs.readFileSync(new URL('./search-results-v2.css',import.meta.url));

http.createServer=function directSearchAssetsCreateServer(...args){
  const listenerIndex=args.findIndex(x=>typeof x==='function');
  if(listenerIndex<0)return nativeCreateServer(...args);
  const listener=args[listenerIndex];
  args[listenerIndex]=async(req,res)=>{
    try{
      const url=new URL(req.url||'/','http://localhost');
      if(req.method==='GET'&&url.pathname==='/assets/search-results-v2.js'){
        res.statusCode=200;
        res.setHeader('Content-Type','application/javascript; charset=utf-8');
        res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
        res.setHeader('X-RLB-UI-Build','2.8.1');
        return res.end(searchJs);
      }
      if(req.method==='GET'&&url.pathname==='/assets/search-results-v2.css'){
        res.statusCode=200;
        res.setHeader('Content-Type','text/css; charset=utf-8');
        res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
        res.setHeader('X-RLB-UI-Build','2.8.1');
        return res.end(searchCss);
      }
      if(req.method==='GET'&&url.pathname==='/api/ui-build'){
        res.statusCode=200;
        res.setHeader('Content-Type','application/json; charset=utf-8');
        res.setHeader('Cache-Control','no-store');
        return res.end(JSON.stringify({ok:true,frontend:'2.8.1',search_results:'v2-direct-assets'}));
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
console.log('RLB direct frontend assets ready: search-results-v2 build 2.8.1');
