(()=>{
  const $=s=>document.querySelector(s);
  const icons={
    radar:`<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 12 18 7"/><circle cx="18" cy="7" r="1.3" fill="currentColor" stroke="none"/></svg>`,
    search:`<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4.5 4.5M7.5 10.5h6M10.5 7.5v6"/></svg>`,
    source:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h11l3 3V19.5H5z"/><path d="M16 4.5v4h3M8 11h8M8 14.5h6"/><path d="m8.5 18 1.7 1.7 3.3-3.7"/></svg>`
  };

  function upgradeStrip(){
    const old=$('#rlbPlatformValue');
    const hero=$('#rlbInstitutionalHero');
    if(!hero)return;
    const section=document.createElement('section');
    section.id='rlbPlatformValue';
    section.className='rlb-intelligence-band';
    section.innerHTML=`
      <div class="rlb-intelligence-head">
        <div class="rlb-intelligence-heading">
          <span class="rlb-intelligence-eyebrow">Inteligência aplicada às contratações públicas</span>
          <h2>Uma operação mais clara para encontrar, acompanhar e validar oportunidades.</h2>
          <p>O Radar organiza o acesso à informação pública em três frentes que sustentam a rotina de monitoramento.</p>
        </div>
        <span class="rlb-intelligence-status"><i></i> Plataforma operacional</span>
      </div>
      <div class="rlb-intelligence-grid">
        <article class="rlb-intelligence-item">
          <span class="rlb-intelligence-icon">${icons.radar}</span>
          <div>
            <span class="rlb-intelligence-kicker">Monitoramento</span>
            <h3>Novas publicações em acompanhamento contínuo</h3>
            <p>O Feed ao Vivo reúne as oportunidades identificadas pelo monitor e destaca novas entradas sem exigir buscas manuais repetitivas.</p>
            <span class="rlb-intelligence-note">Atualização automatizada</span>
          </div>
        </article>
        <article class="rlb-intelligence-item">
          <span class="rlb-intelligence-icon">${icons.search}</span>
          <div>
            <span class="rlb-intelligence-kicker">Pesquisa</span>
            <h3>Filtros pensados para análise profissional</h3>
            <p>Pesquise por objeto, localidade, modalidade, órgão, fonte, situação, período e outros critérios relevantes para sua estratégia.</p>
            <span class="rlb-intelligence-note">Busca segmentada</span>
          </div>
        </article>
        <article class="rlb-intelligence-item">
          <span class="rlb-intelligence-icon">${icons.source}</span>
          <div>
            <span class="rlb-intelligence-kicker">Origem dos dados</span>
            <h3>Acesso direto às fontes oficiais</h3>
            <p>Consulte o registro no PNCP e, quando houver link oficial informado, avance para o portal de origem da contratação.</p>
            <span class="rlb-intelligence-note">Rastreabilidade da informação</span>
          </div>
        </article>
      </div>`;
    if(old)old.replaceWith(section);else hero.insertAdjacentElement('afterend',section);
  }

  function install(){upgradeStrip()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
