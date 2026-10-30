(()=>{
  'use strict';
  if(window.__RLB_INTELLIGENCE_SEARCH_BRIDGE__)return;
  window.__RLB_INTELLIGENCE_SEARCH_BRIDGE__=true;
  const $=s=>document.querySelector(s);
  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
  function openSearch(){
    const radar=$('.nav [data-view="radar"]');if(radar&&!radar.classList.contains('active'))radar.click();
    const buttons=Array.from(document.querySelectorAll('#view-radar button'));
    const toggle=buttons.find(b=>norm(b.textContent).includes('mostrar filtros'));
    if(toggle)toggle.click();
    const input=$('#q')||$('#keyword');
    const search=$('#search');
    const target=search?.closest('.card')||input?.closest('.card')||search||input;
    if(target){
      target.scrollIntoView({behavior:'smooth',block:'start'});
      target.classList.remove('rlb-command-target-pulse');void target.offsetWidth;target.classList.add('rlb-command-target-pulse');
      setTimeout(()=>target.classList.remove('rlb-command-target-pulse'),1800);
    }
    setTimeout(()=>input?.focus?.({preventScroll:true}),450);
  }
  document.addEventListener('click',e=>{
    const t=e.target.closest('#rlbCommandSearch,[data-flow="search"]');
    if(!t)return;
    e.preventDefault();e.stopImmediatePropagation();openSearch();
  },true);
  document.addEventListener('keydown',e=>{
    if((e.key!=='Enter'&&e.key!==' ')||!e.target.closest?.('#rlbCommandSearch'))return;
    e.preventDefault();e.stopImmediatePropagation();openSearch();
  },true);
})();