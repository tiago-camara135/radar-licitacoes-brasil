(()=>{
  const $=s=>document.querySelector(s);
  const icons={
    radar:`<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.8"/><path d="M12 12 18.5 6.8"/><circle cx="18.5" cy="6.8" r="1.35" fill="currentColor" stroke="none"/></svg>`,
    filter:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/><circle cx="8" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="18" r="1.5" fill="currentColor" stroke="none"/></svg>`,
    source:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h11l3 3V19.5H5z"/><path d="M16 4.5v4h3M8 11h8M8 14.5h6"/><path d="m8.5 18 1.7 1.7 3.3-3.7"/></svg>`,
    arrow:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M14 8l4 4-4 4"/></svg>`
  };

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
        <div class="rlb-command-state">
          <span class="rlb-command-state-dot"></span>
          <div><strong>Monitoramento ativo</strong><small>Fluxo operacional do Radar</small></div>
        </div>
      </div>

      <div class="rlb-command-grid">
        <article class="rlb-command-card rlb-command-card--primary">
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
            <p>O Feed ao Vivo consolida as publicações identificadas pelo monitor e destaca novas entradas para reduzir pesquisas manuais repetitivas.</p>
          </div>
          <div class="rlb-command-card-foot">
            <span><i></i> Novas publicações</span>
            <span><i></i> Visão nacional</span>
            <span><i></i> Acompanhamento automatizado</span>
          </div>
        </article>

        <article class="rlb-command-card rlb-command-card--secondary">
          <div class="rlb-command-card-top">
            <span class="rlb-command-icon blue">${icons.filter}</span>
            <span class="rlb-command-index">01</span>
          </div>
          <div class="rlb-command-card-copy">
            <span class="rlb-command-kicker">Inteligência de busca</span>
            <h3>Filtros profissionais para chegar ao que realmente importa.</h3>
            <p>Refine por objeto, localidade, órgão, modalidade, fonte, situação, valores e período.</p>
          </div>
          <div class="rlb-command-link">Pesquisa segmentada <span>${icons.arrow}</span></div>
        </article>

        <article class="rlb-command-card rlb-command-card--secondary">
          <div class="rlb-command-card-top">
            <span class="rlb-command-icon gold">${icons.source}</span>
            <span class="rlb-command-index">02</span>
          </div>
          <div class="rlb-command-card-copy">
            <span class="rlb-command-kicker">Rastreabilidade</span>
            <h3>Origem oficial preservada em cada oportunidade consultada.</h3>
            <p>Acesse o registro no PNCP e, quando disponível, avance diretamente ao portal oficial informado pelo órgão.</p>
          </div>
          <div class="rlb-command-link">Validação da fonte <span>${icons.arrow}</span></div>
        </article>
      </div>

      <div class="rlb-command-footer">
        <span>Radar de Licitações Brasil</span>
        <div><b>Monitorar</b><i></i><b>Refinar</b><i></i><b>Validar</b></div>
        <small>Fluxo de trabalho orientado por dados oficiais</small>
      </div>`;

    if(old)old.replaceWith(section);else hero.insertAdjacentElement('afterend',section);
  }

  function install(){upgradeStrip()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();