(()=>{
  'use strict';
  if(window.__RLB_INTELLIGENCE_V13__)return;
  window.__RLB_INTELLIGENCE_V13__=true;

  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();

  const icon={
    radar:`<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1.5"/><path d="M12 12 18.4 6.8"/><circle cx="18.4" cy="6.8" r="1.2" fill="currentColor" stroke="none"/></svg>`,
    search:`<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.1"/><path d="m15.1 15.1 4.5 4.5"/><path d="M7.6 8.5h5.5M7.6 11.3h4"/></svg>`,
    source:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h9l3 3V20H6z"/><path d="M15 3.5v4h3M9 11h6M9 14.5h4.5"/><path d="m9 18 1.7 1.5 3.3-3.5"/></svg>`,
    external:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8"/><path d="M18 13v6H5V6h6"/></svg>`,
    close:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>`
  };

  function installStyle(){
    let style=$('#rlb-v13-runtime-style');
    if(style)style.remove();
    style=document.createElement('style');
    style.id='rlb-v13-runtime-style';
    style.textContent=`
      #rlbFunctionalIntelligenceV12,.rlb-command-center[data-rlb-obsolete="1"]{display:none!important}
      #rlbPlatformValue.rlb-v13-value{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:10px!important;margin:0 0 16px!important;position:relative!important;z-index:4!important}
      #rlbPlatformValue.rlb-v13-value .rlb-v13-card{appearance:none!important;width:100%!important;min-width:0!important;min-height:92px!important;display:grid!important;grid-template-columns:48px minmax(0,1fr) 28px!important;align-items:center!important;gap:12px!important;padding:14px 15px!important;border:1px solid var(--rlb3-line,#243746)!important;border-radius:13px!important;background:var(--rlb3-surface,#0f1d29)!important;color:var(--rlb3-text,#edf6fb)!important;text-align:left!important;cursor:pointer!important;box-shadow:0 8px 22px rgba(17,49,74,.045)!important;transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease!important;font:inherit!important}
      #rlbPlatformValue.rlb-v13-value .rlb-v13-card:hover{transform:translateY(-2px)!important;box-shadow:0 12px 28px rgba(3,13,24,.12)!important}
      #rlbPlatformValue.rlb-v13-value .rlb-v13-card:focus-visible{outline:none!important;box-shadow:0 0 0 3px rgba(0,102,255,.22),0 12px 28px rgba(3,13,24,.12)!important}
      #rlbPlatformValue.rlb-v13-value .rlb-v13-icon{width:48px!important;height:48px!important;display:grid!important;place-items:center!important;border-radius:12px!important;flex:none!important;line-height:1!important}
      #rlbPlatformValue.rlb-v13-value .rlb-v13-card.monitor .rlb-v13-icon{color:#60a5fa!important;background:rgba(59,130,246,.12)!important;border:1px solid rgba(96,165,250,.34)!important}
      #rlbPlatformValue.rlb-v13-value .rlb-v13-card.search .rlb-v13-icon{color:#34d399!important;background:rgba(16,185,129,.12)!important;border:1px solid rgba(52,211,153,.34)!important}
      #rlbPlatformValue.rlb-v13-value .rlb-v13-card.source .rlb-v13-icon{color:#fbbf24!important;background:rgba(245,158,11,.12)!important;border:1px solid rgba(251,191,36,.34)!important}
      #rlbPlatformValue.rlb-v13-value .rlb-v13-icon svg{display:block!important;width:24px!important;height:24px!important;min-width:24px!important;min-height:24px!important;max-width:24px!important;max-height:24px!important;fill:none!important;stroke:currentColor!important;stroke-width:1.8!important;stroke-linecap:round!important;stroke-linejoin:round!important;overflow:visible!important;transform:none!important;position:static!important}
      #rlbPlatformValue.rlb-v13-value .rlb-v13-copy{display:block!important;min-width:0!important;color:inherit!important}
      #rlbPlatformValue.rlb-v13-value .rlb-v13-copy strong{display:block!important;margin:0 0 4px!important;color:inherit!important;font-family:var(--v6-heading,"Outfit",sans-serif)!important;font-size:12px!important;line-height:1.25!important;font-weight:800!important;letter-spacing:-.01em!important}
      #rlbPlatformValue.rlb-v13-value .rlb-v13-copy small{display:block!important;margin:0!important;color:var(--rlb3-muted,#8fa5b4)!important;font-family:var(--v6-font,"Plus Jakarta Sans",sans-serif)!important;font-size:9.6px!important;line-height:1.5!important;font-weight:500!important}
      #rlbPlatformValue.rlb-v13-value .rlb-v13-arrow{display:grid!important;place-items:center!important;width:28px!important;height:28px!important;border-radius:8px!important;background:var(--rlb3-surface-soft,#122330)!important;color:var(--rlb3-muted,#8fa5b4)!important;font-size:14px!important;font-weight:900!important;line-height:1!important;transition:transform .16s ease,color .16s ease!important}
      #rlbPlatformValue.rlb-v13-value .rlb-v13-card:hover .rlb-v13-arrow{transform:translateX(2px)!important;color:var(--rlb3-text,#edf6fb)!important}
      #rlbPlatformValue.rlb-v13-value .rlb-v13-panel{grid-column:1/-1!important;padding:15px!important;border:1px solid var(--rlb3-line,#243746)!important;border-radius:13px!important;background:var(--rlb3-surface,#0f1d29)!important;box-shadow:0 10px 28px rgba(3,13,24,.10)!important}
      #rlbPlatformValue.rlb-v13-value .rlb-v13-panel[hidden]{display:none!important}
      #rlbPlatformValue.rlb-v13-value .rlb-v13-panel-head{display:flex!important;justify-content:space-between!important;gap:14px!important;align-items:flex-start!important;padding-bottom:11px!important;border-bottom:1px solid var(--rlb3-line,#243746)!important}
      #rlbPlatformValue.rlb-v13-value .rlb-v13-panel-title{display:grid!important;gap:3px!important}
      #rlbPlatformValue.rlb-v13-value .rlb-v13-panel-title span{color:#f59e0b!important;font:700 8px/1.2 var(--v6-mono,"JetBrains Mono",monospace)!important;text-transform:uppercase!important;letter-spacing:.09em!important}
      #rlbPlatformValue.rlb-v13-value .rlb-v13-panel-title strong{color:var(--rlb3-text,#edf6fb)!important;font:800 14px/1.3 var(--v6-heading,"Outfit",sans-serif)!important}
      #rlbPlatformValue.rlb-v13-value .rlb-v13-panel-title small{color:var(--rlb3-muted,#8fa5b4)!important;font-size:9px!important}
      #rlbPlatformValue.rlb-v13-value .rlb-v13-panel-actions{display:flex!important;gap:7px!important}
      #rlbPlatformValue.rlb-v13-value .rlb-v13-panel-actions button{min-height:34px!important;padding:0 10px!important;border:1px solid var(--rlb3-line,#243746)!important;border-radius:8px!important;background:var(--rlb3-surface-soft,#122330)!important;color:var(--rlb3-text-2,#c6d7e1)!important;cursor:pointer!important;font-size:9px!important;font-weight:800!important}
      #rlbPlatformValue.rlb-v13-value .rlb-v13-panel-actions button:last-child{width:34px!important;padding:0!important;display:grid!important;place-items:center!important}
      #rlbPlatformValue.rlb-v13-value .rlb-v13-panel-actions svg{width:14px!important;height:14px!important;fill:none!important;stroke:currentColor!important;stroke-width:1.8!important}
      #rlbPlatformValue.rlb-v13-value .rlb-v13-list{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:9px!important;margin-top:11px!important;max-height:420px!important;overflow:auto!important}
      #rlbPlatformValue.rlb-v13-value .rlb-v13-item{padding:11px!important;border:1px solid var(--rlb3-line,#243746)!important;border-radius:10px!important;background:var(--rlb3-surface-soft,#122330)!important}
      #rlbPlatformValue.rlb-v13-value .rlb-v13-item-top{display:flex!important;justify-content:space-between!important;gap:8px!important;align-items:center!important;margin-bottom:6px!important}
      #rlbPlatformValue.rlb-v13-value .rlb-v13-item-top span{padding:4px 7px!important;border-radius:999px!important;background:rgba(59,130,246,.10)!important;color:#60a5fa!important;font-size:7.8px!important;font-weight:800!important}
      #rlbPlatformValue.rlb-v13-value .rlb-v13-item-top small{color:var(--rlb3-muted,#8fa5b4)!important;font-size:7.8px!important}
      #rlbPlatformValue.rlb-v13-value .rlb-v13-item>strong{display:block!important;color:var(--rlb3-text,#edf6fb)!important;font-size:10.4px!important;line-height:1.42!important}
      #rlbPlatformValue.rlb-v13-value .rlb-v13-item>p{margin:5px 0 0!important;color:var(--rlb3-muted,#8fa5b4)!important;font-size:8.5px!important;line-height:1.4!important}
      #rlbPlatformValue.rlb-v13-value .rlb-v13-links{display:flex!important;gap:7px!important;flex-wrap:wrap!important;margin-top:9px!important}
      #rlbPlatformValue.rlb-v13-value .rlb-v13-links a{display:inline-flex!important;align-items:center!important;gap:5px!important;padding:7px 8px!important;border-radius:8px!important;border:1px solid rgba(245,158,11,.28)!important;background:rgba(245,158,11,.08)!important;color:#fbbf24!important;font-size:8px!important;font-weight:800!important;text-decoration:none!important}
      #rlbPlatformValue.rlb-v13-value .rlb-v13-links a.secondary{border-color:var(--rlb3-line,#243746)!important;background:var(--rlb3-surface,#0f1d29)!important;color:var(--rlb3-text-2,#c6d7e1)!important}
      #rlbPlatformValue.rlb-v13-value .rlb-v13-links svg{width:11px!important;height:11px!important;fill:none!important;stroke:currentColor!important;stroke-width:1.8!important}
      #rlbPlatformValue.rlb-v13-value .rlb-v13-empty{grid-column:1/-1!important;padding:18px!important;border:1px dashed var(--rlb3-line,#243746)!important;border-radius:10px!important;color:var(--rlb3-muted,#8fa5b4)!important;text-align:center!important;font-size:9px!important;background:var(--rlb3-surface-soft,#122330)!important}
      .rlb-v13-target{animation:rlbV13Target 1.5s ease!important}@keyframes rlbV13Target{0%{box-shadow:0 0 0 0 rgba(59,130,246,.28)}40%{box-shadow:0 0 0 6px rgba(59,130,246,.11)}100%{box-shadow:0 0 0 0 transparent}}
      html:not([data-theme="dark"]) #rlbPlatformValue.rlb-v13-value .rlb-v13-card,html:not([data-theme="dark"]) #rlbPlatformValue.rlb-v13-value .rlb-v13-panel{background:#fff!important;color:#0f172a!important}
      html:not([data-theme="dark"]) #rlbPlatformValue.rlb-v13-value .rlb-v13-copy small,html:not([data-theme="dark"]) #rlbPlatformValue.rlb-v13-value .rlb-v13-panel-title small,html:not([data-theme="dark"]) #rlbPlatformValue.rlb-v13-value .rlb-v13-item>p,html:not([data-theme="dark"]) #rlbPlatformValue.rlb-v13-value .rlb-v13-item-top small{color:#64748b!important}
      html:not([data-theme="dark"]) #rlbPlatformValue.rlb-v13-value .rlb-v13-item{background:#f8fafc!important}
      @media(max-width:900px){#rlbPlatformValue.rlb-v13-value{grid-template-columns:1fr!important}#rlbPlatformValue.rlb-v13-value .rlb-v13-panel{grid-column:1!important}}
      @media(max-width:760px){#rlbPlatformValue.rlb-v13-value .rlb-v13-card{grid-template-columns:44px minmax(0,1fr) 24px!important;min-height:84px!important;padding:12px!important}#rlbPlatformValue.rlb-v13-value .rlb-v13-icon{width:44px!important;height:44px!important}#rlbPlatformValue.rlb-v13-value .rlb-v13-list{grid-template-columns:1fr!important;max-height:none!important}#rlbPlatformValue.rlb-v13-value .rlb-v13-panel-head{flex-direction:column!important}}
    `;
    document.head.appendChild(style);
  }

  function openRadar(){
    const btn=$('.nav [data-view="radar"]');
    if(btn&&!btn.classList.contains('active'))btn.click();
  }
  function target(el,focus){
    if(!el)return;
    el.scrollIntoView({behavior:'smooth',block:'start'});
    el.classList.remove('rlb-v13-target');void el.offsetWidth;el.classList.add('rlb-v13-target');
    setTimeout(()=>el.classList.remove('rlb-v13-target'),1500);
    if(focus)setTimeout(()=>focus.focus?.({preventScroll:true}),420);
  }
  function monitor(){
    openRadar();
    const run=()=>{
      const live=$('#rlbLiveFeed');
      if(!live)return false;
      const scope=$('#rlbLiveScope');if(scope){scope.value='all';scope.dispatchEvent(new Event('change',{bubbles:true}))}
      target(live);return true;
    };
    if(run())return;
    [250,700,1400].forEach(ms=>setTimeout(()=>{if(!run()&&ms===1400)target($('#view-radar .stats'))},ms));
  }
  function search(){
    openRadar();
    const input=$('#q')||$('#keyword');
    const searchBtn=$('#search');
    const panel=searchBtn?.closest('.rlb-search-panel,.card')||input?.closest('.rlb-search-panel,.card')||searchBtn||input;
    const toggle=$$('#view-radar button').find(b=>norm(b.textContent).includes('mostrar filtros'));
    if(toggle)toggle.click();
    target(panel,input);
  }

  function safeUrl(v){try{const u=new URL(String(v||''),location.origin);return /^https?:$/.test(u.protocol)?u.href:''}catch{return''}}
  function pncpUrl(x){
    const direct=safeUrl(x?._pncpUrl||x?.pncp_url||'');if(direct)return direct;
    const cnpj=String(x?.orgaoEntidade?.cnpj||'').replace(/\D/g,'');
    const year=Number(x?.anoCompra),seq=Number(x?.sequencialCompra);
    return cnpj.length===14&&Number.isInteger(year)&&Number.isInteger(seq)&&seq>0?`https://pncp.gov.br/app/editais/${cnpj}/${year}/${seq}`:'';
  }
  const originUrl=x=>safeUrl(x?._originUrl||x?.linkSistemaOrigem||x?.linkProcessoEletronico||'');
  const city=x=>x?.unidadeOrgao?.municipioNome||x?.unidadeOrgao?.nomeMunicipio||x?.municipioNome||'';

  async function loadSources(){
    const list=$('#rlbV13List'),meta=$('#rlbV13Meta');
    if(!list)return;
    list.innerHTML='<div class="rlb-v13-empty">Carregando oportunidades monitoradas…</div>';
    try{
      const r=await fetch('/api/live-feed?limit=10',{credentials:'same-origin',headers:{accept:'application/json'},cache:'no-store'});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||'Não foi possível carregar as fontes oficiais.');
      const rows=Array.isArray(d.items)?d.items:[];
      const total=Number(d?.status?.total_stored||0);
      if(meta)meta.textContent=total?`${total.toLocaleString('pt-BR')} registros monitorados na base do Radar`:'Últimas oportunidades monitoradas pelo Radar';
      list.innerHTML=rows.map(x=>{
        const p=pncpUrl(x),o=originUrl(x),loc=[city(x),String(x?.unidadeOrgao?.ufSigla||x?.ufSigla||'')].filter(Boolean).join(' / ');
        const mod=String(x?.modalidadeNome||('Modalidade '+(x?._modalidadeConsultada||'não informada')));
        return `<article class="rlb-v13-item"><div class="rlb-v13-item-top"><span>${esc(mod)}</span><small>${esc(loc)}</small></div><strong>${esc(x?.objetoCompra||'Objeto não informado')}</strong><p>${esc(x?.orgaoEntidade?.razaoSocial||'Órgão não informado')}</p><div class="rlb-v13-links">${p?`<a href="${esc(p)}" target="_blank" rel="noopener">Validar no PNCP ${icon.external}</a>`:''}${o&&o!==p?`<a class="secondary" href="${esc(o)}" target="_blank" rel="noopener">Portal de origem ${icon.external}</a>`:''}</div></article>`;
      }).join('')||'<div class="rlb-v13-empty">Nenhuma oportunidade monitorada disponível neste momento.</div>';
    }catch(e){list.innerHTML=`<div class="rlb-v13-empty">${esc(e.message||'Falha temporária ao carregar as fontes oficiais.')}</div>`}
  }
  function sources(){
    openRadar();
    const panel=$('#rlbV13Panel');if(!panel)return;
    panel.hidden=false;target(panel);loadSources();
  }

  function build(){
    const hero=$('#rlbInstitutionalHero'),view=$('#view-radar');
    if(!hero||!view)return false;
    $('#rlbFunctionalIntelligenceV12')?.remove();
    $$('.rlb-command-center').forEach(x=>{if(x.id!=='rlbPlatformValue')x.remove()});
    let section=$('#rlbPlatformValue');
    if(!section){section=document.createElement('section');hero.insertAdjacentElement('afterend',section)}
    section.id='rlbPlatformValue';
    section.className='rlb-platform-value rlb-v13-value';
    section.removeAttribute('data-rlb-v12-hidden');
    section.innerHTML=`
      <button type="button" class="rlb-v13-card monitor" data-v13="monitor" aria-label="Abrir monitoramento ativo e Feed ao Vivo"><span class="rlb-v13-icon">${icon.radar}</span><span class="rlb-v13-copy"><strong>Monitoramento ativo</strong><small>O Radar acompanha novas publicações e alimenta o Feed ao Vivo enquanto o serviço está disponível.</small></span><span class="rlb-v13-arrow" aria-hidden="true">→</span></button>
      <button type="button" class="rlb-v13-card search" data-v13="search" aria-label="Abrir busca inteligente e filtros"><span class="rlb-v13-icon">${icon.search}</span><span class="rlb-v13-copy"><strong>Busca inteligente</strong><small>Localize oportunidades por objeto, localidade, modalidade, órgão, fonte e demais critérios.</small></span><span class="rlb-v13-arrow" aria-hidden="true">→</span></button>
      <button type="button" class="rlb-v13-card source" data-v13="sources" aria-label="Abrir fontes oficiais e rastreabilidade"><span class="rlb-v13-icon">${icon.source}</span><span class="rlb-v13-copy"><strong>Fontes oficiais</strong><small>Acesse o PNCP e, quando informado pelo registro oficial, o portal de origem da contratação.</small></span><span class="rlb-v13-arrow" aria-hidden="true">→</span></button>
      <div id="rlbV13Panel" class="rlb-v13-panel" hidden><div class="rlb-v13-panel-head"><div class="rlb-v13-panel-title"><span>Rastreabilidade oficial</span><strong>Validação das oportunidades monitoradas</strong><small id="rlbV13Meta">Últimos registros monitorados pelo Radar</small></div><div class="rlb-v13-panel-actions"><button type="button" id="rlbV13Refresh">Atualizar</button><button type="button" id="rlbV13Close" aria-label="Fechar painel">${icon.close}</button></div></div><div id="rlbV13List" class="rlb-v13-list"></div></div>`;
    section.addEventListener('click',e=>{
      const action=e.target.closest('[data-v13]')?.dataset.v13;
      if(action==='monitor')monitor();else if(action==='search')search();else if(action==='sources')sources();
    });
    $('#rlbV13Refresh',section)?.addEventListener('click',loadSources);
    $('#rlbV13Close',section)?.addEventListener('click',()=>{$('#rlbV13Panel').hidden=true});
    return true;
  }

  function install(){
    installStyle();
    build();
    [200,600,1200,2500].forEach(ms=>setTimeout(build,ms));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();