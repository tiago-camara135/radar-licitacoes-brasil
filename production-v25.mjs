import fs from 'node:fs';
import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { initTenderIntelligence, handleTenderIntelligenceRoute } from './tender-intelligence-v1.mjs';

const nativeCreateServer=http.createServer.bind(http);
const sourceJs=fs.readFileSync(new URL('./source-transparency-v1.js',import.meta.url));
const sourceCss=fs.readFileSync(new URL('./source-transparency-v1.css',import.meta.url));
const tenderAiJs=fs.readFileSync(new URL('./tender-intelligence-v1.js',import.meta.url));
const tenderAiCss=fs.readFileSync(new URL('./tender-intelligence-v1.css',import.meta.url));
const combinedSourceJs=Buffer.concat([sourceJs,Buffer.from('\n\n'),tenderAiJs]);
const combinedSourceCss=Buffer.concat([sourceCss,Buffer.from('\n\n'),tenderAiCss]);

/* Valida cedo a camada de navegador. A interface é anexada ao asset explícito
   de transparência, já carregado pelo HTML e servido deterministicamente pelo
   runtime. Isso evita reabrir a cadeia histórica de composição do app-v2.js. */
new Function(combinedSourceJs.toString('utf8'));

function asset(res,type,body){
  res.statusCode=200;
  res.setHeader('Content-Type',type);
  res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('X-RLB-Tender-Intelligence','v1');
  res.end(body);
}

http.createServer=function tenderIntelligenceCreateServer(...args){
  const listenerIndex=args.findIndex(x=>typeof x==='function');
  if(listenerIndex<0)return nativeCreateServer(...args);
  const listener=args[listenerIndex];
  args[listenerIndex]=async(req,res)=>{
    try{
      const url=new URL(req.url||'/','http://localhost');
      if(req.method==='GET'&&url.pathname==='/assets/source-transparency-v1.js')return asset(res,'application/javascript; charset=utf-8',combinedSourceJs);
      if(req.method==='GET'&&url.pathname==='/assets/source-transparency-v1.css')return asset(res,'text/css; charset=utf-8',combinedSourceCss);
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
console.log('tender intelligence v1 frontend ready: grounded edital analysis modal active via source transparency asset');
