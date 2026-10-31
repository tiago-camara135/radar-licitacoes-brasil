import fs from 'node:fs';
import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { initMaturitySuite, handleMaturitySuiteRoute } from './maturity-suite-v1.mjs';

const nativeReadFileSync=fs.readFileSync.bind(fs);
const nativeCreateServer=http.createServer.bind(http);
const maturityJs=nativeReadFileSync(new URL('./maturity-suite-v1.js',import.meta.url),'utf8');
const maturityCss=nativeReadFileSync(new URL('./maturity-suite-v1.css',import.meta.url),'utf8');

fs.readFileSync=function maturityReadFileSync(path,...args){
  const value=path instanceof URL?path.pathname:String(path);
  const data=nativeReadFileSync(path,...args);
  if(value.endsWith('/app-v2.js')||value.endsWith('\\app-v2.js')){
    const source=Buffer.isBuffer(data)?data.toString('utf8'):String(data);
    const finalJs=source+'\n\n'+maturityJs;
    return Buffer.isBuffer(data)?Buffer.from(finalJs):finalJs;
  }
  if(value.endsWith('/app-v2.css')||value.endsWith('\\app-v2.css')){
    const source=Buffer.isBuffer(data)?data.toString('utf8'):String(data);
    const finalCss=source+'\n\n'+maturityCss;
    return Buffer.isBuffer(data)?Buffer.from(finalCss):finalCss;
  }
  return data;
};

http.createServer=function maturityCreateServer(...args){
  const listenerIndex=args.findIndex(x=>typeof x==='function');
  if(listenerIndex<0)return nativeCreateServer(...args);
  const listener=args[listenerIndex];
  args[listenerIndex]=async(req,res)=>{
    try{
      const url=new URL(req.url||'/','http://localhost');
      if(await handleMaturitySuiteRoute(req,res,url))return;
    }catch(error){
      console.error('maturity suite middleware error:',error?.stack||error);
      if(!res.headersSent){res.statusCode=500;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({error:'Erro interno no módulo de maturidade.'}))}else try{res.end()}catch{}
      return;
    }
    return listener(req,res);
  };
  return nativeCreateServer(...args);
};

syncBuiltinESMExports();
await import('./production-v12.mjs');
await initMaturitySuite();
console.log('RLB product maturity suite v1 ready');
