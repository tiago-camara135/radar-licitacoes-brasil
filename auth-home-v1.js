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

  const navActions=document.createElement('div');
  navActions.className='auth-home-nav-actions';
  navActions.innerHTML='<span><i></i> Radar nacional ativo</span><span>Fonte oficial: PNCP</span><a href="#authForm">Acessar plataforma</a>';
  brand.appendChild(navActions);

  copy.innerHTML=`
    <div class="auth-home-orbit" aria-hidden="true"><span></span><span></span><span></span></div>
    <div class="auth-home-copy-inner">
      <span class="auth-home-kicker">INTELIGÊNCIA EM LICITAÇÕES • BRASIL</span>
      <h1>Encontre oportunidades públicas com <em>mais velocidade, contexto e decisão.</em></h1>
      <p>O Radar de Licitações Brasil reúne monitoramento nacional, busca oficial, alertas, documentos e inteligência artificial em uma única plataforma conectada ao PNCP.</p>
      <div class="auth-home-ctas">
        <a class="auth-home-primary" href="#authForm">Entrar no Radar <b>↗</b></a>
        <a class="auth-home-secondary" href="#authHomeFeatures">Conhecer recursos</a>
      </div>
      <div class="auth-home-proof">
        <div><strong>14</strong><span>modalidades monitoradas</span></div>
        <div><strong>90s</strong><span>ciclo do monitor nacional</span></div>
        <div><strong>PNCP</strong><span>fonte oficial integrada</span></div>
      </div>
      <div class="auth-home-live"><span></span><div><b>Monitoramento nacional ativo</b><small>Novas oportunidades são incorporadas continuamente à base do Radar.</small></div></div>
    </div>`;

  const formHead=form.querySelector('.auth-card-head');
  if(formHead){
    formHead.innerHTML='<span class="eyebrow">ACESSO SEGURO</span><h2>Acesse o Radar</h2><p>Entre com sua conta ou crie um novo acesso para começar.</p>';
  }

  const features=document.createElement('section');
  features.id='authHomeFeatures';
  features.className='auth-home-features';
  features.innerHTML=`
    <div class="auth-home-section-head">
      <span>UMA PLATAFORMA, VÁRIAS ETAPAS</span>
      <h2>Da identificação da oportunidade à análise da licitação.</h2>
      <p>Recursos construídos para reduzir pesquisa manual e centralizar o trabalho com compras públicas.</p>
    </div>
    <div class="auth-home-feature-grid">
      <article><i>⌁</i><b>Radar nacional</b><p>Acompanhe oportunidades detectadas pelo monitor conectado à base oficial do PNCP.</p><small>Monitoramento contínuo</small></article>
      <article><i>⌕</i><b>Busca nacional</b><p>Pesquise por objeto, palavra-chave, UF, modalidade e período em uma interface única.</p><small>Filtros objetivos</small></article>
      <article><i>◉</i><b>Alertas personalizados</b><p>Defina critérios para acompanhar segmentos, estados e modalidades relevantes para sua atuação.</p><small>Monitoramento direcionado</small></article>
      <article><i>⚖</i><b>IA-RLB</b><p>Use o assessor virtual para apoiar análises de editais, habilitação, recursos e rotinas de licitação.</p><small>Gemini + fontes oficiais</small></article>
      <article><i>▤</i><b>Acervo de documentos</b><p>Organize arquivos importantes do trabalho licitatório dentro do próprio ambiente do Radar.</p><small>Centralização de arquivos</small></article>
      <article><i>◎</i><b>Visão operacional</b><p>Concentre oportunidades, monitoramento e ferramentas essenciais em um dashboard responsivo.</p><small>Desktop e mobile</small></article>
    </div>`;

  const positioning=document.createElement('section');
  positioning.className='auth-home-positioning';
  positioning.innerHTML=`
    <div class="auth-home-positioning-copy">
      <span>INFORMAÇÃO QUE VIRA AÇÃO</span>
      <h2>Menos tempo procurando. Mais tempo avaliando oportunidades.</h2>
      <p>O Radar foi desenhado para transformar dados públicos dispersos em uma experiência de acompanhamento mais organizada, rápida e útil para quem trabalha com licitações.</p>
    </div>
    <div class="auth-home-steps">
      <div><b>01</b><strong>Detecte</strong><span>Monitore novas oportunidades.</span></div>
      <div><b>02</b><strong>Filtre</strong><span>Encontre o que realmente importa.</span></div>
      <div><b>03</b><strong>Analise</strong><span>Use dados, documentos e IA-RLB.</span></div>
    </div>`;

  const footer=document.createElement('footer');
  footer.className='auth-home-footer';
  footer.innerHTML=`
    <div class="auth-home-footer-brand"><div class="brand-mark small">RLB</div><div><b>Radar de Licitações Brasil</b><span>Tecnologia e inteligência aplicada às compras públicas.</span></div></div>
    <div class="auth-home-company"><strong>Criado e desenvolvido por TVC Tecnologia, Assessoria e Licitações</strong><span>CNPJ: 12.847.227/0001-38</span><span>Rua Mendes Sá, nº 8550 – Bento Fernandes/RN • CEP: 59.555-000</span></div>
    <div class="auth-home-footer-meta"><span>Fonte oficial monitorada: PNCP</span><span>© 2026 Radar de Licitações Brasil</span></div>`;

  grid.insertAdjacentElement('afterend',features);
  features.insertAdjacentElement('afterend',positioning);
  positioning.insertAdjacentElement('afterend',footer);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
