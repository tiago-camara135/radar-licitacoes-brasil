import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reviewerFallbackModels,
  isTenderReviewerRequest,
  geminiModelFromUrl,
  replaceGeminiModel,
  installGeminiReviewerResilience
} from '../gemini-reviewer-resilience-v1.mjs';

test('reviewer fallback excludes current model and keeps alternatives unique',()=>{
  const out=reviewerFallbackModels('gemini-3.6-flash',['gemini-3.6-flash','gemini-3.5-flash-lite','gemini-3.5-flash-lite']);
  assert.equal(out.includes('gemini-3.6-flash'),false);
  assert.equal(out.includes('gemini-3.5-flash-lite'),true);
  assert.equal(new Set(out).size,out.length);
});

test('only second-pass Gemini calls are classified as reviewer requests',()=>{
  const url='https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent';
  const reviewer={body:JSON.stringify({contents:[{parts:[{text:'SEGUNDA PASSAGEM DE AUDITORIA'}]}]})};
  const primary={body:JSON.stringify({contents:[{parts:[{text:'primeira passagem'}]}]})};
  assert.equal(isTenderReviewerRequest(url,reviewer),true);
  assert.equal(isTenderReviewerRequest(url,primary),false);
  assert.equal(geminiModelFromUrl(url),'gemini-3.6-flash');
  assert.match(replaceGeminiModel(url,'gemini-3.5-flash-lite'),/gemini-3\.5-flash-lite:generateContent/);
});

test('reviewer retries an alternate model after retryable provider failure',async()=>{
  const originalFetch=globalThis.fetch;
  const calls=[];
  globalThis.fetch=async(input)=>{
    const url=String(input);calls.push(url);
    if(url.includes('gemini-3.6-flash:generateContent'))return new Response(JSON.stringify({error:{message:'high demand'}}),{status:503,headers:{'content-type':'application/json'}});
    return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'{}'}]}}]}),{status:200,headers:{'content-type':'application/json'}});
  };
  delete globalThis.__rlbGeminiReviewerResilienceV1;
  try{
    installGeminiReviewerResilience();
    const url='https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent';
    const response=await globalThis.fetch(url,{method:'POST',body:JSON.stringify({contents:[{parts:[{text:'SEGUNDA PASSAGEM DE AUDITORIA'}]}]})});
    assert.equal(response.status,200);
    assert.ok(calls.length>=2);
    assert.match(calls[0],/gemini-3\.6-flash/);
    assert.ok(calls.slice(1).some(x=>/gemini-3\.5-flash-lite|gemini-3\.8-flash/.test(x)));
  }finally{
    globalThis.fetch=originalFetch;
    delete globalThis.__rlbGeminiReviewerResilienceV1;
  }
});
