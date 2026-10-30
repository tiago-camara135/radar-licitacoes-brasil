(()=>{
  'use strict';
  if(window.__RLB_V13_CLICK_GUARD__)return;
  window.__RLB_V13_CLICK_GUARD__=true;
  const $=s=>document.querySelector(s);
  const $$=s=>Array.from(document.querySelectorAll(s));
  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
  const openRadar=()=>{const b=$('.nav [data-view="radar"]');if(b&&!b.classList.contains('active'))b.click()};
  const focusTarget=(el,focus)=>{if(!el)return;el.scrollIntoView({behavior:'smooth',block:'start'});el.classList.remove('rlb-v13-target');void el.offsetWidth;el.classList.add('rlb-v13-target');setTimeout(()=>el.classList.remove('rlb-v13-target'),1500);if(focus)setTimeout(()=>focus.focus?.({preventScroll:true}),420)};
  function monitor(){openRadar();const go=()=>{const live=$('#rlbLiveFeed');if(!live)return false;const scope=$('#rlbLiveScope');if(scope){scope.value='all';scope.dispatchEvent(new Event('change',{bubbles:true}))}focusTarget(live);return true};if(go())return;[250,700,1400].forEach(ms=>setTimeout(()=>{if(!go()&&ms===1400)focusTarget($('#view-radar .stats'))},ms))}
  function search(){openRadar();const input=$('#q')||$('#keyword');const btn=$('#search');const panel=btn?.closest('.rlb-search-panel,.card')||input?.closest('.rlb-search-panel,.card')||btn||input;const toggle=$$('#view-radar button').find(b=>norm(b.textContent).includes('mostrar filtros'));if(toggle)toggle.click();focusTarget(panel,input)}
  function sources(){openRadar();const panel=$('#rlbV13Panel');if(!panel)return;panel.hidden=false;focusTarget(panel);setTimeout(()=>$('#rlbV13Refresh')?.click(),0)}
  document.addEventListener('click',e=>{
    const card=e.target.closest?.('#rlbPlatformValue.rlb-v13-value [data-v13]');
    if(!card)return;
    e.preventDefault();e.stopImmediatePropagation();
    const action=card.dataset.v13;
    if(action==='monitor')monitor();else if(action==='search')search();else if(action==='sources')sources();
  },true);
})();