(()=>{
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
  const safeUrl=v=>{try{const u=new URL(String(v||''),location.origin);return /^https?:$/.test(u.protocol)?u.href:''}catch{return''}};
  const icons={
    radar:`<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.8"/><path d="M12 12 18.5 6.8"/><circle cx="18.5" cy="6.8" r="1.35" fill="currentColor" stroke="none"/></svg>`,
    filter:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/><circle cx="8" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="18" r="1.5" fill="currentColor" stroke="none"/></svg>`,
    source:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h11l3 3V19.5H5z"/><path d="M16 4.5v4h3M8 11h8M8 14.5h6"/><path d="m8.5 18 1.7 1.7 3.3-3.7"/></svg>`,
    arrow:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M14 8l4 4-4 4"/></svg>`,
    close:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>`,
    external:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8"/><path d="M18 13v6H5V6h6"/></svg>`
  };

  function openRadarView(){
    const radar=$('.nav [data-view="radar"]');
    if(radar&&!radar.classList.contains('active'))radar.click();
  }
  function highlight(target){
    if(!target)return;
    target.classList.remove('rlb-command-target-pulse');
    void target.offsetWidth;
    target.classList.add('rlb-command-target-pulse');
    setTimeout(()=>target.classList.remove('rlb-command-target-pulse'),1800);
  }
  function scrollToTarget(target,focus){
    if(!target)return;
    target.scrollIntoView({behavior:'smooth',block:'start'});
    highlight(target);
    if(focus)setTimeout(()=>focus.focus?.({preventScroll:true}),500);
  }

  function actionMonitor(){
    openRadarView();
    const live=$('#rlbLiveFeed');
    if(live){
      const scope=$('#rlbLiveScope');if(scope)scope.value='all';
      scope?.dispatchEvent(new Event('change',{bubbles:true}));
      scrollToTarget(live);
      return;
    }
    setTimeout(()=>scrollToTarget($('#rlbLiveFeed')||$('#view-radar .stats')),250);
  }

  function advancedToggle(){
    return $$('button','#view-radar').find(b=>norm(b.textContent).includes('mostrar filtros')||norm(b.textContent).includes('filtros avancados'));
  }
  function actionSearch(){
    openRadarView();
    const search=$('#search');
    const input=$('#q')||$('#keyword');
    const card=search?.closest('.card')||input?.closest('.card')||search||input;
    const toggle=advancedToggle();
    if(toggle&&norm(toggle.textContent).includes('mostrar'))toggle.click();
    scrollToTarget(card,input);
  }

  function officialPncp(x){
    const ready=safeUrl(x?._pncpUrl||x?.pncp_url||'');
    if(ready)return ready;
    const cnpj=String(x?.orgaoEntidade?.cnpj||'').replace(/\D/g,'');
    const year=Number(x?.anoCompra),seq=Number(x?.sequencialCompra);
    if(cnpj.length===14&&Number.isInteger(year)&&Number.isInteger(seq)&&seq>0)return `https://pncp.gov.br/app/editais/${cnpj}/${year}/${seq}`;
    return '';
  }
  function originUrl(x){return safeUrl(x?._originUrl||x?.linkSistemaOrigem||x?.linkProcessoEletronico||'')}
  function municipality(x){return x?.unidadeOrgao?.municipioNome||x?.unidadeOrgao?.nomeMunicipio||x?.municipioNome||''}
  function traceItem(x){
    const pncp=officialPncp(x),origin=originUrl(x),id=String(x?.numeroControlePNCP||'Registro monitorado pelo Radar');
    const uf=String(x?.unidadeOrgao?.ufSigla||x?.ufSigla||'');
    const city=municipality(x);
    const org=String(x?.orgaoEntidade?.razaoSocial||'Órgão não informado');
    const modality=String(x?.modalidadeNome||('Modalidade '+(x?._modalidadeConsultada||'não informada')));
    const object=String(x?.objetoCompra||'Objeto não informado');
    return `<article class="rlb-trace-item">
      <div class="rlb-trace-item-head"><span>${esc(modality)}</span><code>${esc(id)}</code></div>
      <h4>${esc(object)}</h4>
      <p>${esc(org)}${city||uf?' • '+esc([city,uf].filter(Boolean).join(' / ')):''}</p>
      <div class="rlb-trace-actions">
        ${pncp?`<a href="${esc(pncp)}" target="_blank" rel="noopener">Validar no PNCP ${icons.external}</a>`:''}
        ${origin&&origin!==pncp?`<a class="secondary" href="${esc(origin)}" target="_blank" rel="noopener">Portal de origem ${icons.external}</a>`:''}
      </div>
    </article>`;
  }

  async function loadTraceability(){
    const list=$('#rlbTraceList'),meta=$('#rlbTraceMeta');
    if(!list)return;
    list.innerHTML='<div class="rlb-trace-loading">Carregando registros monitorados...</div>';
    try{
      const r=await fetch('/api/live-feed?limit=12',{credentials:'same-origin',headers:{accept:'application/json'},cache:'no-store'});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||'Não foi possível carregar a rastreabilidade.');
      const items=Array.isArray(d.items)?d.items:[];
      list.innerHTML=items.map(traceItem).join('')||'<div class="rlb-trace-empty">Nenhuma oportunidade monitorada disponível neste momento.</div>';
      if(meta){
        const stored=Number(d?.status?.total_stored||0);
        meta.textContent=stored?`${stored.toLocaleString('pt-BR')} registros monitorados • links oficiais preservados`:'Registros do monitor do Radar com origem oficial preservada';
      }
    }catch(e){
      list.innerHTML=`<div class="rlb-trace-empty">${esc(e.message||'Falha temporária ao carregar os registros.')}</div>`;
    }
  }
  function actionTrace(){
    openRadarView();
    const panel=$('#rlbTracePanel');if(!panel)return;
    panel.hidden=false;
    panel.setAttribute('aria-hidden','false');
    scrollToTarget(panel);
    loadTraceability();
  }
  function closeTrace(){const panel=$('#rlbTracePanel');if(panel){panel.hidden=true;panel.setAttribute('aria-hidden','true')}}

  function runAction(action){
    if(action==='monitor')actionMonitor();
    else if(action==='search')actionSearch();
    else if(action==='trace')actionTrace();
  }
  function bindAction(el,action){
    if(!el)return;
    el.dataset.commandAction=action;
    el.setAttribute('role','button');
    el.setAttribute('tabindex','0');
    el.addEventListener('click',e=>{if(e.target.closest('a,button,input,select,textarea'))return;runAction(action)});
    el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();runAction(action)}});
  }

  function upgradeStrip(){
    const old=$('#rlbPlatformValue');
    const hero=$('#rlbInstitutionalHero');
    if(!hero)return;

    const section=document.createElement('section');
    section.id='rlbPlatformValue';
    section.className='rlb-command-center';
    section.innerHTML=`
      <div class="rlb-command-head">
        <div class="rlb-command-heading">
          <span class="rlb-command-eyebrow"><i></i> Central de inteligência</span>
          <h2>Informação pública organizada para decisões mais rápidas.</h2>
          <p>Monitoramento, pesquisa e validação reunidos em uma única camada operacional do Radar.</p>
        </div>
        <div class="rlb-command-state" id="rlbCommandMonitorState" aria-label="Abrir monitoramento ao vivo">
          <span class="rlb-command-state-dot"></span>
          <div><strong>Monitoramento ativo</strong><small>Abrir Feed ao Vivo</small></div>
        </div>
      </div>

      <div class="rlb-command-grid">
        <article class="rlb-command-card rlb-command-card--primary" id="rlbCommandMonitor" aria-label="Abrir monitoramento contínuo e Feed ao Vivo">
          <div class="rlb-command-radar-art" aria-hidden="true">
            <span class="ring r1"></span><span class="ring r2"></span><span class="ring r3"></span>
            <span class="beam"></span><span class="target t1"></span><span class="target t2"></span><span class="target t3"></span>
          </div>
          <div class="rlb-command-card-top">
            <span class="rlb-command-icon">${icons.radar}</span>
            <span class="rlb-command-tag">PNCP</span>
          </div>
          <div class="rlb-command-card-copy">
            <span class="rlb-command-kicker">Monitoramento contínuo</span>
            <h3>Novas oportunidades acompanhadas em uma visão central.</h3>
            <p>Abra o Feed ao Vivo para acompanhar as publicações identificadas pelo monitor e reduzir pesquisas manuais repetitivas.</p>
          </div>
          <div class="rlb-command-card-foot">
            <span><i></i> Novas publicações</span>
            <span><i></i> Visão nacional</span>
            <span><i></i> Acompanhamento automatizado</span>
          </div>
          <div class="rlb-command-cta">Abrir monitoramento <span>${icons.arrow}</span></div>
        </article>

        <article class="rlb-command-card rlb-command-card--secondary" id="rlbCommandSearch" aria-label="Abrir inteligência de busca e filtros avançados">
          <div class="rlb-command-card-top">
            <span class="rlb-command-icon blue">${icons.filter}</span>
            <span class="rlb-command-index">01</span>
          </div>
          <div class="rlb-command-card-copy">
            <span class="rlb-command-kicker">Inteligência de busca</span>
            <h3>Filtros profissionais para chegar ao que realmente importa.</h3>
            <p>Refine por objeto, localidade, órgão, modalidade, fonte, situação, valores e período.</p>
          </div>
          <div class="rlb-command-link">Abrir pesquisa segmentada <span>${icons.arrow}</span></div>
        </article>

        <article class="rlb-command-card rlb-command-card--secondary" id="rlbCommandTrace" aria-label="Abrir painel de rastreabilidade e validação de fontes">
          <div class="rlb-command-card-top">
            <span class="rlb-command-icon gold">${icons.source}</span>
            <span class="rlb-command-index">02</span>
          </div>
          <div class="rlb-command-card-copy">
            <span class="rlb-command-kicker">Rastreabilidade</span>
            <h3>Origem oficial preservada em cada oportunidade consultada.</h3>
            <p>Valide registros recentes no PNCP e, quando disponível, avance diretamente ao portal oficial informado pelo órgão.</p>
          </div>
          <div class="rlb-command-link">Abrir validação da fonte <span>${icons.arrow}</span></div>
        </article>
      </div>

      <div id="rlbTracePanel" class="rlb-trace-panel" hidden aria-hidden="true">
        <div class="rlb-trace-head">
          <div><span class="rlb-command-kicker">Rastreabilidade oficial</span><h3>Validação de fontes das oportunidades monitoradas</h3><p id="rlbTraceMeta">Carregue registros recentes para conferir a origem oficial.</p></div>
          <div class="rlb-trace-head-actions"><button type="button" id="rlbTraceRefresh">Atualizar registros</button><button type="button" id="rlbTraceClose" aria-label="Fechar painel">${icons.close}</button></div>
        </div>
        <div id="rlbTraceList" class="rlb-trace-list"></div>
      </div>

      <div class="rlb-command-footer">
        <span>Radar de Licitações Brasil</span>
        <div class="rlb-command-flow" aria-label="Fluxo operacional">
          <button type="button" data-flow="monitor">Monitorar</button><i></i><button type="button" data-flow="search">Refinar</button><i></i><button type="button" data-flow="trace">Validar</button>
        </div>
        <small>Fluxo de trabalho orientado por dados oficiais</small>
      </div>`;

    if(old)old.replaceWith(section);else hero.insertAdjacentElement('afterend',section);
    bindAction($('#rlbCommandMonitor',section),'monitor');
    bindAction($('#rlbCommandSearch',section),'search');
    bindAction($('#rlbCommandTrace',section),'trace');
    bindAction($('#rlbCommandMonitorState',section),'monitor');
    $$('[data-flow]',section).forEach(b=>b.addEventListener('click',()=>runAction(b.dataset.flow)));
    $('#rlbTraceRefresh',section)?.addEventListener('click',loadTraceability);
    $('#rlbTraceClose',section)?.addEventListener('click',closeTrace);
  }

  function install(){upgradeStrip()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();