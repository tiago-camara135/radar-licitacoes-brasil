(()=>{
  'use strict';
  if(window.__RLB_SEARCH_UI_V3__)return;
  window.__RLB_SEARCH_UI_V3__=true;
  const nativeFetch=window.fetch.bind(window);

  // Technical coverage/PNCP throttling remains available to diagnostics through
  // /api/search-status, but it is no longer rendered as an end-user warning.
  async function health(){
    try{
      const r=await nativeFetch('/api/search-status',{credentials:'same-origin',headers:{accept:'application/json'},cache:'no-store'});
      if(!r.ok)return;
      const d=await r.json();
      const states=d?.status?.database?.states||[];
      window.__RLB_SEARCH_HEALTH__=d.status;
      document.documentElement.dataset.rlbSearchReady='true';
      if(states.length)document.documentElement.dataset.rlbSearchStates=String(states.length);
    }catch{}
  }

  function removeLegacyCoverage(){
    document.querySelector('#rlbSearchCoverage')?.remove();
  }

  function start(){
    removeLegacyCoverage();
    health();
    setInterval(health,120000);
    const observer=new MutationObserver(removeLegacyCoverage);
    observer.observe(document.documentElement,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
