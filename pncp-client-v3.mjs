const PNCP_BASE_URL = process.env.PNCP_BASE_URL || 'https://pncp.gov.br/api/consulta';
export const PNCP_MODALITY_CODES = Array.from({length:14},(_,i)=>i+1);
const PREFERRED_PAGE_SIZE = Math.min(Math.max(Number(process.env.PNCP_PAGE_SIZE || 500),50),500);
let effectivePageSize = PREFERRED_PAGE_SIZE;
const REQUEST_SPACING_MS = Math.max(180, Number(process.env.PNCP_REQUEST_SPACING_MS || 320));
const MAX_RETRIES = Math.min(Math.max(Number(process.env.PNCP_MAX_RETRIES || 1),0),3);
let gate = Promise.resolve();
let nextStartAt = 0;
let cooldownUntil = 0;

const sleep = ms => new Promise(r=>setTimeout(r,ms));
const digits = v => String(v ?? '').replace(/\D/g,'');
const clean = (v,n=500) => String(v ?? '').trim().slice(0,n);
export const textNorm = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const ymd = d => new Date(d).toISOString().slice(0,10).replaceAll('-','');
export const municipalityOf = x => x?.unidadeOrgao?.municipioNome || x?.unidadeOrgao?.nomeMunicipio || x?.municipioNome || '';
export const closingOf = x => x?.dataEncerramentoProposta || x?.dataFimRecebimentoProposta || null;
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

async function waitStartTurn(){
  const step = gate.then(async()=>{
    const wait=Math.max(0,nextStartAt-Date.now(),cooldownUntil-Date.now());
    if(wait)await sleep(wait);
    nextStartAt=Date.now()+REQUEST_SPACING_MS;
  });
  gate=step.catch(()=>{});
  await step;
}
function retryAfterMs(response,attempt){
  const h=response?.headers?.get?.('retry-after');
  const sec=Number(h);
  if(Number.isFinite(sec)&&sec>0)return Math.min(sec*1000,15000);
  return Math.min(1200*(2**attempt)+Math.floor(Math.random()*350),10000);
}
async function fetchJsonWithRetry(url){
  let last;
  for(let attempt=0;attempt<=MAX_RETRIES;attempt++){
    await waitStartTurn();
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),18000);
    try{
      const r=await fetch(url,{headers:{accept:'application/json','user-agent':'RadarLicitacoesBrasil/3.2'},signal:controller.signal});
      if(r.status===204)return {response:r,body:{data:[],totalPaginas:0,totalRegistros:0}};
      const body=await r.json().catch(()=>({}));
      if(r.ok)return {response:r,body};
      const detail=clean(body?.message||body?.error||body?.detail||body?.title||'',240);
      const err=Object.assign(new Error(`PNCP HTTP ${r.status}${detail?`: ${detail}`:''}`),{status:r.status,body});
      last=err;
      if(r.status===429||r.status>=500){
        const wait=retryAfterMs(r,attempt);
        cooldownUntil=Math.max(cooldownUntil,Date.now()+wait);
        if(attempt<MAX_RETRIES)continue;
      }
      throw err;
    }catch(e){
      last=e;
      if(e?.name==='AbortError'&&attempt<MAX_RETRIES){cooldownUntil=Math.max(cooldownUntil,Date.now()+900*(attempt+1));continue}
      if((e?.status===429||e?.status>=500)&&attempt<MAX_RETRIES)continue;
      throw e;
    }finally{clearTimeout(timeout)}
  }
  throw last||new Error('PNCP indisponível.');
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
export function normalizeSearchFilters(filters={}){
  const modality=Number(filters.modality||filters.modalidade||0);
  const min=filters.minValue===''||filters.minValue==null?null:Number(filters.minValue);
  const max=filters.maxValue===''||filters.maxValue==null?null:Number(filters.maxValue);
  return {
    keyword:clean(filters.keyword,180),
    uf:clean(filters.uf,2).toUpperCase(),
    municipality:clean(filters.municipality,120),
    municipalityIbge:digits(filters.municipalityIbge).slice(0,7),
    modality:Number.isInteger(modality)&&modality>=1&&modality<=14?modality:null,
    org:clean(filters.org,180),
    cnpj:digits(filters.cnpj).slice(0,14),
    minValue:Number.isFinite(min)&&min>=0?min:null,
    maxValue:Number.isFinite(max)&&max>=0?max:null,
    openOnly:filters.openOnly===true||String(filters.openOnly)==='true',
    days:Math.min(Math.max(Number(filters.days)||7,1),30),
    order:['newest','value_desc','value_asc','deadline'].includes(filters.order)?filters.order:'newest'
  };
}

