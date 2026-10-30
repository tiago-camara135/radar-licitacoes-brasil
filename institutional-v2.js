(()=>{
  const $=s=>document.querySelector(s);

  function ambientSvg(){
    return `<svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g class="a" stroke-width="2">
        <circle cx="1360" cy="225" r="188"/><circle cx="1360" cy="225" r="132"/><circle cx="1360" cy="225" r="76"/>
        <path d="M1360 225L1494 138"/><circle cx="1494" cy="138" r="7" fill="#d6a21d" fill-opacity=".12" stroke="none"/>
      </g>
      <g class="b" stroke-width="2" transform="translate(115 630)">
        <path d="M0 138h330M28 138V55h274v83M56 55L165 0l109 55M75 75v63M125 75v63M205 75v63M255 75v63"/>
        <path d="M8 151h314"/>
      </g>
      <g class="a" stroke-width="1.7" transform="translate(1040 660)">
        <rect x="0" y="0" width="150" height="195" rx="13"/><path d="M26 42h87M26 68h98M26 94h69M26 120h91"/>
        <circle cx="112" cy="154" r="23"/><path d="M101 154l8 8 16-20"/>
      </g>
      <g class="a" stroke-width="1.5">
        <path d="M120 188C300 88 460 280 642 168S998 100 1122 164"/>
        <circle cx="120" cy="188" r="5"/><circle cx="372" cy="160" r="5"/><circle cx="642" cy="168" r="5"/><circle cx="878" cy="126" r="5"/><circle cx="1122" cy="164" r="5"/>
      </g>
      <path class="c" d="M1510 520c-88 18-152 87-158 174-6 92 54 174 143 199 51 14 91 1 105-6V505c-21 2-52 6-90 15Z"/>
      <path class="d" d="M0 315c74-39 164-31 223 22 54 49 77 130 54 196-27 77-112 131-219 116-22-3-41-8-58-15V315Z"/>
    </svg>`;
  }

  function installAmbient(){
    if($('#rlbAmbientArt'))return;
    const art=document.createElement('div');
    art.id='rlbAmbientArt';
    art.className='rlb-ambient-art';
    art.innerHTML=ambientSvg();
    document.body.prepend(art);
  }

  function enhanceHero(){
    const hero=$('#rlbInstitutionalHero');
    if(!hero)return;
    const h=hero.querySelector('h1');
    const p=hero.querySelector('p');
    const eye=hero.querySelector('.rlb-hero-eyebrow');
    if(eye)eye.innerHTML='<i></i> radar nacional de oportunidades públicas';
    if(h)h.textContent='Monitoramento inteligente de licitações públicas em todo o Brasil.';
    if(p)p.textContent='Pesquise oportunidades reais, refine por órgão, modalidade, localidade e fonte, acompanhe novas publicações e acesse diretamente os dados oficiais da contratação.';
  }

  function installUsageGuide(){
    const hero=$('#rlbInstitutionalHero');
    if(!hero||$('#rlbUsageGuide'))return;
    const guide=document.createElement('div');
    guide.id='rlbUsageGuide';
    guide.className='rlb-usage-guide';
    guide.innerHTML=`
      <div class="rlb-usage-step"><span class="rlb-usage-number">01</span><div><b>Defina o que procura</b><span>Use uma palavra-chave, UF, município ou tipo de órgão.</span></div></div>
      <div class="rlb-usage-step"><span class="rlb-usage-number">02</span><div><b>Refine quando precisar</b><span>Abra os filtros avançados para modalidade, valores, prazo e situação.</span></div></div>
      <div class="rlb-usage-step"><span class="rlb-usage-number">03</span><div><b>Valide na fonte oficial</b><span>Abra a licitação no PNCP ou no portal de origem informado pelo órgão.</span></div></div>`;
    hero.insertAdjacentElement('afterend',guide);
  }

  function enhanceNav(){
    const config={
      radar:['Radar PNCP','Pesquisa e monitoramento'],
      alerts:['Alertas','Filtros estratégicos'],
      docs:['Documentos','Arquivos de apoio'],
      admin:['Administração','Usuários e auditoria']
    };
    document.querySelectorAll('.nav button[data-view]').forEach(btn=>{
      if(btn.dataset.rlbV2==='1')return;
      const c=config[btn.dataset.view];
      if(!c)return;
      btn.innerHTML=`<span class="rlb-nav-copy"><strong>${c[0]}</strong><small>${c[1]}</small></span>`;
      btn.dataset.rlbV2='1';
    });
    const logout=$('#logout');
    if(logout&&!logout.dataset.rlbV2){
      logout.innerHTML='<span class="rlb-nav-copy"><strong>Sair</strong><small>Encerrar sessão</small></span>';
      logout.dataset.rlbV2='1';
    }
  }

  function sectionBanner(viewId,icon,title,text){
    const view=$(viewId);
    if(!view||view.querySelector('.rlb-section-banner'))return;
    const banner=document.createElement('div');
    banner.className='rlb-section-banner';
    banner.innerHTML=`<span class="rlb-section-icon">${icon}</span><div><h2>${title}</h2><p>${text}</p></div>`;
    view.prepend(banner);
  }

  function fieldHolder(id){
    const el=document.getElementById(id);
    return el?.parentElement||null;
  }

  function makeChip(label,handler){
    const b=document.createElement('button');
    b.type='button';
    b.className='rlb-quick-chip';
    b.textContent=label;
    b.addEventListener('click',handler);
    return b;
  }

  function installSearchUX(){
    const search=$('#search');
    const q=$('#q');
    if(!search||!q)return;
    const panel=search.closest('.card');
    const sourceGrid=q.closest('.grid');
    if(!panel||!sourceGrid||panel.classList.contains('rlb-search-panel'))return;
    panel.classList.add('rlb-search-panel');

    const essential=document.createElement('div');
    essential.className='rlb-filter-block';
    essential.innerHTML='<div class="rlb-filter-block-head"><div class="rlb-filter-title">Filtros essenciais</div></div><div class="rlb-filter-grid" id="rlbEssentialGrid"></div>';

    const advanced=document.createElement('div');
    advanced.className='rlb-filter-block advanced';
    advanced.innerHTML='<div class="rlb-filter-block-head"><div class="rlb-filter-title">Filtros avançados</div><button class="rlb-advanced-toggle" type="button" aria-expanded="false">Mostrar filtros +</button></div><div class="rlb-advanced-content" hidden><div class="rlb-filter-grid advanced-grid" id="rlbAdvancedGrid"></div></div>';

    sourceGrid.insertAdjacentElement('beforebegin',essential);
    essential.insertAdjacentElement('afterend',advanced);

    const basicIds=['q','uf','municipality','orgType','modal','sourceScope'];
    const advancedIds=['municipalityIbge','org','cnpj','days','minValue','maxValue','openOnly','order'];
    const basicGrid=essential.querySelector('#rlbEssentialGrid');
    const advancedGrid=advanced.querySelector('#rlbAdvancedGrid');
    basicIds.forEach(id=>{const h=fieldHolder(id);if(h)basicGrid.appendChild(h)});
    advancedIds.forEach(id=>{const h=fieldHolder(id);if(h)advancedGrid.appendChild(h)});
    if(!sourceGrid.children.length)sourceGrid.remove();

    const toggle=advanced.querySelector('.rlb-advanced-toggle');
    const content=advanced.querySelector('.rlb-advanced-content');
    toggle.addEventListener('click',()=>{
      const open=content.hasAttribute('hidden');
      if(open)content.removeAttribute('hidden');else content.setAttribute('hidden','');
      toggle.setAttribute('aria-expanded',open?'true':'false');
      toggle.textContent=open?'Ocultar filtros −':'Mostrar filtros +';
    });

    const quickbar=document.createElement('div');
    quickbar.className='rlb-quickbar';
    quickbar.innerHTML='<span class="rlb-quick-label">Busca rápida</span>';
    const run=()=>search.click();
    quickbar.appendChild(makeChip('Pregão eletrônico',()=>{const e=$('#modal');if(e)e.value='6';run()}));
    quickbar.appendChild(makeChip('Dispensas',()=>{const e=$('#modal');if(e)e.value='8';run()}));
    quickbar.appendChild(makeChip('Concorrências',()=>{const e=$('#modal');if(e)e.value='4';run()}));
    quickbar.appendChild(makeChip('Publicadas hoje',()=>{const e=$('#days');if(e)e.value='1';run()}));
    quickbar.appendChild(makeChip('Propostas abertas',()=>{const e=$('#openOnly');if(e)e.value='true';run()}));
    const chamber=$('#searchChambersBrazil');
    if(chamber){
      chamber.classList.remove('btn','section-gap','rlb-chamber-btn');
      chamber.classList.add('rlb-quick-chip');
      chamber.textContent='Câmaras Municipais';
      quickbar.appendChild(chamber);
    }
    essential.insertAdjacentElement('beforebegin',quickbar);

    const actions=document.createElement('div');
    actions.className='rlb-search-actions';
    actions.innerHTML='<div class="rlb-search-actions-main"></div><div class="rlb-search-hint">Comece pelos filtros essenciais. Use os avançados apenas quando precisar restringir melhor a oportunidade.</div>';
    const main=actions.querySelector('.rlb-search-actions-main');
    const clear=$('#clearFilters');
    main.appendChild(search);
    if(clear)main.appendChild(clear);
    advanced.insertAdjacentElement('afterend',actions);

    search.textContent='Buscar oportunidades';
  }

  function enhanceLogin(){
    const intro=$('.auth-intro');
    if(!intro||intro.querySelector('.rlb-auth-proof'))return;
    const proof=document.createElement('div');
    proof.className='rlb-auth-proof';
    proof.innerHTML='<span>Dados oficiais</span><span>Monitoramento automatizado</span><span>Pesquisa nacional</span><span>Acesso seguro</span>';
    intro.appendChild(proof);
  }

  function improveToolbarCopy(){
    const radar=$('#view-radar');
    const title=radar?.querySelector('.rlb-search-panel .toolbar h2');
    const sub=radar?.querySelector('.rlb-search-panel .toolbar .sub');
    if(title)title.textContent='Encontre a oportunidade certa';
    if(sub)sub.textContent='Pesquise em dados oficiais e refine a consulta somente quando necessário.';
  }

  function install(){
    installAmbient();
    enhanceHero();
    installUsageGuide();
    enhanceNav();
    sectionBanner('#view-alerts','◈','Alertas estratégicos','Organize critérios recorrentes e acompanhe oportunidades alinhadas à sua atuação.');
    sectionBanner('#view-docs','▤','Central de documentos','Mantenha arquivos de apoio acessíveis no mesmo ambiente de trabalho.');
    sectionBanner('#view-admin','⚙','Gestão da plataforma','Acompanhe usuários, perfis de acesso e registros de auditoria.');
    installSearchUX();
    enhanceLogin();
    improveToolbarCopy();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
