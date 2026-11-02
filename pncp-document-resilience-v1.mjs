const RETRYABLE_STATUSES=new Set([408,425,429,500,502,503,504]);
const DEFAULT_PRIMARY_ATTEMPTS=3;
const DEFAULT_FALLBACK_ATTEMPTS=2;
const DEFAULT_TIMEOUT_MS=22000;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function requestUrl(input){try{return typeof input==='string'?input:input instanceof URL?input.href:input?.url||String(input)}catch{return''}}
function requestMethod(input,init){return String(init?.method||input?.method||'GET').toUpperCase()}

export function isPncpDocumentRequest(url,method='GET'){
  if(String(method).toUpperCase()!=='GET')return false;
  try{
    const u=new URL(url);
    return u.hostname==='pncp.gov.br'&&u.pathname.startsWith('/api/pncp/')&&u.pathname.includes('/arquivos');
  }catch{return false}
}

export function pncpBackendUrl(url){
  try{
    const u=new URL(url);
    if(u.hostname!=='pncp.gov.br'||!u.pathname.startsWith('/api/pncp/'))return null;
    u.pathname=u.pathname.replace(/^\/api\/pncp\//,'/pncp-api/');
    return u.href;
  }catch{return null}
}

function retryAfterMs(response,attempt,randomFn=Math.random){
  const raw=String(response?.headers?.get?.('retry-after')||'').trim();
  if(raw){
    const seconds=Number(raw);
    if(Number.isFinite(seconds)&&seconds>=0)return Math.min(seconds*1000,5000);
    const at=Date.parse(raw);
    if(Number.isFinite(at))return Math.min(Math.max(at-Date.now(),0),5000);
  }
  return Math.min(5000,350*(2**attempt)+Math.floor(randomFn()*180));
}

async function attemptRoute(fetchImpl,target,init,{attempts,label,timeoutMs,sleepFn,logger,randomFn,signalFactory}){
  let lastResponse=null,lastError=null;
  for(let attempt=0;attempt<attempts;attempt++){
    try{
      const signal=signalFactory(timeoutMs);
      const response=await fetchImpl(target,{...init,...(signal?{signal}:{})});
      if(!RETRYABLE_STATUSES.has(response.status))return{response,error:null};
      lastResponse=response;
      logger?.warn?.(`pncp document ${label}: status=${response.status} attempt=${attempt+1}/${attempts}`);
      if(attempt<attempts-1)await sleepFn(retryAfterMs(response,attempt,randomFn));
    }catch(error){
      lastError=error;
      logger?.warn?.(`pncp document ${label}: network=${String(error?.name||'error')} attempt=${attempt+1}/${attempts}`);
      if(attempt<attempts-1)await sleepFn(Math.min(5000,350*(2**attempt)+Math.floor(randomFn()*180)));
    }
  }
  return{response:lastResponse,error:lastError};
}

export function createResilientPncpDocumentFetch(fetchImpl,options={}){
  if(typeof fetchImpl!=='function')throw new TypeError('fetchImpl must be a function');
  const primaryAttempts=Math.max(1,Number(options.primaryAttempts||DEFAULT_PRIMARY_ATTEMPTS));
  const fallbackAttempts=Math.max(1,Number(options.fallbackAttempts||DEFAULT_FALLBACK_ATTEMPTS));
  const timeoutMs=Math.max(1000,Number(options.timeoutMs||DEFAULT_TIMEOUT_MS));
  const sleepFn=options.sleepFn||sleep;
  const logger=options.logger||console;
  const randomFn=options.randomFn||Math.random;
  const signalFactory=options.signalFactory||((ms)=>AbortSignal.timeout(ms));

  return async function resilientPncpDocumentFetch(input,init={}){
    const url=requestUrl(input),method=requestMethod(input,init);
    if(!isPncpDocumentRequest(url,method))return fetchImpl(input,init);

    const primary=await attemptRoute(fetchImpl,input,init,{attempts:primaryAttempts,label:'gateway',timeoutMs,sleepFn,logger,randomFn,signalFactory});
    if(primary.response&&!RETRYABLE_STATUSES.has(primary.response.status))return primary.response;

    const alternate=pncpBackendUrl(url);
    if(alternate){
      logger?.warn?.(`pncp document fallback: gateway unavailable; switching to ${new URL(alternate).pathname}`);
      const fallback=await attemptRoute(fetchImpl,alternate,init,{attempts:fallbackAttempts,label:'backend',timeoutMs,sleepFn,logger,randomFn,signalFactory});
      if(fallback.response)return fallback.response;
      if(fallback.error)throw fallback.error;
    }

    if(primary.response)return primary.response;
    if(primary.error)throw primary.error;
    throw new Error('PNCP document request failed');
  };
}

export function installPncpDocumentResilience(options={}){
  const nativeFetch=(options.fetchImpl||globalThis.fetch).bind(globalThis);
  const wrapped=createResilientPncpDocumentFetch(nativeFetch,options);
  globalThis.fetch=wrapped;
  return wrapped;
}

export const __test={RETRYABLE_STATUSES,DEFAULT_PRIMARY_ATTEMPTS,DEFAULT_FALLBACK_ATTEMPTS,DEFAULT_TIMEOUT_MS,retryAfterMs};