export function applySearchFilters(items,filters={}){
  const f=normalizeSearchFilters(filters),q=textNorm(f.keyword),oq=textNorm(f.org),mq=textNorm(f.municipality),now=Date.now();
  let all=[...(items||[])];
  if(f.uf)all=all.filter(x=>String(x?.unidadeOrgao?.ufSigla||x?.ufSigla||'').toUpperCase()===f.uf);
  if(f.modality)all=all.filter(x=>Number(x?._modalidadeConsultada||x?.modalidadeId)===f.modality);
  if(f.cnpj.length===14)all=all.filter(x=>digits(x?.orgaoEntidade?.cnpj)===f.cnpj);
  if(f.municipalityIbge.length===7)all=all.filter(x=>digits(x?.unidadeOrgao?.codigoIbge||x?.codigoMunicipioIbge)===f.municipalityIbge);
  if(q)all=all.filter(x=>textNorm([x?.objetoCompra,x?.informacaoComplementar,x?.orgaoEntidade?.razaoSocial,x?.unidadeOrgao?.nomeUnidade].filter(Boolean).join(' ')).includes(q));
  if(oq)all=all.filter(x=>textNorm([x?.orgaoEntidade?.razaoSocial,x?.unidadeOrgao?.nomeUnidade].filter(Boolean).join(' ')).includes(oq));
  if(mq)all=all.filter(x=>textNorm(municipalityOf(x)).includes(mq));
  if(f.minValue!==null)all=all.filter(x=>Number(x?.valorTotalEstimado)>=f.minValue);
  if(f.maxValue!==null)all=all.filter(x=>Number(x?.valorTotalEstimado)<=f.maxValue);
  if(f.openOnly)all=all.filter(x=>{const t=Date.parse(closingOf(x)||'');return Number.isFinite(t)&&t>=now});
  const seen=new Set();
  all=all.filter(x=>{const k=resultKey(x);if(!k||seen.has(k))return false;seen.add(k);return true});
  const pub=x=>Date.parse(x?.dataPublicacaoPncp||x?.dataAtualizacao||0)||0;
  if(f.order==='value_desc')all.sort((a,b)=>Number(b?.valorTotalEstimado||0)-Number(a?.valorTotalEstimado||0));
  else if(f.order==='value_asc')all.sort((a,b)=>Number(a?.valorTotalEstimado||0)-Number(b?.valorTotalEstimado||0));
  else if(f.order==='deadline')all.sort((a,b)=>(Date.parse(closingOf(a)||'')||Infinity)-(Date.parse(closingOf(b)||'')||Infinity));
  else all.sort((a,b)=>pub(b)-pub(a));
  return all;
}

