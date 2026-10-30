(()=>{
  'use strict';
  if(window.__RLB_THEME_FUNCTIONAL_V14__)return;
  window.__RLB_THEME_FUNCTIONAL_V14__=true;

  const STORAGE_KEY='rlb-theme';
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();

  const icons={
    radar:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1.5"/><path d="M12 12 18.2 6.7"/><circle cx="18.2" cy="6.7" r="1.2" fill="currentColor" stroke="none"/></svg>',
    search:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.2"/><path d="m15.2 15.2 4.3 4.3"/><path d="M8 8.5h5M8 11.2h3.6"/></svg>',
    source:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h9l3 3V20H6z"/><path d="M15 3.5v4h3M9 11h6M9 14.5h4.5"/><path d="m9 18 1.7 1.5 3.3-3.5"/></svg>',
    external:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8"/><path d="M18 13v6H5V6h6"/></svg>',
    close:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>'
  };

  function safeTheme(){
    try{const saved=localStorage.getItem(STORAGE_KEY);if(saved==='light'||saved==='dark')return saved}catch{}
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'light';
  }
  function setTheme(theme,persist=true){
    if(theme!=='light'&&theme!=='dark')theme='light';
    document.documentElement.dataset.theme=theme;
    document.body?.setAttribute('data-theme',theme);
    $$('[data-rlb-theme]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.rlbTheme===theme)));
    const meta=$('meta[name="theme-color"]');if(meta)meta.setAttribute('content',theme==='dark'?'#08131E':'#102F4B');
    if(persist){try{localStorage.setItem(STORAGE_KEY,theme)}catch{}}
  }
  function installThemeControl(){
    const top=$('.top'),who=$('#who');if(!top)return;
    let control=$('#rlbThemeControl');
    if(!control){
      control=document.createElement('div');control.id='rlbThemeControl';control.className='rlb-theme-control';control.setAttribute('role','group');control.setAttribute('aria-label','Tema da interface');
      control.innerHTML='<button type="button" data-rlb-theme="light" aria-pressed="false"><span class="rlb-theme-icon">☀</span> Claro</button><button type="button" data-rlb-theme="dark" aria-pressed="false"><span class="rlb-theme-icon">◐</span> Escuro</button>';
      control.addEventListener('click',e=>{const btn=e.target.closest('[data-rlb-theme]');if(btn)setTheme(btn.dataset.rlbTheme,true)});
      if(who)top.insertBefore(control,who);else top.appendChild(control);
    }
    setTheme(safeTheme(),false);
  }

  function openRadar(){const btn=$('.nav [data-view="radar"]');if(btn&&!btn.classList.contains('active'))btn.click()}
  function focusTarget(el,focus){
    if(!el)return;
    el.scrollIntoView({behavior:'smooth',block:'start'});el.classList.remove('rlb-v14-target');void el.offsetWidth;el.classList.add('rlb-v14-target');
    setTimeout(()=>el.classList.remove('rlb-v14-target'),1400);if(focus)setTimeout(()=>focus.focus?.({preventScroll:true}),380);
  }
  function monitor(){
    openRadar();
    const run=()=>{const live=$('#rlbLiveFeed');if(!live)return false;const scope=$('#rlbLiveScope');if(scope){scope.value='all';scope.dispatchEvent(new Event('change',{bubbles:true}))}focusTarget(live);return true};
    if(!run())setTimeout(()=>{if(!run())focusTarget($('#view-radar .stats'))},350);
  }
  function smartSearch(){
    openRadar();
    const input=$('#q')||$('#keyword');const searchBtn=$('#search');const panel=searchBtn?.closest('.rlb-search-panel,.card')||input?.closest('.rlb-search-panel,.card')||searchBtn||input;
    const toggle=$$('#view-radar button').find(b=>norm(b.textContent).includes('mostrar filtros'));
    if(toggle)toggle.click();focusTarget(panel,input);
  }
  function safeUrl(v){try{const u=new URL(String(v||''),location.origin);return /^https?:$/.test(u.protocol)?u.href:''}catch{return''}}
  function pncpUrl(x){
    const direct=safeUrl(x?._pncpUrl||x?.pncp_url||'');if(direct)return direct;
    const cnpj=String(x?.orgaoEntidade?.cnpj||'').replace(/\D/g,'');const year=Number(x?.anoCompra),seq=Number(x?.sequencialCompra);
    return cnpj.length===14&&Number.isInteger(year)&&Number.isInteger(seq)&&seq>0?`https://pncp.gov.br/app/editais/${cnpj}/${year}/${seq}`:'';
  }
  const originUrl=x=>safeUrl(x?._originUrl||x?.linkSistemaOrigem||x?.linkProcessoEletronico||'');
  const city=x=>x?.unidadeOrgao?.municipioNome||x?.unidadeOrgao?.nomeMunicipio||x?.municipioNome||'';

  async function loadSources(){
    const list=$('#rlbV14SourceList'),meta=$('#rlbV14SourceMeta');if(!list)return;
    list.innerHTML='<div class="rlb-v14-empty">Carregando oportunidades monitoradas…</div>';
    try{
      const r=await fetch('/api/live-feed?limit=12',{credentials:'same-origin',headers:{accept:'application/json'},cache:'no-store'});const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||'Não foi possível carregar as fontes oficiais.');
      const rows=Array.isArray(d.items)?d.items:[];const total=Number(d?.status?.total_stored||0);if(meta)meta.textContent=total?`${total.toLocaleString('pt-BR')} registros monitorados na base do Radar`:'Últimas oportunidades monitoradas';
      list.innerHTML=rows.map(x=>{const p=pncpUrl(x),o=originUrl(x),loc=[city(x),String(x?.unidadeOrgao?.ufSigla||x?.ufSigla||'')].filter(Boolean).join(' / ');const mod=String(x?.modalidadeNome||('Modalidade '+(x?._modalidadeConsultada||'não informada')));return `<article class="rlb-v14-source-item"><div class="rlb-v14-source-top"><span>${esc(mod)}</span><small>${esc(loc)}</small></div><strong>${esc(x?.objetoCompra||'Objeto não informado')}</strong><p>${esc(x?.orgaoEntidade?.razaoSocial||'Órgão não informado')}</p><div>${p?`<a href="${esc(p)}" target="_blank" rel="noopener">Validar no PNCP ${icons.external}</a>`:''}${o&&o!==p?`<a class="secondary" href="${esc(o)}" target="_blank" rel="noopener">Portal de origem ${icons.external}</a>`:''}</div></article>`}).join('')||'<div class="rlb-v14-empty">Nenhuma oportunidade monitorada disponível neste momento.</div>';
    }catch(e){list.innerHTML=`<div class="rlb-v14-empty">${esc(e.message||'Falha temporária ao carregar as fontes oficiais.')}</div>`}
  }
  function sources(){openRadar();const panel=$('#rlbV14SourcePanel');if(!panel)return;panel.hidden=false;focusTarget(panel);loadSources()}

  function buildFunctionalCards(){
    const hero=$('#rlbInstitutionalHero');if(!hero)return false;
    $('#rlbUsageGuide')?.remove();$('#rlbFunctionalIntelligenceV12')?.remove();$$('.rlb-command-center').forEach(x=>x.remove());
    let strip=$('#rlbPlatformValue');if(!strip){strip=document.createElement('section');hero.insertAdjacentElement('afterend',strip)}
    strip.id='rlbPlatformValue';strip.className='rlb-platform-value rlb-v14-value';
    strip.innerHTML=`
      <button type="button" class="rlb-v14-card monitor" data-v14-action="monitor"><span class="rlb-v14-icon">${icons.radar}</span><span class="rlb-v14-copy"><strong>Monitoramento ativo</strong><small>O Radar acompanha novas publicações e alimenta o Feed ao Vivo enquanto o serviço está disponível.</small></span><span class="rlb-v14-arrow">→</span></button>
      <button type="button" class="rlb-v14-card search" data-v14-action="search"><span class="rlb-v14-icon">${icons.search}</span><span class="rlb-v14-copy"><strong>Busca inteligente</strong><small>Localize oportunidades por objeto, localidade, modalidade, órgão, fonte e demais critérios.</small></span><span class="rlb-v14-arrow">→</span></button>
      <button type="button" class="rlb-v14-card source" data-v14-action="sources"><span class="rlb-v14-icon">${icons.source}</span><span class="rlb-v14-copy"><strong>Fontes oficiais</strong><small>Acesse o PNCP e, quando informado pelo registro oficial, o portal de origem da contratação.</small></span><span class="rlb-v14-arrow">→</span></button>
      <div id="rlbV14SourcePanel" class="rlb-v14-source-panel" hidden><div class="rlb-v14-panel-head"><div><span>Rastreabilidade oficial</span><strong>Validação das oportunidades monitoradas</strong><small id="rlbV14SourceMeta">Últimos registros do Radar</small></div><div><button type="button" id="rlbV14SourceRefresh">Atualizar</button><button type="button" id="rlbV14SourceClose" aria-label="Fechar">${icons.close}</button></div></div><div id="rlbV14SourceList" class="rlb-v14-source-list"></div></div>`;
    strip.onclick=e=>{const action=e.target.closest('[data-v14-action]')?.dataset.v14Action;if(action==='monitor')monitor();else if(action==='search')smartSearch();else if(action==='sources')sources()};
    $('#rlbV14SourceRefresh',strip).onclick=loadSources;$('#rlbV14SourceClose',strip).onclick=()=>{$('#rlbV14SourcePanel').hidden=true};
    return true;
  }

  function refineCopy(){const hero=$('#rlbInstitutionalHero');if(!hero)return;const eye=hero.querySelector('.rlb-hero-eyebrow'),h=hero.querySelector('h1'),p=hero.querySelector('p');if(eye)eye.innerHTML='<i></i> inteligência para oportunidades públicas';if(h)h.textContent='Descubra, acompanhe e organize oportunidades de contratação pública em um só ambiente.';if(p)p.textContent='Use dados oficiais para pesquisar licitações, acompanhar novas publicações e chegar mais rápido às oportunidades relevantes para sua atuação.'}
  function install(){installThemeControl();refineCopy();buildFunctionalCards()}

  const initial=safeTheme();document.documentElement.dataset.theme=initial;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();