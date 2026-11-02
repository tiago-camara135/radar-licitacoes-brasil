import fs from 'node:fs';
import http from 'node:http';
import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { syncBuiltinESMExports } from 'node:module';
import { Pool } from 'pg';
import { initUserDashboard,handleUserDashboardRoute } from './user-dashboard-v1.mjs';
import { createResilientPncpDocumentFetch } from './pncp-document-resilience-v1.mjs';
import { parsePncpDocumentUrl,extractOriginDocumentUrls,decodePdfUpload,isSafePublicOriginUrl } from './tender-source-resilience-v2.mjs';

const PORT=Number(process.env.PORT||10000);
const APP_ORIGIN=String(process.env.APP_ORIGIN||'');
const DATABASE_URL=String(process.env.DATABASE_URL||'');
const MAX_UPLOAD_BYTES=18*1024*1024;
const MAX_UPLOAD_JSON=25*1024*1024;
const UPLOAD_TTL_MS=5*60*1000;
const healthPool=DATABASE_URL?new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:2,idleTimeoutMillis:10000,connectionTimeoutMillis:5000}):null;
healthPool?.on('error',error=>console.warn('runtime database health pool:',error?.code||error?.message||error));

const nativeFetch=globalThis.fetch.bind(globalThis);
const resilientPncpFetch=createResilientPncpDocumentFetch(nativeFetch,{logger:console});
const uploadContext=new AsyncLocalStorage();
const uploadSources=new Map();
const originCache=new Map();
const nativeCreateServer=http.createServer.bind(http);
const sourceJs=fs.readFileSync(new URL('./source-transparency-v1.js',import.meta.url));
const tenderJs=fs.readFileSync(new URL('./tender-intelligence-v2.js',import.meta.url));
const uploadJs=fs.readFileSync(new URL('./tender-intelligence-upload-v1.js',import.meta.url));
const combinedSourceJs=Buffer.concat([sourceJs,Buffer.from('\n\n'),tenderJs,Buffer.from('\n\n'),uploadJs]);
new Function(combinedSourceJs.toString('utf8'));

