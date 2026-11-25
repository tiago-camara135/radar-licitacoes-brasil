import { pncpDeadline } from './pncp-operational-date-v1.mjs';
import { createPncpTransport } from './pncp-transport-v1.mjs';

const PNCP_BASE_URL = process.env.PNCP_BASE_URL || 'https://pncp.gov.br/api/consulta';
export const PNCP_MODALITY_CODES = Array.from({length:14},(_,i)=>i+1);
const PREFERRED_PAGE_SIZE = Math.min(Math.max(Number(process.env.PNCP_PAGE_SIZE || 50),10),50);
let effectivePageSize = PREFERRED_PAGE_SIZE;
const REQUEST_SPACING_MS = Math.max(180, Number(process.env.PNCP_REQUEST_SPACING_MS || 450));
const MAX_RETRIES = Math.min(Math.max(Number(process.env.PNCP_MAX_RETRIES || 2),0),3);
const OPEN_HORIZON_DAYS=Math.min(Math.max(Number(process.env.PNCP_OPEN_HORIZON_DAYS||30),7),120);
const pageProgress=new Map(),modalityHealth=new Map();
const transport=createPncpTransport({spacing:REQUEST_SPACING_MS,maxRetries:MAX_RETRIES,maxConcurrent:2});
const fetchJsonWithRetry=url=>transport.get(url);
export async function fetchPncpContractPage({start,end,page}){
 const url=new URL(PNCP_BASE_URL.replace(/\/$/,'')+'/v1/contratos');
 url.search=new URLSearchParams({dataInicial:start.replaceAll('-',''),dataFinal:end.replaceAll('-',''),pagina:String(page),tamanhoPagina:'50'}).toString();
 // Share the national queue and cache; no automatic historical backfill.
 const {body}=await fetchJsonWithRetry(url.href);return body;
}
export async function fetchPncpAtaPage({start,end,page,org}){
 const url=new URL(PNCP_BASE_URL.replace(/\/$/,'')+'/v1/atas');
 url.search=new URLSearchParams({dataInicial:start.replaceAll('-',''),dataFinal:end.replaceAll('-',''),pagina:String(page),tamanhoPagina:'50',...(org?{cnpj:org}:{})}).toString();
 const {body}=await fetchJsonWithRetry(url.href);return body;
}
const digits = v => String(v ?? '').replace(/\D/g,'');
const clean = (v,n=500) => String(v ?? '').trim().slice(0,n);
export const textNorm = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const ymd = d => new Date(d).toISOString().slice(0,10).replaceAll('-','');
export const municipalityOf = x => x?.unidadeOrgao?.municipioNome || x?.unidadeOrgao?.nomeMunicipio || x?.municipioNome || '';
export const closingOf = x => pncpDeadline(x?.dataEncerramentoProposta || x?.dataFimRecebimentoProposta || null);
export const resultKey = x => clean(x?.numeroControlePNCP,180) || [digits(x?.orgaoEntidade?.cnpj),x?.anoCompra||'',x?.sequencialCompra||'',x?._modalidadeConsultada||x?.modalidadeId||''].join('-');
export function pncpUrl(x){
  const cnpj=digits(x?.orgaoEntidade?.cnpj),year=Number(x?.anoCompra),seq=Number(x?.sequencialCompra);
  if(cnpj.length!==14||!Number.isInteger(year)||!Number.isInteger(seq)||seq<1)return '';
  return `https://pncp.gov.br/app/editais/${cnpj}/${year}/${seq}`;
}
export function originUrl(x){
  const raw=x?.linkSistemaOrigem||x?.linkProcessoEletronico||'';
  try{const u=new URL(raw);return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return ''}
}

