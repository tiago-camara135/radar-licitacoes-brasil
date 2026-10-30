(()=>{
  function heroSvg(){
    return `<svg viewBox="0 0 520 350" role="img" aria-label="Ilustração de monitoramento de licitações públicas">
      <defs>
        <linearGradient id="p1" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffffff" stop-opacity=".98"/><stop offset="1" stop-color="#dfeaf0" stop-opacity=".94"/></linearGradient>
        <linearGradient id="p2" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#18c486"/><stop offset="1" stop-color="#087a58"/></linearGradient>
        <linearGradient id="p3" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f1c64b"/><stop offset="1" stop-color="#c99716"/></linearGradient>
        <filter id="sh"><feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#061a29" flood-opacity=".24"/></filter>
      </defs>
      <g opacity=".22" fill="none" stroke="#b9d4df" stroke-width="1"><path d="M48 50h420M48 100h420M48 150h420M48 200h420M48 250h420M48 300h420"/><path d="M90 25v300M160 25v300M230 25v300M300 25v300M370 25v300M440 25v300"/></g>
      <g transform="translate(56 46)" filter="url(#sh)">
        <rect width="334" height="232" rx="20" fill="url(#p1)"/>
        <rect width="334" height="38" rx="20" fill="#153a55"/><rect y="20" width="334" height="18" fill="#153a55"/>
        <circle cx="22" cy="19" r="5" fill="#21c789"/><circle cx="39" cy="19" r="5" fill="#f2c44e"/><circle cx="56" cy="19" r="5" fill="#6aa5c7"/>
        <rect x="20" y="58" width="84" height="52" rx="11" fill="#edf5f8"/><rect x="116" y="58" width="84" height="52" rx="11" fill="#edf7f3"/><rect x="212" y="58" width="102" height="52" rx="11" fill="#fff7dd"/>
        <rect x="32" y="73" width="35" height="7" rx="3.5" fill="#9bb0bf"/><rect x="32" y="87" width="49" height="11" rx="4" fill="#234c66"/>
        <rect x="128" y="73" width="35" height="7" rx="3.5" fill="#87aa9c"/><rect x="128" y="87" width="49" height="11" rx="4" fill="#0b8f62"/>
        <rect x="224" y="73" width="41" height="7" rx="3.5" fill="#baa75e"/><rect x="224" y="87" width="66" height="11" rx="4" fill="#a77c0e"/>
        <rect x="20" y="128" width="294" height="84" rx="13" fill="#f8fbfc" stroke="#d7e3e9"/>
        <path d="M39 189 C74 166,102 181,132 153 S194 182,228 149 S275 169,297 142" fill="none" stroke="#0b8f62" stroke-width="4" stroke-linecap="round"/>
        <path d="M39 190h258" stroke="#cbd8df" stroke-width="1"/><circle cx="132" cy="153" r="5" fill="#d6a21d"/><circle cx="228" cy="149" r="5" fill="#0b8f62"/><circle cx="297" cy="142" r="5" fill="#2c739c"/>
      </g>
      <g transform="translate(344 92) rotate(5)" filter="url(#sh)">
        <rect width="112" height="148" rx="16" fill="#fff"/>
        <rect x="17" y="21" width="46" height="9" rx="4" fill="#183f58"/>
        <rect x="17" y="42" width="77" height="7" rx="3.5" fill="#d8e3e9"/><rect x="17" y="57" width="66" height="7" rx="3.5" fill="#d8e3e9"/><rect x="17" y="72" width="72" height="7" rx="3.5" fill="#d8e3e9"/>
        <circle cx="80" cy="112" r="20" fill="url(#p2)"/><path d="M71 112l6 6 13-16" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
      <g transform="translate(367 231)" filter="url(#sh)">
        <circle cx="54" cy="54" r="49" fill="#102f4b" stroke="#ffffff" stroke-opacity=".24"/>
        <circle cx="54" cy="54" r="34" fill="none" stroke="#3ccf96" stroke-opacity=".55" stroke-width="2"/><circle cx="54" cy="54" r="20" fill="none" stroke="#3ccf96" stroke-opacity=".45" stroke-width="2"/>
        <path d="M54 54L91 34A43 43 0 0 1 96 56Z" fill="#2dd99a" fill-opacity=".28"/><path d="M54 54L91 34" stroke="#6ce5b4" stroke-width="3" stroke-linecap="round"/><circle cx="91" cy="34" r="5" fill="url(#p3)"/>
      </g>
    </svg>`;
  }

  function installHero(){
    const view=document.querySelector('#view-radar');
    if(!view||document.querySelector('#rlbInstitutionalHero'))return;
    const hero=document.createElement('section');
    hero.id='rlbInstitutionalHero';
    hero.className='rlb-institutional-hero';
    hero.innerHTML=`
      <div class="rlb-hero-copy">
        <span class="rlb-hero-eyebrow"><i></i> inteligência em contratações públicas</span>
        <h1>Oportunidades públicas monitoradas com mais contexto, velocidade e organização.</h1>
        <p>Centralize a descoberta de licitações, acompanhe novas publicações e navegue pelos dados oficiais em uma experiência criada para análise profissional de compras públicas.</p>
        <div class="rlb-hero-actions">
          <button type="button" class="rlb-hero-action" id="rlbHeroSearch">Explorar licitações <span>→</span></button>
          <button type="button" class="rlb-hero-action secondary" id="rlbHeroChambers">Câmaras Municipais</button>
        </div>
        <div class="rlb-hero-trust"><span>Dados oficiais do PNCP</span><span>Monitoramento automatizado</span><span>Acesso ao portal de origem</span></div>
      </div>
      <div class="rlb-hero-visual">${heroSvg()}</div>`;
    const stats=view.querySelector('.stats');
    if(stats)stats.insertAdjacentElement('beforebegin',hero);else view.prepend(hero);

    hero.querySelector('#rlbHeroSearch')?.addEventListener('click',()=>{
      const search=document.querySelector('#search');
      const target=search?.closest('.card')||search;
      target?.scrollIntoView({behavior:'smooth',block:'start'});
      setTimeout(()=>document.querySelector('#keyword')?.focus(),450);
    });
    hero.querySelector('#rlbHeroChambers')?.addEventListener('click',()=>{
      const quick=document.querySelector('#searchChambersBrazil');
      if(quick){quick.click();return;}
      const type=document.querySelector('#orgType');if(type)type.value='chambers';
      document.querySelector('#search')?.click();
    });
  }

  function polishHeader(){
    const left=document.querySelector('.govbar-left');
    const right=document.querySelector('.govbar-right');
    if(left)left.innerHTML='<strong>Radar de Licitações Brasil</strong><span>Inteligência e monitoramento em compras públicas</span>';
    if(right)right.innerHTML='<span class="status-live">Monitoramento ativo</span><span>Dados oficiais • PNCP</span>';
    const subtitle=document.querySelector('.brand-wrap .sub');
    if(subtitle)subtitle.textContent='Plataforma de inteligência para localizar, analisar e acompanhar oportunidades públicas.';
  }

  function installFooter(){
    const shell=document.querySelector('.shell');
    if(!shell||document.querySelector('#rlbInstitutionalFooter'))return;
    const footer=document.createElement('footer');
    footer.id='rlbInstitutionalFooter';
    footer.className='rlb-institutional-footer';
    footer.innerHTML=`<div><b>Radar de Licitações Brasil</b><br>Monitoramento e organização de oportunidades públicas a partir de fontes oficiais.</div><div class="rlb-footer-badges"><span class="rlb-footer-badge">PNCP</span><span class="rlb-footer-badge">Compras Públicas</span><span class="rlb-footer-badge">Monitoramento automatizado</span></div>`;
    shell.appendChild(footer);
  }

  function install(){
    document.body.classList.add('rlb-institutional');
    polishHeader();installHero();installFooter();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
