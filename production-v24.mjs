import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';

const nativeCreateServer=http.createServer.bind(http);
const WRITE_METHODS=new Set(['POST','PUT','PATCH','DELETE']);

function normalizeOrigin(value){
  const raw=String(value||'').trim();
  if(!raw)return '';
  try{
    const u=new URL(raw);
    if(!['http:','https:'].includes(u.protocol))return '';
    return `${u.protocol}//${u.host}`;
  }catch{return ''}
}

const configuredRaw=String(process.env.APP_ORIGIN||'').split(',').map(v=>v.trim()).filter(Boolean);
const configuredOrigins=[...new Set(configuredRaw.map(normalizeOrigin).filter(Boolean))];
const primaryConfiguredOrigin=configuredOrigins[0]||'';
/*
 * Módulos legados comparam APP_ORIGIN literalmente. Canonicalizamos antes de
 * importá-los para eliminar diferenças de barra final/case sem relaxar CSRF.
 */
if(primaryConfiguredOrigin)process.env.APP_ORIGIN=primaryConfiguredOrigin;

function requestOrigin(req){
  const host=String(req.headers.host||'').trim();
  const forwarded=String(req.headers['x-forwarded-proto']||'').split(',')[0].trim().toLowerCase();
  const proto=forwarded||((req.socket&&req.socket.encrypted)?'https':'http');
  if(!host||!['http','https'].includes(proto))return '';
  return normalizeOrigin(`${proto}://${host}`);
}

function reject(res){
  res.statusCode=403;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.end(JSON.stringify({error:'Origem não autorizada.',code:'origin_not_authorized'}));
}

function normalizeTrustedBrowserOrigin(req,res){
  const method=String(req.method||'GET').toUpperCase();
  if(!WRITE_METHODS.has(method))return false;
  const rawOrigin=String(req.headers.origin||'').trim();
  /* Clientes não-browser e chamadas internas não enviam Origin; mantemos a
     compatibilidade existente e a autenticação/cookie continua obrigatória. */
  if(!rawOrigin)return false;
  const origin=normalizeOrigin(rawOrigin);
  if(!origin){reject(res);return true}
  const current=requestOrigin(req);
  const trustedByHost=Boolean(current&&origin===current);
  const trustedByConfig=configuredOrigins.includes(origin);
  if(!trustedByHost&&!trustedByConfig){
    console.warn(`origin guard rejected ${method} ${String(req.url||'/').split('?')[0]} origin=${origin} host=${current||'unknown'}`);
    reject(res);return true;
  }
  /* Vários módulos históricos ainda fazem req.headers.origin===APP_ORIGIN.
     Uma requisição genuinamente same-origin no domínio atual é normalizada
     para a origem configurada somente depois de ser validada contra Host. */
  if(primaryConfiguredOrigin)req.headers.origin=primaryConfiguredOrigin;
  return false;
}

http.createServer=function originGuardCreateServer(...args){
  const i=args.findIndex(x=>typeof x==='function');
  if(i<0)return nativeCreateServer(...args);
  const listener=args[i];
  args[i]=(req,res)=>{
    if(req.method==='GET'&&String(req.url||'').split('?')[0]==='/api/security/origin-health'){
      res.statusCode=200;
      res.setHeader('Content-Type','application/json; charset=utf-8');
      res.setHeader('Cache-Control','no-store');
      return res.end(JSON.stringify({ok:true,guard:'v1',configured_origins:configuredOrigins.length,request_origin_detection:'host+forwarded-proto'}));
    }
    if(normalizeTrustedBrowserOrigin(req,res))return;
    return listener(req,res);
  };
  return nativeCreateServer(...args);
};

syncBuiltinESMExports();
await import('./production-v23.mjs');
console.log(`origin guard v1 ready: browser same-origin normalization active; configured=${configuredOrigins.length}`);
