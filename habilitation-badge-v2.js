(()=>{
'use strict';
if(window.__rlbHabilitationBadgeV2)return;
window.__rlbHabilitationBadgeV2=true;

const REFRESH_MS=5*60*1000;
let timer=null;
let busy=false;
let lastRefresh=0;

const shell=()=>document.getElementById('appShell');
const badge=()=>document.getElementById('habNavBadge');

function hideBadge(){
  const el=badge();
  if(!el)return;
  el.hidden=true;
  el.textContent='0';
}

function renderSummary(summary={}){
  const urgent=Number(summary.expired||0)+Number(summary.critical||0)+Number(summary.warning||0);
  const el=badge();
  if(!el)return;
  el.textContent=String(urgent);
  el.hidden=urgent<=0;
  el.dataset.loaded='1';
  el.title=urgent>0?`${urgent} pendência(s) documental(is) urgente(s)`:'Nenhuma pendência documental urgente';
}

async function refreshBadge({force=false}={}){
  if(busy)return;
  if(!shell()||shell().classList.contains('hidden'))return;
  if(!force&&Date.now()-lastRefresh<15000)return;
  busy=true;
  try{
    const response=await fetch('/api/company-documents/summary',{
      credentials:'same-origin',
      cache:'no-store',
      headers:{accept:'application/json'}
    });
    if(response.status===401){hideBadge();return}
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||`Erro ${response.status}`);
    renderSummary(data.summary||{});
    lastRefresh=Date.now();
  }catch(error){
    console.warn('habilitation badge refresh:',error?.message||error);
  }finally{
    busy=false;
  }
}

function schedule(delay=120){
  clearTimeout(timer);
  timer=setTimeout(()=>refreshBadge({force:true}),delay);
}

function observeSession(){
  const app=shell();
  if(!app)return;
  if(!app.classList.contains('hidden'))schedule(80);
  new MutationObserver(()=>{
    if(app.classList.contains('hidden')){
      hideBadge();
      return;
    }
    schedule(80);
  }).observe(app,{attributes:true,attributeFilter:['class']});
}

function ensureBadgeExists(){
  if(badge())return;
  const nav=document.getElementById('mainNav');
  if(!nav)return;
  const observer=new MutationObserver(()=>{
    if(badge()){
      observer.disconnect();
      if(!shell()?.classList.contains('hidden'))schedule(50);
    }
  });
  observer.observe(nav,{childList:true,subtree:true});
  setTimeout(()=>observer.disconnect(),10000);
}

function bindFreshness(){
  window.addEventListener('focus',()=>{
    if(Date.now()-lastRefresh>=REFRESH_MS)refreshBadge();
  });
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden&&Date.now()-lastRefresh>=REFRESH_MS)refreshBadge();
  });
}

function boot(){
  ensureBadgeExists();
  observeSession();
  bindFreshness();
  window.__rlbRefreshHabilitationBadge=()=>refreshBadge({force:true});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();
})();