function serverFilterParams(filters={}){
  const out={};
  const uf=clean(filters.uf,2).toUpperCase();
  const ibge=digits(filters.municipalityIbge).slice(0,7);
  const cnpj=digits(filters.cnpj).slice(0,14);
  if(/^[A-Z]{2}$/.test(uf))out.uf=uf;
  if(ibge.length===7)out.codigoMunicipioIbge=ibge;
  if(cnpj.length===14)out.cnpj=cnpj;
  return out;
}
function modalityList(value){
  const raw=Array.isArray(value)?value:String(value??'').split(',');
  return [...new Set(raw.map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=14))];
}
export function radarSearchTerms(keyword) {
  return [...new Set(textNorm(keyword).trim().split(/\s+/).filter(Boolean)
    .map(word => /^(?:pneus?|pneumaticos?)$/.test(word) ? 'pneu' : word))];
}

function radarRank(item, terms) {
  const object = textNorm(item?.objetoCompra);
  const number = textNorm([item?.numeroCompra, item?.numeroProcesso, item?.numeroControlePNCP,
    item?.numeroCompra && item?.anoCompra ? `${item.numeroCompra}/${item.anoCompra}` : ''].join(' '));
  const other = textNorm([municipalityOf(item), item?.informacaoComplementar,
    item?.orgaoEntidade?.razaoSocial, item?.unidadeOrgao?.nomeUnidade].join(' '));
  let score = 0;
  for (const term of terms) {
    if (number.includes(term)) score += 6;
    else if (object.includes(term)) score += 3;
    else if (other.includes(term)) score += 1;
    else return -1;
  }
  return score;
}

export function normalizeSearchFilters(filters={}){
  const modalities=modalityList(filters.modalities?.length?filters.modalities:(filters.modality??filters.modalidade??''));
  const min=filters.minValue===''||filters.minValue==null?null:Number(filters.minValue);
  const max=filters.maxValue===''||filters.maxValue==null?null:Number(filters.maxValue);
  const rawDays=Number(filters.days);
  const days=rawDays===0?0:Math.min(Math.max(Number.isFinite(rawDays)&&rawDays>0?rawDays:7,1),90);
  return {
    keyword:clean(filters.keyword,180),
    workspace:filters.workspace === true,
    states:[...new Set((Array.isArray(filters.states) ? filters.states : String(filters.states || '').split(','))
      .map(uf => clean(uf,2).toUpperCase()).filter(uf => /^[A-Z]{2}$/.test(uf)))].slice(0,27),
    closingDays:[1,7,30].includes(Number(filters.closingDays)) ? Number(filters.closingDays) : 0,
    uf:clean(filters.uf,2).toUpperCase(),
    municipality:clean(filters.municipality,120),
    municipalityIbge:digits(filters.municipalityIbge).slice(0,7),
    modality:modalities.length===1?modalities[0]:null,
    modalities,
    org:clean(filters.org,180),
    cnpj:digits(filters.cnpj).slice(0,14),
    minValue:Number.isFinite(min)&&min>=0?min:null,
    maxValue:Number.isFinite(max)&&max>=0?max:null,
    openOnly:filters.openOnly===true||String(filters.openOnly)==='true',
    days,
    order:['newest','value_desc','value_asc','deadline','relevance'].includes(filters.order)?filters.order:'newest'
  };
}

