(()=>{
'use strict';
if(window.__rlbHabilitationBadgeV2)return;
window.__rlbHabilitationBadgeV2=true;

const REFRESH_MS=5*60*1000;
let timer=null;
let busy=false;
let lastRefresh=0;
let navObserver=null;

const shell=()=>document.getElementById('appShell');
const badge=()=>document.getElementById('habNavBadge');

function installHiddenRule(){
  if(document.getElementById('rlb-hab-badge-hidden-rule'))return;
  const style=document.createElement('style');
  style.id='rlb-hab-badge-hidden-rule';
  style.textContent='#habNavBadge[hidden]{display:none!important}';
  document.head.appendChild(style);
}

function hideBadge(){
  const el=badge();
  if(!el)return;
  el.hidden=true;
  el.textContent='0';
  el.removeAttribute('data-loaded');
  el.title='';
}

function renderSummary(summary={}){
  const urgent=Number(summary.expired||0)+Number(summary.critical||0)+Number(summary.warning||0);
  const el=badge();
  if(!el)return false;
  el.textContent=String(urgent);
  el.hidden=urgent<=0;
  el.dataset.loaded='1';
  el.title=urgent>0?`${urgent} pendência(s) documental(is) urgente(s)`:'Nenhuma pendência documental urgente';
  return true;
}

async function refreshBadge({force=false}={}){
  if(busy)return false;
  const app=shell();
  if(!app||app.classList.contains('hidden'))return false;
  if(!force&&Date.now()-lastRefresh<15000)return false;
  busy=true;
  try{
    const response=await fetch('/api/company-documents/summary',{
      credentials:'same-origin',
      cache:'no-store',
      headers:{accept:'application/json'}
    });
    if(response.status===401){hideBadge();return false}
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||`Erro ${response.status}`);
    if(!renderSummary(data.summary||{}))return false;
    lastRefresh=Date.now();
    return true;
  }catch(error){
    console.warn('habilitation badge refresh:',error?.message||error);
    return false;
  }finally{
    busy=false;
  }
}

function schedule(delay=80){
  clearTimeout(timer);
  timer=setTimeout(async()=>{
    const rendered=await refreshBadge({force:true});
    if(!rendered&&shell()&&!shell().classList.contains('hidden'))setTimeout(()=>refreshBadge({force:true}),500);
  },delay);
}

function watchBadgeCreation(){
  if(badge()){
    if(!shell()?.classList.contains('hidden'))schedule(40);
    return;
  }
  const nav=document.getElementById('mainNav');
  if(!nav)return;
  navObserver?.disconnect();
  navObserver=new MutationObserver(()=>{
    if(!badge())return;
    navObserver.disconnect();
    navObserver=null;
    if(!shell()?.classList.contains('hidden'))schedule(40);
  });
  navObserver.observe(nav,{childList:true,subtree:true});
}

function observeSession(){
  const app=shell();
  if(!app)return;
  if(!app.classList.contains('hidden'))schedule(40);
  new MutationObserver(()=>{
    if(app.classList.contains('hidden')){
      hideBadge();
      return;
    }
    watchBadgeCreation();
    schedule(40);
  }).observe(app,{attributes:true,attributeFilter:['class']});
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
  installHiddenRule();
  watchBadgeCreation();
  observeSession();
  bindFreshness();
  window.__rlbRefreshHabilitationBadge=()=>refreshBadge({force:true});
  setTimeout(()=>{
    if(shell()&&!shell().classList.contains('hidden')){
      watchBadgeCreation();
      schedule(0);
    }
  },1200);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();
})();