const clean=(v,n=300)=>String(v??'').trim().slice(0,n);
const digits=v=>String(v??'').replace(/\D/g,'');
function requestUrl(input){try{return typeof input==='string'?input:input instanceof URL?input.href:input?.url||String(input)}catch{return''}}
function cookieHash(req){return crypto.createHash('sha256').update(String(req.headers.cookie||'')).digest('hex')}
function requestOrigin(req){const host=String(req.headers.host||'').trim(),proto=String(req.headers['x-forwarded-proto']||'').split(',')[0].trim().toLowerCase()||((req.socket&&req.socket.encrypted)?'https':'http');if(!host||!['http','https'].includes(proto))return'';try{return new URL(`${proto}://${host}`).origin}catch{return''}}
function configuredOrigins(){return [...new Set(APP_ORIGIN.split(',').map(x=>{try{return new URL(x.trim()).origin}catch{return''}}).filter(Boolean))]}
function trustedOrigin(req){const raw=String(req.headers.origin||'').trim();if(!raw)return true;try{const origin=new URL(raw).origin;return origin===requestOrigin(req)||configuredOrigins().includes(origin)}catch{return false}}
function cleanupUploads(){const now=Date.now();for(const [k,v] of uploadSources)if(v.expiresAt<=now)uploadSources.delete(k);while(uploadSources.size>12)uploadSources.delete(uploadSources.keys().next().value)}
async function readJson(req,max=MAX_UPLOAD_JSON){let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>max)throw Object.assign(new Error('Arquivo acima do limite permitido.'),{status:413});chunks.push(c)}try{return chunks.length?JSON.parse(Buffer.concat(chunks).toString('utf8')):{}}catch{throw Object.assign(new Error('Payload inválido.'),{status:400})}}
function json(res,status,data){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(data))}
function asset(res,type,body){res.statusCode=200;res.setHeader('Content-Type',type);res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-RLB-Tender-Intelligence','v2.2');res.setHeader('X-RLB-Tender-Source-Resilience','v2');res.end(body)}
async function authenticatedUser(req){try{const r=await nativeFetch(`http://127.0.0.1:${PORT}/api/me`,{headers:{cookie:String(req.headers.cookie||'')},signal:AbortSignal.timeout(5000)});if(!r.ok)return null;return(await r.json().catch(()=>({}))).user||null}catch{return null}}

async function databaseHealth(){
  const started=Date.now();
  if(!healthPool)return{ok:false,latency_ms:0};
  try{await healthPool.query('SELECT 1 AS ok');return{ok:true,latency_ms:Date.now()-started}}
  catch(error){console.error('runtime database health check:',error?.code||error?.message||error);return{ok:false,latency_ms:Date.now()-started}}
}
async function discoverOriginDocuments(ids){
  if(!healthPool)return[];
  const cacheKey=`${ids.cnpj}-${ids.year}-${ids.sequence}`,cached=originCache.get(cacheKey);
  if(cached&&cached.expiresAt>Date.now())return cached.docs;
  try{
    const q=await healthPool.query(`SELECT origin_url,raw->>'linkSistemaOrigem' AS link_sistema,raw->>'linkProcessoEletronico' AS link_processo FROM monitored_procurements WHERE org_cnpj=$1 AND year=$2 AND sequence=$3 ORDER BY last_seen_at DESC LIMIT 1`,[ids.cnpj,ids.year,ids.sequence]);
    const row=q.rows[0]||{},origin=[row.origin_url,row.link_sistema,row.link_processo].find(isSafePublicOriginUrl);
    if(!origin){originCache.set(cacheKey,{docs:[],expiresAt:Date.now()+60000});return[]}
    const r=await nativeFetch(origin,{headers:{accept:'text/html,application/xhtml+xml,*/*','user-agent':'RadarLicitacoesBrasil-TenderSource/2.0'},redirect:'follow',signal:AbortSignal.timeout(18000)});
    if(!r.ok){console.warn(`tender source origin: HTTP ${r.status} ${new URL(origin).hostname}`);return[]}
    const len=Number(r.headers.get('content-length')||0);if(len>5*1024*1024)return[];
    const html=(await r.text()).slice(0,5*1024*1024),urls=extractOriginDocumentUrls(html,r.url||origin).slice(0,10);
    const docs=urls.map((url,i)=>({sequencialDocumento:900001+i,url,tipoDocumentoNome:'Edital / documento oficial do portal de origem',titulo:`Documento oficial do portal de origem ${i+1}`,dataPublicacaoPncp:null}));
    originCache.set(cacheKey,{docs,expiresAt:Date.now()+10*60*1000});
    if(docs.length)console.warn(`tender source origin fallback: ${docs.length} arquivo(s) descoberto(s) em ${new URL(origin).hostname}`);
    return docs;
  }catch(error){console.warn('tender source origin fallback:',clean(error?.message,180));return[]}
}

globalThis.fetch=async function rlbTenderSourceFetch(input,init={}){
  const url=requestUrl(input),ctx=uploadContext.getStore(),ids=parsePncpDocumentUrl(url);
  if(ctx&&ids&&ids.cnpj===ctx.cnpj&&ids.year===ctx.year&&ids.sequence===ctx.sequence){
    if(ids.kind==='list')return new Response(JSON.stringify([{sequencialDocumento:990001,url:ctx.pncpUrl,tipoDocumentoNome:'Edital enviado pelo usuário',titulo:ctx.filename,dataPublicacaoPncp:null}]),{status:200,headers:{'content-type':'application/json'}});
    if(ids.kind==='file')return new Response(ctx.buffer,{status:200,headers:{'content-type':'application/pdf','content-length':String(ctx.buffer.length)}});
  }
  if(ctx&&url===ctx.pncpUrl)return new Response(ctx.buffer,{status:200,headers:{'content-type':'application/pdf','content-length':String(ctx.buffer.length)}});
  const response=await resilientPncpFetch(input,init);
  if(ids?.kind==='list'&&response.status>=500){
    const docs=await discoverOriginDocuments(ids);
    if(docs.length)return new Response(JSON.stringify(docs),{status:200,headers:{'content-type':'application/json','x-rlb-source':'origin-fallback'}});
  }
  return response;
};

async function handleUploadSource(req,res,url){
  if(req.method!=='POST'||url.pathname!=='/api/tender-intelligence/upload-source')return false;
  if(!trustedOrigin(req)){json(res,403,{error:'Origem não autorizada.',code:'origin_not_authorized'});return true}
  const user=await authenticatedUser(req);if(!user){json(res,401,{error:'Faça login para continuar.'});return true}
  const body=await readJson(req),cnpj=digits(body.cnpj).slice(0,14),year=Number(body.year),sequence=Number(body.sequence);
  if(cnpj.length!==14||!Number.isInteger(year)||!Number.isInteger(sequence)||sequence<1){json(res,400,{error:'Identificação da licitação inválida.'});return true}
  let buffer;
  try{buffer=decodePdfUpload(body.base64,MAX_UPLOAD_BYTES)}catch(error){json(res,error.status||400,{error:error.message});return true}
  const filename=clean(body.filename||'edital.pdf',220).replace(/[^\p{L}\p{N}._()\- ]/gu,'_');
  cleanupUploads();
  const token=crypto.randomBytes(24).toString('base64url');
  uploadSources.set(token,{token,userId:user.id,cookieHash:cookieHash(req),cnpj,year,sequence,filename,buffer,pncpUrl:`https://pncp.gov.br/app/editais/${cnpj}/${year}/${sequence}`,expiresAt:Date.now()+UPLOAD_TTL_MS});
  json(res,201,{ok:true,token,filename,size:buffer.length,expires_in_seconds:UPLOAD_TTL_MS/1000});
  return true;
}

http.createServer=function userDashboardBackendOnlyCreateServer(...args){
  const listenerIndex=args.findIndex(x=>typeof x==='function');
  if(listenerIndex<0)return nativeCreateServer(...args);
  const listener=args[listenerIndex];
  args[listenerIndex]=async(req,res)=>{
    try{
      const url=new URL(req.url||'/','http://localhost');
      if(req.method==='GET'&&url.pathname==='/assets/source-transparency-v1.js')return asset(res,'application/javascript; charset=utf-8',combinedSourceJs);
      if(req.method==='GET'&&url.pathname==='/api/health'){const database=await databaseHealth();return json(res,database.ok?200:503,{ok:database.ok,version:'2.17.2-tender-source-resilience',storage:database.ok?'postgresql':'postgresql-unavailable',runtime:'production-v31',database})}
      if(await handleUploadSource(req,res,url))return;
      if(req.method==='POST'&&url.pathname==='/api/tender-intelligence/analyze'){
        const token=clean(req.headers['x-rlb-upload-token'],120),entry=uploadSources.get(token);
        if(token&&entry&&entry.expiresAt>Date.now()&&entry.cookieHash===cookieHash(req)){
          console.warn(`tender source upload fallback: using ${entry.filename} for ${entry.cnpj}/${entry.year}/${entry.sequence}`);
          return uploadContext.run(entry,()=>listener(req,res));
        }
      }
      if(await handleUserDashboardRoute(req,res,url))return;
    }catch(error){
      console.error('runtime resilience middleware error:',error?.stack||error);
      if(!res.headersSent)json(res,error?.status||500,{error:error?.status?error.message:'Erro interno na camada de resiliência.'});else try{res.end()}catch{}
      return;
    }
    return listener(req,res);
  };
  return nativeCreateServer(...args);
};

syncBuiltinESMExports();
await import('./production-v29.mjs');
await initUserDashboard();
console.log('runtime audit hardening ready: PostgreSQL health + PNCP dual-route + origin discovery + PDF upload fallback');
console.log('user dashboard backend preserved: Dashboard and Minha Operação UI disabled');
