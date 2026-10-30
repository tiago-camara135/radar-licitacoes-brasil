(()=>{
  'use strict';
  if(window.__RLB_INTELLIGENCE_V12__)return;
  window.__RLB_INTELLIGENCE_V12__=true;

  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();

  const icons={
    radar:`<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.8"/><circle cx="12" cy="12" r="1.7"/><path d="M12 12 18.2 6.8"/><circle cx="18.2" cy="6.8" r="1.2" fill="currentColor" stroke="none"/></svg>`,
    search:`<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.2"/><path d="m15.2 15.2 4.3 4.3"/><path d="M8 8.4h5M8 11h3.7"/></svg>`,
    source:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h9l3 3V20H6z"/><path d="M15 3.5v4h3M9 11h6M9 14.5h4.5"/><path d="m9 18 1.7 1.5 3.3-3.5"/></svg>`,
    external:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8"/><path d="M18 13v6H5V6h6"/></svg>`,
    close:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>`
  };

  function openRadar(){
    const radar=$('.nav [data-view="radar"]');
    if(radar&&!radar.classList.contains('active'))radar.click();
  }
  function pulse(el){
    if(!el)return;
    el.classList.remove('rlb-v12-pulse');void el.offsetWidth;el.classList.add('rlb-v12-pulse');
    setTimeout(()=>el.classList.remove('rlb-v12-pulse'),1500);
  }
  function go(el,focus){
    if(!el)return;
    el.scrollIntoView({behavior:'smooth',block:'start'});pulse(el);
    if(focus)setTimeout(()=>focus.focus?.({preventScroll:true}),420);
  }

  function actionMonitor(){
    openRadar();
    const live=$('#rlbLiveFeed');
    if(live){
      const scope=$('#rlbLiveScope');
      if(scope){scope.value='all';scope.dispatchEvent(new Event('change',{bubbles:true}))}
      go(live);return;
    }
    setTimeout(()=>go($('#rlbLiveFeed')||$('#view-radar .stats')),350);
  }

  function actionSearch(){
    openRadar();
    const input=$('#q')||$('#keyword');
    const search=$('#search');
    const panel=search?.closest('.rlb-search-panel,.card')||input?.closest('.rlb-search-panel,.card')||search||input;
    const toggle=$$('#view-radar button').find(b=>norm(b.textContent).includes('mostrar filtros'));
    if(toggle)toggle.click();
    go(panel,input);
  }

  function safeUrl(v){try{const u=new URL(String(v||''),location.origin);return /^https?:$/.test(u.protocol)?u.href:''}catch{return''}}
  function pncpUrl(x){
    const direct=safeUrl(x?._pncpUrl||x?.pncp_url||'');if(direct)return direct;
    const cnpj=String(x?.orgaoEntidade?.cnpj||'').replace(/\D/g,'');
    const year=Number(x?.anoCompra),seq=Number(x?.sequencialCompra);
    return cnpj.length===14&&Number.isInteger(year)&&Number.isInteger(seq)&&seq>0?`https://pncp.gov.br/app/editais/${cnpj}/${year}/${seq}`:'';
  }
  function originUrl(x){return safeUrl(x?._originUrl||x?.linkSistemaOrigem||x?.linkProcessoEletronico||'')}
  function municipality(x){return x?.unidadeOrgao?.municipioNome||x?.unidadeOrgao?.nomeMunicipio||x?.municipioNome||''}

  async function loadSources(){
    const list=$('#rlbV12SourceList'),meta=$('#rlbV12SourceMeta');
    if(!list)return;
    list.innerHTML='<div class="rlb-v12-empty">Carregando oportunidades monitoradas…</div>';
    try{
      const r=await fetch('/api/live-feed?limit=10',{credentials:'same-origin',headers:{accept:'application/json'},cache:'no-store'});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||'Não foi possível carregar as fontes oficiais.');
      const items=Array.isArray(d.items)?d.items:[];
      if(meta){
        const total=Number(d?.status?.total_stored||0);
        meta.textContent=total?`${total.toLocaleString('pt-BR')} registros monitorados na base do Radar`:'Últimas oportunidades monitoradas pelo Radar';
      }
      list.innerHTML=items.map(x=>{
        const pncp=pncpUrl(x),origin=originUrl(x),obj=String(x?.objetoCompra||'Objeto não informado'),org=String(x?.orgaoEntidade?.razaoSocial||'Órgão não informado');
        const city=municipality(x),uf=String(x?.unidadeOrgao?.ufSigla||x?.ufSigla||'');
        const mod=String(x?.modalidadeNome||('Modalidade '+(x?._modalidadeConsultada||'não informada')));
        return `<article class="rlb-v12-source-item"><div class="rlb-v12-source-top"><span>${esc(mod)}</span><small>${esc([city,uf].filter(Boolean).join(' / '))}</small></div><strong>${esc(obj)}</strong><p>${esc(org)}</p><div>${pncp?`<a href="${esc(pncp)}" target="_blank" rel="noopener">Validar no PNCP ${icons.external}</a>`:''}${origin&&origin!==pncp?`<a class="secondary" href="${esc(origin)}" target="_blank" rel="noopener">Portal de origem ${icons.external}</a>`:''}</div></article>`;
      }).join('')||'<div class="rlb-v12-empty">Nenhuma oportunidade monitorada disponível neste momento.</div>';
    }catch(e){list.innerHTML=`<div class="rlb-v12-empty">${esc(e.message||'Falha temporária ao carregar as fontes.')}</div>`}
  }

  function actionSources(){
    openRadar();
    const panel=$('#rlbV12SourcePanel');if(!panel)return;
    panel.hidden=false;panel.setAttribute('aria-hidden','false');go(panel);loadSources();
  }
  function closeSources(){const panel=$('#rlbV12SourcePanel');if(panel){panel.hidden=true;panel.setAttribute('aria-hidden','true')}}

  function hideLegacy(){
    $('#rlbPlatformValue')?.setAttribute('data-rlb-v12-hidden','1');
    const stats=$('#view-radar .stats');if(!stats)return;
    const labels=['monitoramento ativo','busca inteligente','fontes oficiais','inteligencia de busca','rastreabilidade'];
    let node=stats.previousElementSibling;
    let hops=0;
    while(node&&hops<5){
      if(node.id!=='rlbFunctionalIntelligenceV12'&&node.id!=='rlbSystemStrip'){
        const t=norm(node.textContent);const hits=labels.filter(x=>t.includes(x)).length;
        if(hits>=2)node.setAttribute('data-rlb-v12-hidden','1');
      }
      node=node.previousElementSibling;hops++;
    }
  }

  function build(){
    const view=$('#view-radar'),stats=view?.querySelector('.stats');if(!view||!stats)return false;
    hideLegacy();
    let strip=$('#rlbFunctionalIntelligenceV12');
    if(!strip){
      strip=document.createElement('section');
      strip.id='rlbFunctionalIntelligenceV12';
      strip.className='rlb-v12-strip';
      strip.setAttribute('aria-label','Recursos de inteligência do Radar');
      strip.innerHTML=`
        <button type="button" class="rlb-v12-card monitor" data-rlb-v12-action="monitor">
          <span class="rlb-v12-icon">${icons.radar}</span><span class="rlb-v12-copy"><strong>Monitoramento ativo</strong><small>Acompanhe novas publicações e abra o Feed ao Vivo do Radar.</small></span><span class="rlb-v12-arrow">→</span>
        </button>
        <button type="button" class="rlb-v12-card search" data-rlb-v12-action="search">
          <span class="rlb-v12-icon">${icons.search}</span><span class="rlb-v12-copy"><strong>Busca inteligente</strong><small>Pesquise por objeto, localidade, modalidade, órgão, fonte e outros filtros.</small></span><span class="rlb-v12-arrow">→</span>
        </button>
        <button type="button" class="rlb-v12-card source" data-rlb-v12-action="sources">
          <span class="rlb-v12-icon">${icons.source}</span><span class="rlb-v12-copy"><strong>Fontes oficiais</strong><small>Valide oportunidades no PNCP e, quando disponível, no portal de origem.</small></span><span class="rlb-v12-arrow">→</span>
        </button>
        <div id="rlbV12SourcePanel" class="rlb-v12-source-panel" hidden aria-hidden="true">
          <div class="rlb-v12-panel-head"><div><span>Rastreabilidade oficial</span><strong>Validação das oportunidades monitoradas</strong><small id="rlbV12SourceMeta">Últimos registros do Radar</small></div><div><button type="button" id="rlbV12SourceRefresh">Atualizar</button><button type="button" id="rlbV12SourceClose" aria-label="Fechar">${icons.close}</button></div></div>
          <div id="rlbV12SourceList" class="rlb-v12-source-list"></div>
        </div>`;
      stats.insertAdjacentElement('beforebegin',strip);
      strip.addEventListener('click',e=>{
        const action=e.target.closest('[data-rlb-v12-action]')?.dataset.rlbV12Action;
        if(action==='monitor')actionMonitor();else if(action==='search')actionSearch();else if(action==='sources')actionSources();
      });
      $('#rlbV12SourceRefresh',strip)?.addEventListener('click',loadSources);
      $('#rlbV12SourceClose',strip)?.addEventListener('click',closeSources);
    }else if(strip.nextElementSibling!==stats){stats.insertAdjacentElement('beforebegin',strip)}
    return true;
  }

  function install(){
    build();
    [150,500,1200,2500,5000].forEach(ms=>setTimeout(()=>{build();hideLegacy()},ms));
    const view=$('#view-radar');
    if(view)new MutationObserver(()=>{build();hideLegacy()}).observe(view,{childList:true,subtree:false});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();