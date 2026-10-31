(()=>{
'use strict';
if(window.__rlbAuthHomeV1)return;
window.__rlbAuthHomeV1=true;

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
        <a class="auth-home-secondary" href="#authHomeProduct">Ver como funciona</a>
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
  formFoot.innerHTML='<span>◉</span><div><b>Acesso protegido</b><small>Sessão segura e autenticação vinculada à sua conta.</small></div>';
  const runtime=form.querySelector('#runtimeMessage');
  if(runtime)runtime.insertAdjacentElement('afterend',formFoot);else form.appendChild(formFoot);

  const trust=document.createElement('section');
  trust.className='auth-home-trust-band';
  trust.innerHTML=`
    <div><span>FONTE OFICIAL</span><b>PNCP integrado ao monitor</b></div>
    <div><span>COBERTURA</span><b>14 modalidades acompanhadas</b></div>
    <div><span>ATUALIZAÇÃO</span><b>Ciclo operacional de 90 segundos</b></div>
    <div><span>INTELIGÊNCIA</span><b>IA-RLB para apoio à análise</b></div>`;

  const features=document.createElement('section');
  features.id='authHomeFeatures';
  features.className='auth-home-features';
  features.innerHTML=`
    <div class="auth-home-section-head auth-home-section-head-left">
      <span>UMA OPERAÇÃO MAIS ORGANIZADA</span>
      <h2>O Radar foi desenhado para reduzir ruído e acelerar a triagem.</h2>
      <p>Em vez de navegar entre fontes, planilhas e arquivos dispersos, você concentra as etapas essenciais em um único ambiente.</p>
    </div>
    <div class="auth-home-feature-grid">
      <article class="feature-primary"><i>⌁</i><div><b>Descubra oportunidades</b><p>Acompanhe o feed monitorado e pesquise contratações públicas por critérios objetivos.</p><small>RADAR + BUSCA</small></div></article>
      <article><i>◉</i><div><b>Priorize o que importa</b><p>Crie alertas para palavras-chave, estados e modalidades relevantes para sua estratégia.</p><small>ALERTAS</small></div></article>
      <article><i>▤</i><div><b>Centralize seu trabalho</b><p>Mantenha documentos e referências importantes dentro do mesmo ambiente operacional.</p><small>ACERVO DIGITAL</small></div></article>
      <article><i>⚖</i><div><b>Analise com apoio de IA</b><p>Use a IA-RLB para apoiar leitura de editais, habilitação, recursos e rotinas de licitação.</p><small>IA-RLB</small></div></article>
    </div>`;

  const positioning=document.createElement('section');
  positioning.className='auth-home-positioning';
  positioning.innerHTML=`
    <div class="auth-home-positioning-copy">
      <span>DO DADO À DECISÃO</span>
      <h2>Uma jornada simples para quem precisa agir rápido.</h2>
      <p>O Radar organiza a descoberta, a seleção e a análise em uma sequência operacional clara.</p>
    </div>
    <div class="auth-home-steps">
      <div><b>01</b><strong>Monitore</strong><span>Receba novas oportunidades na base.</span></div>
      <div><b>02</b><strong>Filtre</strong><span>Encontre o que combina com sua atuação.</span></div>
      <div><b>03</b><strong>Analise</strong><span>Use documentos, dados e IA-RLB.</span></div>
    </div>`;

  const footer=document.createElement('footer');
  footer.className='auth-home-footer';
  footer.innerHTML=`
    <div class="auth-home-footer-brand"><div class="brand-mark small">RLB</div><div><b>Radar de Licitações Brasil</b><span>Inteligência aplicada às compras públicas.</span></div></div>
    <div class="auth-home-company"><strong>Criado e desenvolvido por TVC Tecnologia, Assessoria e Licitações</strong><span>CNPJ: 12.847.227/0001-38</span><span>Rua Mendes Sá, nº 8550 – Bento Fernandes/RN • CEP: 59.555-000</span></div>
    <div class="auth-home-footer-meta"><span>Fonte oficial monitorada: PNCP</span><span>© 2026 Radar de Licitações Brasil</span></div>`;

  grid.insertAdjacentElement('afterend',trust);
  trust.insertAdjacentElement('afterend',features);
  features.insertAdjacentElement('afterend',positioning);
  positioning.insertAdjacentElement('afterend',footer);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
