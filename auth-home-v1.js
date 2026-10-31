(()=>{
'use strict';
if(window.__rlbAuthHomeV1)return;
window.__rlbAuthHomeV1=true;

const icons={
  radar:`<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="3"></circle><path d="M12 12l6-5"></path><path d="M12 4v2M4 12h2M18 12h2M12 18v2"></path></svg>`,
  alert:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path><path d="M10 21h4"></path></svg>`,
  ai:`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="7" width="14" height="11" rx="3"></rect><path d="M9 11h.01M15 11h.01M9 15h6M12 3v4M3 12h2M19 12h2"></path></svg>`,
  support:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13a8 8 0 0 1 16 0"></path><path d="M4 13v5h4v-6H5M20 13v5h-4v-6h3"></path><path d="M16 20h-4"></path></svg>`,
  legal:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M6 6h12M8 6l-4 7h8L8 6ZM16 6l-4 7h8l-4-7Z"></path><path d="M6 21h12"></path></svg>`,
  docs:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"></path><path d="M14 3v5h5M9 12h6M9 16h6"></path></svg>`,
  search:`<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"></circle><path d="m16 16 4 4"></path></svg>`,
  shield:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6z"></path><path d="m9 12 2 2 4-4"></path></svg>`
};

function init(){
  const screen=document.getElementById('authScreen');
  if(!screen||screen.dataset.homeEnhanced==='1')return;
  const shell=screen.querySelector('.auth-shell');
  const brand=shell?.querySelector('.brand-line');
  const grid=shell?.querySelector('.auth-grid');
  const copy=grid?.querySelector('.auth-copy');
  const form=document.getElementById('authForm');
  if(!shell||!brand||!grid||!copy||!form)return;

  screen.dataset.homeEnhanced='1';
  screen.classList.add('auth-home-v1');
  shell.classList.add('auth-home-shell');
  brand.classList.add('auth-home-brand');
  grid.classList.add('auth-home-grid');
  form.classList.add('auth-home-card');

  const brandText=brand.querySelector('div:nth-child(2)');
  if(brandText){
    const strong=brandText.querySelector('strong');
    const span=brandText.querySelector('span');
    if(strong)strong.textContent='Radar de Licitações Brasil';
    if(span)span.textContent='Inteligência para compras públicas';
  }

  const navActions=document.createElement('div');
  navActions.className='auth-home-nav-actions';
  navActions.innerHTML=`
    <span class="auth-home-status"><i></i> Monitoramento ativo</span>
    <span class="auth-home-source">Fonte oficial: PNCP</span>
    <a href="#authForm">Entrar no Radar</a>`;
  brand.appendChild(navActions);

  copy.innerHTML=`
    <div class="auth-home-radar-art" aria-hidden="true"><span></span><span></span><span></span><b>BR</b></div>
    <div class="auth-home-copy-inner">
      <span class="auth-home-kicker">INTELIGÊNCIA PARA QUEM DISPUTA LICITAÇÕES</span>
      <h1>Transforme o excesso de editais em <em>decisões mais rápidas e oportunidades mais claras.</em></h1>
      <p>O Radar de Licitações Brasil concentra monitoramento nacional, busca oficial, alertas, documentos e inteligência artificial em uma única operação conectada ao PNCP.</p>

      <div class="auth-home-ctas">
        <a class="auth-home-primary" href="#authForm">Acessar plataforma <b>↗</b></a>
        <a class="auth-home-secondary" href="#authHomeCapabilities">Conhecer a solução</a>
      </div>

      <div class="auth-home-trust-row" aria-label="Recursos principais">
        <span><i>✓</i> PNCP</span>
        <span><i>✓</i> 14 modalidades</span>
        <span><i>✓</i> ciclo de 90s</span>
        <span><i>✓</i> IA-RLB</span>
      </div>

      <div id="authHomeProduct" class="auth-home-product-preview" aria-label="Prévia do Radar de Licitações Brasil">
        <div class="auth-home-preview-top">
          <div><span class="auth-home-preview-dot"></span><b>Radar Nacional</b></div>
          <small>AO VIVO</small>
        </div>
        <div class="auth-home-preview-search"><span>⌕</span><p>Buscar por objeto, órgão, UF ou modalidade</p><b>Pesquisar</b></div>
        <div class="auth-home-preview-grid">
          <div class="auth-home-preview-main">
            <article><span class="auth-home-preview-label">OPORTUNIDADE MONITORADA</span><b>Feed nacional conectado às fontes oficiais</b><small>Novos registros organizados para consulta e triagem.</small></article>
            <article><span class="auth-home-preview-label cyan">ALERTA PERSONALIZADO</span><b>Monitore o que realmente importa para sua atuação</b><small>Filtros por palavra-chave, UF e modalidade.</small></article>
          </div>
          <div class="auth-home-preview-side">
            <div><span>⌁</span><b>Busca nacional</b><small>Filtros objetivos</small></div>
            <div><span>⚖</span><b>IA-RLB</b><small>Assistente especializado</small></div>
            <div><span>▤</span><b>Documentos</b><small>Acervo centralizado</small></div>
          </div>
        </div>
      </div>
    </div>`;

  const formHead=form.querySelector('.auth-card-head');
  if(formHead){
    formHead.innerHTML=`
      <div class="auth-home-access-badge"><span></span> ACESSO À PLATAFORMA</div>
      <h2>Entre no Radar</h2>
      <p>Acesse seu ambiente de monitoramento, análise e acompanhamento de oportunidades públicas.</p>`;
  }

  const formFoot=document.createElement('div');
  formFoot.className='auth-home-security-note';
  formFoot.innerHTML=`<span class="auth-home-inline-icon">${icons.shield}</span><div><b>Acesso protegido</b><small>Sessão segura e autenticação vinculada à sua conta.</small></div>`;
  const runtime=form.querySelector('#runtimeMessage');
  if(runtime)runtime.insertAdjacentElement('afterend',formFoot);else form.appendChild(formFoot);

  const trust=document.createElement('section');
  trust.className='auth-home-trust-band';
  trust.innerHTML=`
    <div><span>FONTE OFICIAL</span><b>PNCP integrado ao monitor</b></div>
    <div><span>COBERTURA</span><b>14 modalidades acompanhadas</b></div>
    <div><span>ATUALIZAÇÃO</span><b>Ciclo operacional de 90 segundos</b></div>
    <div><span>INTELIGÊNCIA</span><b>IA-RLB para apoio à análise</b></div>`;

  const capabilities=document.createElement('section');
  capabilities.id='authHomeCapabilities';
  capabilities.className='auth-home-capabilities';
  capabilities.innerHTML=`
    <div class="auth-home-section-head auth-home-section-head-left auth-home-capabilities-head">
      <span>UMA CENTRAL DE INTELIGÊNCIA EM LICITAÇÕES</span>
      <h2>Da oportunidade à decisão, sua operação em um ambiente mais inteligente.</h2>
      <p>O Radar combina tecnologia, monitoramento de contratações públicas e apoio especializado para empresas que querem encontrar oportunidades, organizar a análise e competir com mais segurança.</p>
    </div>

    <div class="auth-home-capability-layout">
      <article class="auth-home-capability-hero">
        <div class="auth-home-capability-topline"><span class="auth-home-iconbox">${icons.radar}</span><small>MONITORAMENTO NACIONAL</small><b><i></i> ATIVO</b></div>
        <h3>Captação contínua de oportunidades publicadas no PNCP.</h3>
        <p>O Radar acompanha diferentes modalidades de contratação pública, organiza os registros em uma base pesquisável e reduz o trabalho manual de procurar edital por edital.</p>
        <div class="auth-home-capability-stats">
          <div><strong>14</strong><span>modalidades monitoradas</span></div>
          <div><strong>27</strong><span>UFs em uma única base</span></div>
          <div><strong>90s</strong><span>ciclo operacional</span></div>
        </div>
        <div class="auth-home-mini-feed">
          <div><span class="live-dot"></span><b>Pregão eletrônico</b><small>Nova oportunidade identificada</small><em>RN</em></div>
          <div><span class="live-dot cyan"></span><b>Concorrência</b><small>Registro organizado para triagem</small><em>SP</em></div>
          <div><span class="live-dot violet"></span><b>Dispensa eletrônica</b><small>Disponível na busca nacional</small><em>MG</em></div>
        </div>
      </article>

      <div class="auth-home-capability-side">
        <article class="auth-home-capability-card accent-ai">
          <span class="auth-home-iconbox">${icons.ai}</span>
          <small>IA-RLB</small>
          <h3>Inteligência artificial aplicada à rotina licitatória.</h3>
          <p>Apoio para leitura de editais, requisitos de habilitação, dúvidas de procedimento, recursos e organização da análise.</p>
          <div class="auth-home-card-link">Análise assistida <span>↗</span></div>
        </article>
        <article class="auth-home-capability-card accent-support">
          <span class="auth-home-iconbox">${icons.support}</span>
          <small>APOIO ESPECIALIZADO</small>
          <h3>Tecnologia com suporte humano quando o caso exige contexto.</h3>
          <p>Atendimento interno para dúvidas operacionais, apoio técnico em licitações e assessoria jurídica conforme o escopo contratado.</p>
          <div class="auth-home-card-link">Suporte ao cliente <span>↗</span></div>
        </article>
      </div>
    </div>

    <div class="auth-home-service-strip">
      <div><span class="auth-home-service-icon">${icons.alert}</span><b>Alertas estratégicos</b><small>Palavras-chave, UF e modalidade.</small></div>
      <div><span class="auth-home-service-icon">${icons.search}</span><b>Busca e triagem</b><small>Encontre o que combina com sua atuação.</small></div>
      <div><span class="auth-home-service-icon">${icons.docs}</span><b>Acervo digital</b><small>Documentos e referências em um só lugar.</small></div>
      <div><span class="auth-home-service-icon">${icons.legal}</span><b>Apoio jurídico</b><small>Orientação especializada conforme contratação.</small></div>
    </div>`;

  const demo=document.createElement('section');
  demo.id='authHomeDemo';
  demo.className='auth-home-demo';
  demo.innerHTML=`
    <div class="auth-home-demo-copy">
      <span class="auth-home-demo-kicker">PRÉVIA DA EXPERIÊNCIA</span>
      <h2>Veja como seria sua operação dentro do Radar.</h2>
      <p>Explore uma demonstração limitada dos principais módulos. A conta completa libera o ambiente operacional, histórico, personalização e recursos vinculados ao usuário.</p>
      <div class="auth-home-demo-tabs" role="tablist" aria-label="Demonstração dos módulos do Radar">
        <button type="button" class="active" data-demo="radar">${icons.radar}<span><b>Radar</b><small>Oportunidades</small></span></button>
        <button type="button" data-demo="alerts">${icons.alert}<span><b>Alertas</b><small>Prioridades</small></span></button>
        <button type="button" data-demo="ai">${icons.ai}<span><b>IA-RLB</b><small>Análise</small></span></button>
        <button type="button" data-demo="support">${icons.support}<span><b>Suporte</b><small>Especialistas</small></span></button>
      </div>
      <a class="auth-home-demo-cta" href="#authForm">Criar ou acessar minha conta <span>↗</span></a>
    </div>

    <div class="auth-home-demo-window">
      <div class="auth-home-demo-window-top"><div><i></i><i></i><i></i></div><b>Radar de Licitações Brasil</b><span>DEMONSTRAÇÃO</span></div>
      <div id="authHomeDemoPanel" class="auth-home-demo-panel" aria-live="polite"></div>
    </div>`;

  const positioning=document.createElement('section');
  positioning.className='auth-home-positioning auth-home-operation';
  positioning.innerHTML=`
    <div class="auth-home-positioning-copy">
      <span>DO MONITORAMENTO À DISPUTA</span>
      <h2>Uma operação conectada para a empresa agir no momento certo.</h2>
      <p>A tecnologia organiza o fluxo. A IA acelera a leitura. E o apoio especializado entra quando a tomada de decisão exige análise técnica ou jurídica.</p>
    </div>
    <div class="auth-home-steps auth-home-steps-four">
      <div><b>01</b><strong>Monitore</strong><span>Oportunidades entram na base nacional.</span></div>
      <div><b>02</b><strong>Priorize</strong><span>Filtros e alertas destacam o que importa.</span></div>
      <div><b>03</b><strong>Analise</strong><span>IA-RLB e acervo apoiam a triagem.</span></div>
      <div><b>04</b><strong>Decida</strong><span>Conte com suporte especializado quando necessário.</span></div>
    </div>`;

  const footer=document.createElement('footer');
  footer.className='auth-home-footer';
  footer.innerHTML=`
    <div class="auth-home-footer-brand"><div class="brand-mark small">RLB</div><div><b>Radar de Licitações Brasil</b><span>Inteligência aplicada às compras públicas.</span></div></div>
    <div class="auth-home-company"><strong>Criado e desenvolvido por TVC Tecnologia, Assessoria e Licitações</strong><span>CNPJ: 12.847.227/0001-38</span><span>Rua Mendes Sá, nº 8550 – Bento Fernandes/RN • CEP: 59.555-000</span></div>
    <div class="auth-home-footer-meta"><span>Fonte oficial monitorada: PNCP</span><span>© 2026 Radar de Licitações Brasil</span></div>`;

  grid.insertAdjacentElement('afterend',trust);
  trust.insertAdjacentElement('afterend',capabilities);
  capabilities.insertAdjacentElement('afterend',demo);
  demo.insertAdjacentElement('afterend',positioning);
  positioning.insertAdjacentElement('afterend',footer);

  const panel=document.getElementById('authHomeDemoPanel');
  const tabs=[...demo.querySelectorAll('[data-demo]')];
  const views={
    radar:`
      <div class="demo-toolbar"><div class="demo-search">${icons.search}<span>serviços de manutenção</span></div><button>Pesquisar</button></div>
      <div class="demo-filter-row"><span class="selected">Todos</span><span>RN</span><span>Pregão eletrônico</span><span>Serviços</span></div>
      <div class="demo-result-head"><div><span class="live-dot"></span><b>Oportunidades monitoradas</b></div><small>BASE NACIONAL</small></div>
      <div class="demo-results">
        <article><div><small>PREGÃO ELETRÔNICO • RN</small><b>Contratação de serviços de manutenção preventiva e corretiva</b><span>Prefeitura Municipal • Publicação monitorada</span></div><em>Ver oportunidade</em></article>
        <article><div><small>CONCORRÊNCIA • SP</small><b>Serviços técnicos especializados e manutenção de instalações</b><span>Órgão público • Registro disponível para triagem</span></div><em>Ver oportunidade</em></article>
      </div>`,
    alerts:`
      <div class="demo-module-title"><span class="auth-home-iconbox">${icons.alert}</span><div><small>ALERTA ESTRATÉGICO</small><b>Transforme seu perfil comercial em regra de monitoramento.</b></div></div>
      <div class="demo-alert-builder">
        <label><span>Palavra-chave</span><b>ar-condicionado</b></label>
        <label><span>UF</span><b>RN</b></label>
        <label><span>Modalidade</span><b>Pregão eletrônico</b></label>
        <label><span>Status</span><b class="demo-enabled"><i></i> Ativo</b></label>
      </div>
      <div class="demo-insight"><strong>Como funciona</strong><p>Quando uma publicação combina com os critérios definidos, o Radar registra a correspondência e prioriza a oportunidade para acompanhamento.</p></div>`,
    ai:`
      <div class="demo-ai-head"><span class="auth-home-iconbox">${icons.ai}</span><div><small>IA-RLB • ASSISTENTE DE LICITAÇÕES</small><b>Analise requisitos sem perder o contexto da contratação.</b></div></div>
      <div class="demo-chat">
        <div class="demo-user-msg">Quais pontos devo verificar na habilitação deste edital?</div>
        <div class="demo-ai-msg"><span>RLB</span><div><b>Triagem inicial</b><p>Comece por habilitação jurídica, regularidade fiscal e trabalhista, qualificação técnica e econômico-financeira. Depois confronte cada exigência com os documentos disponíveis.</p><ul><li>✓ requisitos identificados</li><li>✓ pontos de atenção organizados</li><li>✓ apoio para próxima análise</li></ul></div></div>
      </div>`,
    support:`
      <div class="demo-module-title"><span class="auth-home-iconbox">${icons.support}</span><div><small>SUPORTE ESPECIALIZADO</small><b>Quando a dúvida ultrapassa a automação, você não fica sozinho.</b></div></div>
      <div class="demo-support-grid">
        <article><span>${icons.support}</span><div><b>Atendimento interno</b><p>Dúvidas sobre uso da plataforma e rotina operacional.</p></div><em>Disponível</em></article>
        <article><span>${icons.radar}</span><div><b>Apoio em licitações</b><p>Orientação técnica para análise e participação.</p></div><em>Conforme plano</em></article>
        <article><span>${icons.legal}</span><div><b>Assessoria jurídica</b><p>Apoio especializado quando o caso exigir avaliação jurídica.</p></div><em>Conforme escopo</em></article>
      </div>`
  };

  function setDemo(name){
    tabs.forEach(btn=>btn.classList.toggle('active',btn.dataset.demo===name));
    if(panel){
      panel.classList.remove('demo-panel-enter');
      void panel.offsetWidth;
      panel.innerHTML=views[name]||views.radar;
      panel.classList.add('demo-panel-enter');
    }
  }
  tabs.forEach(btn=>btn.addEventListener('click',()=>setDemo(btn.dataset.demo)));
  setDemo('radar');
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
