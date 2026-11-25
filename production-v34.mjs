import http from 'node:http';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { detectDatabaseProvider } from './database-provider-v1.mjs';

const nativeCreateServer=http.createServer.bind(http);
const databaseProvider=detectDatabaseProvider(process.env.DATABASE_URL||'');
const publicAssets=new Map([
 ['/assets/market-archive-v1.js',['market-archive-v1.js','application/javascript; charset=utf-8']],
 ['/assets/pulse-business-v1.js',['pulse-business-v1.js','application/javascript; charset=utf-8']],
 ['/assets/pulse-business-v1.css',['pulse-business-v1.css','text/css; charset=utf-8']],
 ['/manifest.webmanifest',['pulse-manifest.json','application/manifest+json; charset=utf-8']],
 ['/assets/pulse-app-icon.svg',['rlb-brand-icon-v1.svg','image/svg+xml']]
].map(([path,[file,type]])=>[path,{type,body:fs.readFileSync(new URL('./'+file,import.meta.url))}]));

http.createServer=function databaseProviderDiagnosticCreateServer(...args){
  const i=args.findIndex(x=>typeof x==='function');
  if(i<0)return nativeCreateServer(...args);
  const listener=args[i];
  args[i]=async(req,res)=>{
    try{
      const url=new URL(req.url||'/','http://localhost');
      if(req.method==='GET'&&publicAssets.has(url.pathname)){const asset=publicAssets.get(url.pathname);res.statusCode=200;res.setHeader('Content-Type',asset.type);res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','public, max-age=300');res.end(asset.body);return}
      if(req.method==='GET'&&url.pathname==='/api/health'){
        const nativeEnd=res.end.bind(res);
        res.end=(body,...endArgs)=>{
          try{
            const text=Buffer.isBuffer(body)?body.toString('utf8'):String(body??'');
            const payload=JSON.parse(text);
            if(payload&&typeof payload==='object'){
              payload.database_provider=databaseProvider;
              return nativeEnd(JSON.stringify(payload),...endArgs);
            }
          }catch{}
          return nativeEnd(body,...endArgs);
        };
      }
    }catch(error){
      console.error('database provider diagnostic middleware:',error?.message||error);
    }
    return listener(req,res);
  };
  return nativeCreateServer(...args);
};

syncBuiltinESMExports();
await import('./production-v33.mjs');
console.log('database provider diagnostic v1 active; provider is reported without exposing connection details');
