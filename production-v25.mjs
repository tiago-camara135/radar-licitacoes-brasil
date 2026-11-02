import fs from 'node:fs';
import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { initTenderIntelligence, handleTenderIntelligenceRoute } from './tender-intelligence-v1.mjs';

const nativeReadFileSync=fs.readFileSync.bind(fs);
const nativeCreateServer=http.createServer.bind(http);
const tenderAiJs=nativeReadFileSync(new URL('./tender-intelligence-v1.js',import.meta.url),'utf8');
const tenderAiCss=nativeReadFileSync(new URL('./tender-intelligence-v1.css',import.meta.url),'utf8');

new Function(tenderAiJs);

fs.readFileSync=function tenderIntelligenceReadFileSync(path,...args){
  const value=path instanceof URL?path.pathname:String(path);
  const data=nativeReadFileSync(path,...args);
  if(value.endsWith('/app-v2.js')||value.endsWith('\\app-v2.js')){
    const source=Buffer.isBuffer(data)?data.toString('utf8'):String(data);
    const finalJs=source+'\n\n'+tenderAiJs;
    return Buffer.isBuffer(data)?Buffer.from(finalJs):finalJs;
  }
  if(value.endsWith('/app-v2.css')||value.endsWith('\\app-v2.css')){
    const source=Buffer.isBuffer(data)?data.toString('utf8'):String(data);
    const finalCss=source+'\n\n'+tenderAiCss;
    return Buffer.isBuffer(data)?Buffer.from(finalCss):finalCss;
  }
  return data;
};

http.createServer=function tenderIntelligenceCreateServer(...args){
  const listenerIndex=args.findIndex(x=>typeof x==='function');
  if(listenerIndex<0)return nativeCreateServer(...args);
  const listener=args[listenerIndex];
  args[listenerIndex]=async(req,res)=>{
    try{
      const url=new URL(req.url||'/','http://localhost');
      if(await handleTenderIntelligenceRoute(req,res,url))return;
    }catch(error){
      console.error('tender intelligence middleware error:',error?.stack||error);
      if(!res.headersSent){res.statusCode=500;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({error:'Erro interno na Análise Inteligente de Edital.'}))}else try{res.end()}catch{}
      return;
    }
    return listener(req,res);
  };
  return nativeCreateServer(...args);
};

syncBuiltinESMExports();
await import('./production-v24.mjs');
await initTenderIntelligence();
console.log('tender intelligence v1 frontend ready: grounded edital analysis modal active');