export function applySearchFilters(items,filters={}){
  const f=normalizeSearchFilters(filters),q=textNorm(f.keyword),oq=textNorm(f.org),mq=textNorm(f.municipality),now=Date.now();
  let all=[...(items||[])];
  if(f.uf)all=all.filter(x=>String(x?.unidadeOrgao?.ufSigla||x?.ufSigla||'').toUpperCase()===f.uf);
  if(f.modalities.length)all=all.filter(x=>f.modalities.includes(Number(x?._modalidadeConsultada||x?.modalidadeId)));
  if(f.cnpj.length===14)all=all.filter(x=>digits(x?.orgaoEntidade?.cnpj)===f.cnpj);
  if(f.municipalityIbge.length===7)all=all.filter(x=>digits(x?.unidadeOrgao?.codigoIbge||x?.codigoMunicipioIbge)===f.municipalityIbge);
  if(f.states.length)all=all.filter(x=>f.states.includes(String(x?.unidadeOrgao?.ufSigla||x?.ufSigla||'').toUpperCase()));
  if(f.closingDays)all=all.filter(x=>{const t=Date.parse(closingOf(x)||'');return t>=now&&t<=now+f.closingDays*86400000});
  const ranks=new Map();
  if(q&&f.workspace){
    const terms=radarSearchTerms(q);
    all=all.filter(item=>{const score=radarRank(item,terms);ranks.set(item,score);return score>=0});
  }
  if(q&&!f.workspace)all=all.filter(x=>textNorm([x?.objetoCompra,x?.informacaoComplementar,x?.orgaoEntidade?.razaoSocial,x?.unidadeOrgao?.nomeUnidade].filter(Boolean).join(' ')).includes(q));
  if(oq)all=all.filter(x=>textNorm([x?.orgaoEntidade?.razaoSocial,x?.unidadeOrgao?.nomeUnidade].filter(Boolean).join(' ')).includes(oq));
  if(mq)all=all.filter(x=>textNorm(municipalityOf(x)).includes(mq));
  const knownValue=x=>{const v=x?.valorTotalEstimado;return v==null||v===''?null:Number.isFinite(Number(v))?Number(v):null};
  if(f.minValue!==null)all=all.filter(x=>knownValue(x)!==null&&knownValue(x)>=f.minValue);
  if(f.maxValue!==null)all=all.filter(x=>knownValue(x)!==null&&knownValue(x)<=f.maxValue);
  if(f.openOnly)all=all.filter(x=>{const t=Date.parse(closingOf(x)||'');return Number.isFinite(t)&&t>=now});
  const seen=new Set();
  all=all.filter(x=>{const k=resultKey(x);if(!k||seen.has(k))return false;seen.add(k);return true});
  const pub=x=>Date.parse(x?.dataPublicacaoPncp||x?.dataAtualizacao||0)||0;
  if(f.order==='relevance')all.sort((a,b)=>(ranks.get(b)||0)-(ranks.get(a)||0)||pub(b)-pub(a));
  else if(f.order==='value_desc')all.sort((a,b)=>(knownValue(b)??-Infinity)-(knownValue(a)??-Infinity));
  else if(f.order==='value_asc')all.sort((a,b)=>(knownValue(a)??Infinity)-(knownValue(b)??Infinity));
  else if(f.order==='deadline')all.sort((a,b)=>(Date.parse(closingOf(a)||'')||Infinity)-(Date.parse(closingOf(b)||'')||Infinity));
  else all.sort((a,b)=>pub(b)-pub(a));
  return all;
}

