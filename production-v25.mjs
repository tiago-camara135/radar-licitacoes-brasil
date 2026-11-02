import fs from 'node:fs';
import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { initTenderIntelligencePrecision, handleTenderIntelligencePrecisionRoute } from './tender-intelligence-precision-v1.mjs';
import { installGeminiReviewerResilience } from './gemini-reviewer-resilience-v1.mjs';

installGeminiReviewerResilience();

const nativeCreateServer=http.createServer.bind(http);
const sourceJs=fs.readFileSync(new URL('./source-transparency-v1.js',import.meta.url));
const sourceCss=fs.readFileSync(new URL('./source-transparency-v1.css',import.meta.url));
const tenderAiJs=fs.readFileSync(new URL('./tender-intelligence-v2.js',import.meta.url));
const tenderAiCss=fs.readFileSync(new URL('./tender-intelligence-v2.css',import.meta.url));
const combinedSourceJs=Buffer.concat([sourceJs,Buffer.from('\n\n'),tenderAiJs]);
const combinedSourceCss=Buffer.concat([sourceCss,Buffer.from('\n\n'),tenderAiCss]);
const WRITE_METHODS=new Set(['POST','PUT','PATCH','DELETE']);

function normalizeOrigin(value){
  const raw=String(value||'').trim();
  if(!raw)return '';
  try{const u=new URL(raw);if(!['http:','https:'].includes(u.protocol))return'';return `${u.protocol}//${u.host}`}catch{return''}
}
const configuredOrigins=[...new Set(String(process.env.APP_ORIGIN||'').split(',').map(normalizeOrigin).filter(Boolean))];
const primaryConfiguredOrigin=configuredOrigins[0]||'';
function requestOrigin(req){
  const host=String(req.headers.host||'').trim();
  const proto=String(req.headers['x-forwarded-proto']||'').split(',')[0].trim().toLowerCase()||((req.socket&&req.socket.encrypted)?'https':'http');
  return host&&['http','https'].includes(proto)?normalizeOrigin(`${proto}://${host}`):'';
}
function normalizeTenderOrigin(req,res,url){
  if(!url.pathname.startsWith('/api/tender-intelligence')||!WRITE_METHODS.has(String(req.method||'GET').toUpperCase()))return false;
  const raw=String(req.headers.origin||'').trim();
  if(!raw)return false;
  const origin=normalizeOrigin(raw),current=requestOrigin(req);
  if(!origin||(!configuredOrigins.includes(origin)&&origin!==current)){
    res.statusCode=403;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify({error:'Origem não autorizada.',code:'origin_not_authorized'}));return true;
  }
  if(primaryConfiguredOrigin)req.headers.origin=primaryConfiguredOrigin;
  return false;
}

new Function(combinedSourceJs.toString('utf8'));

function asset(res,type,body){
  res.statusCode=200;
  res.setHeader('Content-Type',type);
  res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('X-RLB-Tender-Intelligence','v2.2');
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
      if(normalizeTenderOrigin(req,res,url))return;
      if(await handleTenderIntelligencePrecisionRoute(req,res,url))return;
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
await initTenderIntelligencePrecision();
console.log('tender intelligence v2.2 frontend ready: verified report + PNCP reconciliation + resilient reviewer fallback + adaptive themes');
console.log('tender intelligence origin guard v1 ready: runtime-host/configured-origin normalization active');
