import fs from 'node:fs';
import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';

const nativeReadFileSync=fs.readFileSync.bind(fs);
const nativeCreateServer=http.createServer.bind(http);
const habilitationBadgeJsText=nativeReadFileSync(new URL('./habilitation-badge-v2.js',import.meta.url),'utf8');
const habilitationBadgeJs=Buffer.from(habilitationBadgeJsText);

fs.readFileSync=function habilitationBadgeReadFileSync(path,...args){
  const value=path instanceof URL?path.pathname:String(path);
  const data=nativeReadFileSync(path,...args);
  if(value.endsWith('/app-v2.js')||value.endsWith('\\app-v2.js')){
    const source=Buffer.isBuffer(data)?data.toString('utf8'):String(data);
    const finalJs=source+'\n\n'+habilitationBadgeJsText;
    return Buffer.isBuffer(data)?Buffer.from(finalJs):finalJs;
  }
  return data;
};

http.createServer=function habilitationBadgeAssetsCreateServer(...args){
  const listenerIndex=args.findIndex(x=>typeof x==='function');
  if(listenerIndex<0)return nativeCreateServer(...args);
  const listener=args[listenerIndex];
  args[listenerIndex]=async(req,res)=>{
    try{
      const url=new URL(req.url||'/','http://localhost');
      if(req.method==='GET'&&url.pathname==='/assets/habilitation-badge-v2.js'){
        res.statusCode=200;
        res.setHeader('Content-Type','application/javascript; charset=utf-8');
        res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
        res.setHeader('X-RLB-UI-Build','2.8.2');
        return res.end(habilitationBadgeJs);
      }
      if(req.method==='GET'&&url.pathname==='/api/ui-build'){
        res.statusCode=200;
        res.setHeader('Content-Type','application/json; charset=utf-8');
        res.setHeader('Cache-Control','no-store');
        return res.end(JSON.stringify({ok:true,frontend:'2.8.2',search_results:'v2-direct-assets',habilitation_badge:'v2-login-refresh'}));
      }
    }catch(error){
      console.error('habilitation badge assets middleware:',error?.message||error);
    }
    return listener(req,res);
  };
  return nativeCreateServer(...args);
};

syncBuiltinESMExports();
await import('./production-v17.mjs');
console.log('habilitation badge v2 ready: lightweight summary refresh on authenticated entry');
