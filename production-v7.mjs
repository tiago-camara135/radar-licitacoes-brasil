import fs from 'node:fs';
import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { handleTenderReadinessQuickRoute } from './tender-readiness-quick-v1.mjs';

const nativeReadFileSync=fs.readFileSync.bind(fs);
const nativeCreateServer=http.createServer.bind(http);
const quickJs=nativeReadFileSync(new URL('./tender-readiness-quick-v1.js',import.meta.url),'utf8');
const quickCss=nativeReadFileSync(new URL('./tender-readiness-quick-v1.css',import.meta.url),'utf8');
const legacyMarker="\n\n(()=>{\n'use strict';\nconst CHECK_MS=5*60*1000;";

fs.readFileSync=function quickReadinessReadFileSync(path,...args){
  const value=path instanceof URL?path.pathname:String(path);
  const data=nativeReadFileSync(path,...args);
  if(value.endsWith('/app-v2.js')||value.endsWith('\\app-v2.js')){
    const source=Buffer.isBuffer(data)?data.toString('utf8'):String(data);
    const index=source.indexOf(legacyMarker);
    const finalJs=index>=0?source.slice(0,index)+'\n\n'+quickJs+source.slice(index):source+'\n\n'+quickJs;
    return Buffer.isBuffer(data)?Buffer.from(finalJs):finalJs;
  }
  if(value.endsWith('/app-v2.css')||value.endsWith('\\app-v2.css')){
    const source=Buffer.isBuffer(data)?data.toString('utf8'):String(data);
    const finalCss=source+'\n\n'+quickCss;
    return Buffer.isBuffer(data)?Buffer.from(finalCss):finalCss;
  }
  return data;
};

http.createServer=function quickReadinessCreateServer(...args){
  const listenerIndex=args.findIndex(x=>typeof x==='function');
  if(listenerIndex<0)return nativeCreateServer(...args);
  const listener=args[listenerIndex];
  args[listenerIndex]=async(req,res)=>{
    try{
      const url=new URL(req.url||'/','http://localhost');
      if(await handleTenderReadinessQuickRoute(req,res,url))return;
    }catch(error){
      console.error('quick readiness middleware error:',error?.stack||error);
      if(!res.headersSent){res.statusCode=500;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({error:'Erro interno na prontidão rápida.'}))}else try{res.end()}catch{}
      return;
    }
    return listener(req,res);
  };
  return nativeCreateServer(...args);
};

syncBuiltinESMExports();
await import('./production-v6.mjs');
console.log('quick readiness ready: automatic opportunity card scoring enabled');