async function fetchPublicationPageOnce({code,startDate,endDate,filters,page,pageSize}){
  const params=new URLSearchParams({dataInicial:ymd(startDate),dataFinal:ymd(endDate),codigoModalidadeContratacao:String(code),pagina:String(page),tamanhoPagina:String(pageSize),...serverFilterParams(filters)});
  const {body}=await fetchJsonWithRetry(`${PNCP_BASE_URL}/v1/contratacoes/publicacao?${params}`);
  const data=Array.isArray(body?.data)?body.data:Array.isArray(body)?body:[];
  return {items:data.map(x=>({...x,_modalidadeConsultada:code})),totalPages:Math.max(0,Number(body?.totalPaginas||body?.totalPages||body?.totalDePaginas||0)||0),totalRecords:Math.max(0,Number(body?.totalRegistros||body?.totalRecords||0)||0),pageSize};
}
async function fetchOpenPageOnce({code,endDate,filters,page,pageSize}){
  const params=new URLSearchParams({dataFinal:ymd(endDate),codigoModalidadeContratacao:String(code),pagina:String(page),tamanhoPagina:String(pageSize),...serverFilterParams(filters)});
  const {body}=await fetchJsonWithRetry(`${PNCP_BASE_URL}/v1/contratacoes/proposta?${params}`);
  const data=Array.isArray(body?.data)?body.data:Array.isArray(body)?body:[];
  return {items:data.map(x=>({...x,_modalidadeConsultada:code,_pncpOpenEndpoint:true})),totalPages:Math.max(0,Number(body?.totalPaginas||body?.totalPages||body?.totalDePaginas||0)||0),totalRecords:Math.max(0,Number(body?.totalRegistros||body?.totalRecords||0)||0),pageSize};
}
async function fetchWithPageFallback(worker,args){
  try{return await worker({...args,pageSize:effectivePageSize})}
  catch(e){
    if(e?.status===400&&effectivePageSize>50){effectivePageSize=50;return worker({...args,pageSize:effectivePageSize})}
    throw e;
  }
}
// Progress is isolated by endpoint, date and actual remote filters. Failed pages are revisited first.
function scopeKey(kind,date,filters,code){return JSON.stringify([kind,date,serverFilterParams(filters),code]);}
function progress(key){
 let p=pageProgress.get(key);
 if(!p){p={cursor:2,pending:new Set()};pageProgress.set(key,p);}
 while(pageProgress.size>240)pageProgress.delete(pageProgress.keys().next().value);
 return p;
}
function planExtra(p,totalPages,budget){
 const max=Math.min(Math.max(0,budget),Math.max(0,totalPages-1));
 const chosen=new Set();
 for(const page of p.pending){if(page>totalPages)p.pending.delete(page);else if(page>=2&&chosen.size<max)chosen.add(page);}
 let tries=0;
 while(chosen.size<max&&tries++<totalPages){if(p.cursor>totalPages)p.cursor=2;chosen.add(p.cursor++);}
 return [...chosen];
}
function recordModality(kind,code,ok,partial,failedPages=0){
 const key=kind+':'+code,previous=modalityHealth.get(key)||{attempts:0,successes:0,failures:0,last_success_at:null};
 modalityHealth.set(key,{code,kind,attempts:previous.attempts+1,successes:previous.successes+Number(ok),failures:previous.failures+Number(!ok),last_success_at:ok?new Date().toISOString():previous.last_success_at,last_attempt_at:new Date().toISOString(),last_ok:ok,partial,failed_pages:failedPages});
}
function prioritized(codes,kind,track){return track?[...codes].sort((a,b)=>Number(modalityHealth.get(kind+':'+b)?.last_ok===false)-Number(modalityHealth.get(kind+':'+a)?.last_ok===false)):codes;}
async function collectModality({worker,args,key,budget,kind,track}){
 const code=args.code,p=progress(key);
 try{
  const first=await fetchWithPageFallback(worker,{...args,page:1});
  const totalPages=first.totalPages||1,items=[...first.items],failedPages=[];
  const extras=planExtra(p,totalPages,budget-1);
  let pagesFetched=1;
  for(const page of extras){
   try{const extra=await fetchWithPageFallback(worker,{...args,page});items.push(...extra.items);p.pending.delete(page);pagesFetched++;}
   catch(e){p.pending.add(page);failedPages.push({code,page,status:e?.status||null,message:clean(e?.message||'falha PNCP',180)});}
  }
  const partial=pagesFetched<totalPages||failedPages.length>0;
  if(track)recordModality(kind,code,true,partial,failedPages.length);
  return {code,items,totalPages,totalRecords:first.totalRecords,pagesFetched,pageSize:first.pageSize,partial,failedPages};
 }catch(e){if(track)recordModality(kind,code,false,true);throw e;}
}
async function mapLimit(values,limit,worker){
  const output=new Array(values.length);let cursor=0;
  async function run(){while(true){const i=cursor++;if(i>=values.length)return;try{output[i]={ok:true,value:await worker(values[i])}}catch(error){output[i]={ok:false,error}}}}
  await Promise.all(Array.from({length:Math.min(limit,values.length)},()=>run()));return output;
}
function collectResults(results,codes){
  const errors=[],meta=[],pageErrors=[];let items=[];
  for(let i=0;i<results.length;i++){
    const r=results[i];
    if(r.ok){items.push(...r.value.items);pageErrors.push(...(r.value.failedPages||[]));meta.push({code:r.value.code,total_pages:r.value.totalPages,pages_fetched:r.value.pagesFetched,page_size:r.value.pageSize,total_records:r.value.totalRecords,partial:r.value.partial})}
    else errors.push({code:codes[i],status:r.error?.status||null,message:clean(r.error?.message||'falha PNCP',240)});
  }
  const seen=new Set();items=items.filter(x=>{const k=resultKey(x);if(!k||seen.has(k))return false;seen.add(k);return true});
  return {items,errors,meta,pageErrors,partial:errors.length>0||pageErrors.length>0||meta.some(x=>x.partial),successfulModalities:meta.length,failedModalities:errors.length};
}
export async function fetchPncpRange({startDate,endDate,filters={},codes=PNCP_MODALITY_CODES,maxPagesPerModality=4,concurrency=3,extraPageCodes=null,track=false}={}){
 const ordered=prioritized(codes,'publication',track);
 const results=await mapLimit(ordered,concurrency,code=>collectModality({worker:fetchPublicationPageOnce,args:{code,startDate,endDate,filters},key:scopeKey('publication',ymd(startDate)+':'+ymd(endDate),filters,code),budget:extraPageCodes?(extraPageCodes.includes(code)?2:1):Math.max(1,maxPagesPerModality),kind:'publication',track}));
 return collectResults(results,ordered);
}
export async function fetchPncpOpenRange({endDate=new Date(Date.now()+OPEN_HORIZON_DAYS*86400000),filters={},codes=PNCP_MODALITY_CODES,maxPagesPerModality=3,concurrency=2,track=false}={}){
 const ordered=prioritized(codes,'open',track);
 const results=await mapLimit(ordered,concurrency,code=>collectModality({worker:fetchOpenPageOnce,args:{code,endDate,filters},key:scopeKey('open',ymd(endDate),filters,code),budget:Math.max(1,maxPagesPerModality),kind:'open',track}));
 return collectResults(results,ordered);
}
export async function fetchPncpSearch(filters={}){
  const f=normalizeSearchFilters(filters),end=new Date(),days=f.days||30,start=new Date(end.getTime()-days*86400000),codes=f.modalities.length?f.modalities:PNCP_MODALITY_CODES;
  const restrictive=Boolean(f.uf||f.municipalityIbge||f.cnpj||f.modalities.length);
  const localText=Boolean(f.keyword||f.org||f.municipality);
  const budget=localText?2:1;
  const r=await fetchPncpRange({startDate:start,endDate:end,filters:f,codes,maxPagesPerModality:budget,concurrency:restrictive?1:2});
  return {...r,items:applySearchFilters(r.items,f),filters:f};
}
export async function fetchPncpOpenSearch(filters={}, {track=false}={}){
  const f={...normalizeSearchFilters(filters),openOnly:true},codes=f.modalities.length?f.modalities:PNCP_MODALITY_CODES;
  const restrictive=Boolean(f.uf||f.municipalityIbge||f.cnpj||f.modalities.length);
  const budget=restrictive?4:3;
  const endDate=new Date(Date.now()+OPEN_HORIZON_DAYS*86400000);
  const r=await fetchPncpOpenRange({endDate,filters:f,codes,maxPagesPerModality:budget,concurrency:restrictive?1:2,track});
  return {...r,items:applySearchFilters(r.items,f),filters:f,openHorizonDays:OPEN_HORIZON_DAYS};
}
export function pncpClientHealth(){return {preferred_page_size:PREFERRED_PAGE_SIZE,effective_page_size:effectivePageSize,request_spacing_ms:REQUEST_SPACING_MS,max_retries:MAX_RETRIES,cooldown_until:transport.health().cooldown_until,transport:transport.health(),modalities:[...modalityHealth.values()],base_url:PNCP_BASE_URL,open_endpoint:'/v1/contratacoes/proposta',open_horizon_days:OPEN_HORIZON_DAYS,open_page_strategy:'first-plus-rotating'};}
