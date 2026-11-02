(()=>{
'use strict';
if(window.__rlbTenderSourceFallbackV2)return;window.__rlbTenderSourceFallbackV2=true;
let lastKey=null,pendingToken='',enhanceTimer=0;
const nativeFetch=window.fetch.bind(window);
function isAnalyze(input,init){try{const u=new URL(typeof input==='string'?input:input?.url||'',location.origin);return u.origin===location.origin&&u.pathname==='/api/tender-intelligence/analyze'&&String(init?.method||input?.method||'GET').toUpperCase()==='POST'}catch{return false}}
window.fetch=async function tenderSourceAwareFetch(input,init={}){
  let next=init;
  if(isAnalyze(input,init)){
    try{const body=typeof init.body==='string'?JSON.parse(init.body):null;if(body?.cnpj)lastKey={cnpj:String(body.cnpj),year:Number(body.year),sequence:Number(body.sequence)}}catch{}
    if(pendingToken)next={...init,headers:{...(init.headers||{}),'x-rlb-upload-token':pendingToken}};
  }
  const r=await nativeFetch(input,next);
  if(isAnalyze(input,init)&&pendingToken)pendingToken='';
  return r;
};
function relevantError(root){const t=String(root?.textContent||'');return /PNCP documentos HTTP 5\d\d|extrair texto suficiente|download indisponível|serviço.*PNCP/i.test(t)}
function fileToBase64(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||'').split(',')[1]||'');r.onerror=()=>reject(new Error('Não foi possível ler o PDF.'));r.readAsDataURL(file)})}
function triggerAnalysis(key){
  let t=document.querySelector(`.tender-ai-trigger[data-cnpj="${CSS.escape(String(key.cnpj))}"][data-year="${Number(key.year)}"][data-sequence="${Number(key.sequence)}"]`),temp=false;
  if(!t){t=document.createElement('button');t.type='button';t.className='tender-ai-trigger';t.dataset.cnpj=String(key.cnpj);t.dataset.year=String(key.year);t.dataset.sequence=String(key.sequence);t.hidden=true;document.body.appendChild(t);temp=true}
  t.click();if(temp)setTimeout(()=>t.remove(),0);
}
async function uploadAndAnalyze(file,root){
  if(!lastKey)throw new Error('Não foi possível identificar esta licitação. Feche a janela e tente novamente.');
  if(!file)throw new Error('Selecione o edital em PDF.');
  if(file.size>18*1024*1024)throw new Error('O PDF deve ter no máximo 18 MB.');
  const head=new Uint8Array(await file.slice(0,5).arrayBuffer());if(String.fromCharCode(...head)!=='%PDF-')throw new Error('O arquivo selecionado não é um PDF válido.');
  const btn=root.querySelector('[data-tai-upload-submit]');if(btn){btn.disabled=true;btn.textContent='Enviando e preparando análise...'}
  const base64=await fileToBase64(file);
  const r=await nativeFetch('/api/tender-intelligence/upload-source',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{accept:'application/json','content-type':'application/json'},body:JSON.stringify({...lastKey,filename:file.name||'edital.pdf',base64})});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`Falha no envio do PDF (${r.status}).`);
  pendingToken=d.token;triggerAnalysis(lastKey);
}
function enhance(){
  const root=document.querySelector('#taiBody .tai-error');if(!root||root.querySelector('[data-tai-upload-fallback]')||!lastKey||!relevantError(root))return;
  const p=document.createElement('div');p.setAttribute('data-tai-upload-fallback','1');
  p.style.cssText='max-width:620px;margin:22px auto 0;padding:18px;border:1px solid rgba(41,211,162,.28);border-radius:14px;background:rgba(41,211,162,.06);text-align:left';
  p.innerHTML=`<b style="display:block;margin-bottom:7px">Continuar sem depender do PNCP</b><p style="margin:0 0 12px;line-height:1.55">O serviço de anexos do PNCP está indisponível. Envie o edital em PDF e a IA-RLB continuará a mesma análise completa, com dupla revisão e conferência das evidências.</p><input data-tai-upload-file type="file" accept="application/pdf,.pdf" style="display:block;width:100%;margin:0 0 10px"><button type="button" data-tai-upload-submit class="btn primary">Analisar PDF agora</button><small style="display:block;margin-top:9px;opacity:.72">PDF de até 18 MB. O arquivo é usado somente para esta análise temporária e não vira documento da sua empresa.</small>`;
  root.appendChild(p);
}
document.addEventListener('click',async e=>{
  const b=e.target.closest?.('[data-tai-upload-submit]');if(!b)return;
  e.preventDefault();const root=b.closest('[data-tai-upload-fallback]'),file=root?.querySelector('[data-tai-upload-file]')?.files?.[0];
  try{await uploadAndAnalyze(file,root)}catch(err){b.disabled=false;b.textContent='Analisar PDF agora';const old=root.querySelector('.tai-upload-error');if(old)old.remove();const m=document.createElement('div');m.className='tai-upload-error';m.style.cssText='margin-top:10px;color:#ff8c8c;font-weight:600';m.textContent=err?.message||'Não foi possível analisar o PDF.';root.appendChild(m)}
});
const observer=new MutationObserver(()=>{clearTimeout(enhanceTimer);enhanceTimer=setTimeout(enhance,30)});
function boot(){observer.observe(document.body,{childList:true,subtree:true});enhance()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
