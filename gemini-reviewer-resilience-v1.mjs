const RETRYABLE_STATUS=new Set([429,500,502,503,504]);
const DEFAULT_MODELS=['gemini-3.6-flash','gemini-3.5-flash-lite','gemini-3.8-flash'];

export function reviewerFallbackModels(current,configured=[]){
  const all=[...new Set([...configured,...DEFAULT_MODELS].filter(Boolean))];
  return all.filter(model=>model!==current);
}
function urlString(input){return typeof input==='string'?input:String(input?.url||input||'')}
function requestBody(init){return typeof init?.body==='string'?init.body:''}
export function isTenderReviewerRequest(input,init){
  const url=urlString(input);
  return url.includes('generativelanguage.googleapis.com/')&&url.includes(':generateContent')&&requestBody(init).includes('SEGUNDA PASSAGEM DE AUDITORIA');
}
export function geminiModelFromUrl(input){
  const match=urlString(input).match(/\/models\/([^/:]+):generateContent/);
  return match?decodeURIComponent(match[1]):null;
}
export function replaceGeminiModel(input,model){
  const raw=urlString(input),encoded=encodeURIComponent(String(model||''));
  return raw.replace(/\/models\/[^/:]+:generateContent/,`/models/${encoded}:generateContent`);
}

export function installGeminiReviewerResilience(){
  if(globalThis.__rlbGeminiReviewerResilienceV1)return;
  const previousFetch=globalThis.fetch.bind(globalThis);
  const configured=[process.env.GEMINI_MODEL,...DEFAULT_MODELS].filter(Boolean);
  globalThis.fetch=async function resilientFetch(input,init){
    if(!isTenderReviewerRequest(input,init))return previousFetch(input,init);
    const current=geminiModelFromUrl(input);
    let response=await previousFetch(input,init);
    if(response.ok||!RETRYABLE_STATUS.has(response.status))return response;
    let last=response;
    for(const alternative of reviewerFallbackModels(current,configured)){
      try{await last.body?.cancel()}catch{}
      const alternativeUrl=replaceGeminiModel(input,alternative);
      try{
        const next=await previousFetch(alternativeUrl,init);
        if(next.ok){
          console.log(`tender reviewer resilience fallback: ${current||'unknown'} -> ${alternative}`);
          return next;
        }
        last=next;
        if(!RETRYABLE_STATUS.has(next.status))return next;
      }catch(error){
        console.warn('tender reviewer resilience error:',alternative,String(error?.message||error).slice(0,180));
      }
    }
    return last;
  };
  globalThis.__rlbGeminiReviewerResilienceV1=true;
  console.log('tender reviewer resilience v1 ready: alternate-model fallback for verification pass');
}