async function fetchPageOnce({code,startDate,endDate,filters,page,pageSize}){
  const params=new URLSearchParams({dataInicial:ymd(startDate),dataFinal:ymd(endDate),codigoModalidadeContratacao:String(code),pagina:String(page),tamanhoPagina:String(pageSize),...serverFilterParams(filters)});
  const {body}=await fetchJsonWithRetry(`${PNCP_BASE_URL}/v1/contratacoes/publicacao?${params}`);
  const data=Array.isArray(body?.data)?body.data:Array.isArray(body)?body:[];
  return {
    items:data.map(x=>({...x,_modalidadeConsultada:code})),
    totalPages:Math.max(0,Number(body?.totalPaginas||body?.totalPages||body?.totalDePaginas||0)||0),
    totalRecords:Math.max(0,Number(body?.totalRegistros||body?.totalRecords||0)||0),
    pageSize
  };
}
async function fetchPage(args){
  try{return await fetchPageOnce({...args,pageSize:effectivePageSize})}
  catch(e){
    if(e?.status===400&&effectivePageSize>50){
      effectivePageSize=50;
      console.warn('PNCP page-size fallback activated: API rejected larger page; using 50 records/page');
      return fetchPageOnce({...args,pageSize:effectivePageSize});
    }
    throw e;
  }
}
function pagePlan(totalPages,budget){
  const max=Math.max(1,Math.min(totalPages,Number(budget)||1));
  if(totalPages<=1||max===1)return [1];
  const set=new Set([1,totalPages]);
  let left=2,right=totalPages-1;
  while(set.size<max&&left<=right){set.add(left++);if(set.size<max&&right>=left)set.add(right--)}
  return [...set].sort((a,b)=>a-b);
}
async function mapLimit(values,limit,worker){
  const output=new Array(values.length);let cursor=0;
  async function run(){while(true){const i=cursor++;if(i>=values.length)return;try{output[i]={ok:true,value:await worker(values[i])}}catch(error){output[i]={ok:false,error}}}}
  await Promise.all(Array.from({length:Math.min(limit,values.length)},()=>run()));return output;
}

export async function fetchPncpRange({startDate,endDate,filters={},codes=PNCP_MODALITY_CODES,maxPagesPerModality=4,concurrency=3}={}){
  const results=await mapLimit(codes,concurrency,async code=>{
    const first=await fetchPage({code,startDate,endDate,filters,page:1});
    const pages=pagePlan(first.totalPages||1,Math.max(1,maxPagesPerModality));
    const items=[...first.items];
    for(const page of pages){
      if(page===1)continue;
      const extra=await fetchPage({code,startDate,endDate,filters,page});
      items.push(...extra.items);
    }
    return {code,items,totalPages:first.totalPages||1,totalRecords:first.totalRecords,pagesFetched:pages.length,pageSize:first.pageSize,partial:(first.totalPages||1)>pages.length};
  });
  const errors=[],meta=[];let items=[];
  for(let i=0;i<results.length;i++){
    const r=results[i];
    if(r.ok){items.push(...r.value.items);meta.push({code:r.value.code,total_pages:r.value.totalPages,pages_fetched:r.value.pagesFetched,page_size:r.value.pageSize,total_records:r.value.totalRecords,partial:r.value.partial})}
    else errors.push({code:codes[i],status:r.error?.status||null,message:clean(r.error?.message||'falha PNCP',240)});
  }
  const seen=new Set();items=items.filter(x=>{const k=resultKey(x);if(!k||seen.has(k))return false;seen.add(k);return true});
  return {items,errors,meta,partial:errors.length>0||meta.some(x=>x.partial),successfulModalities:meta.length,failedModalities:errors.length};
}

export async function fetchPncpSearch(filters={}){
  const f=normalizeSearchFilters(filters),end=new Date(),start=new Date(end.getTime()-f.days*86400000),codes=f.modality?[f.modality]:PNCP_MODALITY_CODES;
  const restrictive=Boolean(f.uf||f.municipalityIbge||f.cnpj||f.modality);
  const localText=Boolean(f.keyword||f.org||f.municipality);
  const budget=localText?2:1;
  const r=await fetchPncpRange({startDate:start,endDate:end,filters:f,codes,maxPagesPerModality:budget,concurrency:restrictive?1:2});
  return {...r,items:applySearchFilters(r.items,f),filters:f};
}

export function pncpClientHealth(){return {preferred_page_size:PREFERRED_PAGE_SIZE,effective_page_size:effectivePageSize,request_spacing_ms:REQUEST_SPACING_MS,max_retries:MAX_RETRIES,cooldown_until:cooldownUntil?new Date(cooldownUntil).toISOString():null,base_url:PNCP_BASE_URL};}
