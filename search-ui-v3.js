(()=>{
  'use strict';
  if(window.__RLB_SEARCH_UI_V3__)return;
  window.__RLB_SEARCH_UI_V3__=true;
  const nativeFetch=window.fetch.bind(window);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let lastMeta=null;

  function ensureStatus(){
    const host=document.querySelector('#searchMsg');
    if(!host||document.querySelector('#rlbSearchCoverage'))return;
    const box=document.createElement('div');
    box.id='rlbSearchCoverage';
    box.style.cssText='margin:10px 0 0;padding:9px 11px;border:1px solid var(--rlb3-line,#d9e4eb);border-radius:10px;background:var(--rlb3-surface-soft,#f8fbfd);font-size:10px;line-height:1.5;color:var(--rlb3-muted,#718596);display:none';
    host.insertAdjacentElement('afterend',box);
  }
  function renderMeta(meta){
    ensureStatus();
    const box=document.querySelector('#rlbSearchCoverage');
    if(!box||!meta)return;
    const partial=Boolean(meta.partial);
    const local=Number(meta.local_count||0),remote=Number(meta.remote_count||0);
    box.style.display='block';
    box.style.borderColor=partial?'#e5c970':'var(--rlb3-line,#d9e4eb)';
    box.style.background=partial?'color-mix(in srgb,#f5c542 9%,var(--rlb3-surface,#fff))':'var(--rlb3-surface-soft,#f8fbfd)';
    box.innerHTML=partial
      ? `<strong style="color:var(--rlb3-text,#102f4b)">Consulta concluída com cobertura parcial.</strong> O Radar encontrou resultados na base interna e/ou no PNCP, mas uma parte da API oficial limitou a consulta. <span>Base local: ${local} • retorno PNCP: ${remote}</span>`
      : `<strong style="color:var(--rlb3-text,#102f4b)">Consulta validada.</strong> Resultados consolidados entre PNCP e base monitorada do Radar. <span>Base local: ${local} • retorno PNCP: ${remote}</span>`;
  }

  window.fetch=async function(input,init){
    const res=await nativeFetch(input,init);
    try{
      const url=typeof input==='string'?input:(input?.url||'');
      if(!url.includes('/api/licitacoes'))return res;
      const clone=res.clone();
      const data=await clone.json().catch(()=>null);
      if(data&&res.ok&&Array.isArray(data.items)){
        lastMeta=data;
        setTimeout(()=>renderMeta(lastMeta),30);
        setTimeout(()=>renderMeta(lastMeta),250);
      }
    }catch{}
    return res;
  };

  document.addEventListener('click',e=>{
    if(e.target.closest('#clearFilters')){
      lastMeta=null;
      const box=document.querySelector('#rlbSearchCoverage');if(box)box.style.display='none';
    }
  },true);

  async function health(){
    try{
      const r=await nativeFetch('/api/search-status',{credentials:'same-origin',headers:{accept:'application/json'}});
      if(!r.ok)return;
      const d=await r.json();
      const states=d?.status?.database?.states||[];
      window.__RLB_SEARCH_HEALTH__=d.status;
      document.documentElement.dataset.rlbSearchReady='true';
      if(states.length)document.documentElement.dataset.rlbSearchStates=String(states.length);
    }catch{}
  }
  function start(){ensureStatus();health();setInterval(health,120000)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
