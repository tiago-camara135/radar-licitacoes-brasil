(()=>{
  const STORAGE_KEY='rlb-theme';
  const $=s=>document.querySelector(s);

  function safeTheme(){
    try{
      const saved=localStorage.getItem(STORAGE_KEY);
      if(saved==='light'||saved==='dark')return saved;
    }catch{}
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'light';
  }

  function ambientSvg(theme){
    if(theme==='dark'){
      return `<svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs><radialGradient id="g"><stop stop-color="#2bd498" stop-opacity=".16"/><stop offset="1" stop-color="#2bd498" stop-opacity="0"/></radialGradient></defs>
        <circle cx="1370" cy="210" r="255" fill="url(#g)"/>
        <g fill="none" stroke="#6fe6ba" stroke-opacity=".12" stroke-width="2"><circle cx="1360" cy="225" r="188"/><circle cx="1360" cy="225" r="132"/><circle cx="1360" cy="225" r="76"/><path d="M1360 225L1495 138"/></g>
        <g fill="none" stroke="#5d87a0" stroke-opacity=".11" stroke-width="1.7"><path d="M120 188C300 88 460 280 642 168S998 100 1122 164"/><circle cx="120" cy="188" r="5"/><circle cx="372" cy="160" r="5"/><circle cx="642" cy="168" r="5"/><circle cx="878" cy="126" r="5"/><circle cx="1122" cy="164" r="5"/></g>
        <g fill="none" stroke="#2bd498" stroke-opacity=".11" stroke-width="2" transform="translate(115 630)"><path d="M0 138h330M28 138V55h274v83M56 55L165 0l109 55M75 75v63M125 75v63M205 75v63M255 75v63M8 151h314"/></g>
        <g fill="none" stroke="#f1c44a" stroke-opacity=".10" stroke-width="1.8" transform="translate(1040 660)"><rect x="0" y="0" width="150" height="195" rx="13"/><path d="M26 42h87M26 68h98M26 94h69M26 120h91"/><circle cx="112" cy="154" r="23"/><path d="M101 154l8 8 16-20"/></g>
      </svg>`;
    }
    return `<svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g fill="none" stroke="#17435f" stroke-opacity=".065" stroke-width="2"><circle cx="1360" cy="225" r="188"/><circle cx="1360" cy="225" r="132"/><circle cx="1360" cy="225" r="76"/><path d="M1360 225L1494 138"/></g>
      <g fill="none" stroke="#0b8f62" stroke-opacity=".07" stroke-width="2" transform="translate(115 630)"><path d="M0 138h330M28 138V55h274v83M56 55L165 0l109 55M75 75v63M125 75v63M205 75v63M255 75v63M8 151h314"/></g>
      <g fill="none" stroke="#17435f" stroke-opacity=".06" stroke-width="1.7" transform="translate(1040 660)"><rect x="0" y="0" width="150" height="195" rx="13"/><path d="M26 42h87M26 68h98M26 94h69M26 120h91"/><circle cx="112" cy="154" r="23"/><path d="M101 154l8 8 16-20"/></g>
      <g fill="none" stroke="#17435f" stroke-opacity=".06" stroke-width="1.5"><path d="M120 188C300 88 460 280 642 168S998 100 1122 164"/><circle cx="120" cy="188" r="5"/><circle cx="372" cy="160" r="5"/><circle cx="642" cy="168" r="5"/><circle cx="878" cy="126" r="5"/><circle cx="1122" cy="164" r="5"/></g>
      <path fill="#d6a21d" fill-opacity=".04" d="M1510 520c-88 18-152 87-158 174-6 92 54 174 143 199 51 14 91 1 105-6V505c-21 2-52 6-90 15Z"/>
      <path fill="#0b8f62" fill-opacity=".03" d="M0 315c74-39 164-31 223 22 54 49 77 130 54 196-27 77-112 131-219 116-22-3-41-8-58-15V315Z"/>
    </svg>`;
  }

  function heroSvg(theme){
    const dark=theme==='dark';
    const panel=dark?'#10212e':'#ffffff';
    const panel2=dark?'#162a38':'#f8fbfc';
    const line=dark?'#2a4050':'#d7e3e9';
    const ink=dark?'#dceaf1':'#183f58';
    const muted=dark?'#617b8d':'#9bb0bf';
    const green=dark?'#2bd498':'#0b8f62';
    const gold=dark?'#f1c44a':'#d6a21d';
    const top=dark?'#0b1721':'#153a55';
    return `<svg viewBox="0 0 520 350" role="img" aria-label="Painel ilustrado de monitoramento de licitações">
      <defs><filter id="rlb3sh"><feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#020c12" flood-opacity="${dark?'.36':'.22'}"/></filter></defs>
      <g opacity="${dark?'.16':'.20'}" fill="none" stroke="${dark?'#5d87a0':'#b9d4df'}" stroke-width="1"><path d="M48 50h420M48 100h420M48 150h420M48 200h420M48 250h420M48 300h420"/><path d="M90 25v300M160 25v300M230 25v300M300 25v300M370 25v300M440 25v300"/></g>
      <g transform="translate(56 46)" filter="url(#rlb3sh)">
        <rect width="334" height="232" rx="20" fill="${panel}" stroke="${line}"/>
        <rect width="334" height="38" rx="20" fill="${top}"/><rect y="20" width="334" height="18" fill="${top}"/>
        <circle cx="22" cy="19" r="5" fill="${green}"/><circle cx="39" cy="19" r="5" fill="${gold}"/><circle cx="56" cy="19" r="5" fill="${dark?'#447188':'#6aa5c7'}"/>
        <rect x="20" y="58" width="84" height="52" rx="11" fill="${panel2}"/><rect x="116" y="58" width="84" height="52" rx="11" fill="${dark?'#112b27':'#edf7f3'}"/><rect x="212" y="58" width="102" height="52" rx="11" fill="${dark?'#2b2718':'#fff7dd'}"/>
        <rect x="32" y="73" width="35" height="7" rx="3.5" fill="${muted}"/><rect x="32" y="87" width="49" height="11" rx="4" fill="${ink}"/>
        <rect x="128" y="73" width="35" height="7" rx="3.5" fill="${dark?'#668f80':'#87aa9c'}"/><rect x="128" y="87" width="49" height="11" rx="4" fill="${green}"/>
        <rect x="224" y="73" width="41" height="7" rx="3.5" fill="${dark?'#8d8254':'#baa75e'}"/><rect x="224" y="87" width="66" height="11" rx="4" fill="${gold}"/>
        <rect x="20" y="128" width="294" height="84" rx="13" fill="${panel2}" stroke="${line}"/>
        <path d="M39 189 C74 166,102 181,132 153 S194 182,228 149 S275 169,297 142" fill="none" stroke="${green}" stroke-width="4" stroke-linecap="round"/>
        <path d="M39 190h258" stroke="${line}" stroke-width="1"/><circle cx="132" cy="153" r="5" fill="${gold}"/><circle cx="228" cy="149" r="5" fill="${green}"/><circle cx="297" cy="142" r="5" fill="${dark?'#72b7df':'#2c739c'}"/>
      </g>
      <g transform="translate(344 92) rotate(5)" filter="url(#rlb3sh)"><rect width="112" height="148" rx="16" fill="${panel}" stroke="${line}"/><rect x="17" y="21" width="46" height="9" rx="4" fill="${ink}"/><rect x="17" y="42" width="77" height="7" rx="3.5" fill="${line}"/><rect x="17" y="57" width="66" height="7" rx="3.5" fill="${line}"/><rect x="17" y="72" width="72" height="7" rx="3.5" fill="${line}"/><circle cx="80" cy="112" r="20" fill="${green}"/><path d="M71 112l6 6 13-16" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></g>
      <g transform="translate(367 231)" filter="url(#rlb3sh)"><circle cx="54" cy="54" r="49" fill="${dark?'#08141e':'#102f4b'}" stroke="${dark?'#284150':'#ffffff'}" stroke-opacity=".45"/><circle cx="54" cy="54" r="34" fill="none" stroke="${green}" stroke-opacity=".65" stroke-width="2"/><circle cx="54" cy="54" r="20" fill="none" stroke="${green}" stroke-opacity=".48" stroke-width="2"/><path d="M54 54L91 34A43 43 0 0 1 96 56Z" fill="${green}" fill-opacity=".26"/><path d="M54 54L91 34" stroke="${green}" stroke-width="3" stroke-linecap="round"/><circle cx="91" cy="34" r="5" fill="${gold}"/></g>
    </svg>`;
  }

  function updateArtwork(theme){
    const ambient=$('#rlbAmbientArt');
    if(ambient)ambient.innerHTML=ambientSvg(theme);
    const hero=$('.rlb-hero-visual');
    if(hero)hero.innerHTML=heroSvg(theme);
  }

  function setTheme(theme,persist=true){
    if(theme!=='light'&&theme!=='dark')theme='light';
    document.documentElement.dataset.theme=theme;
    document.body?.setAttribute('data-theme',theme);
    document.querySelectorAll('[data-rlb-theme]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.rlbTheme===theme)));
    const meta=document.querySelector('meta[name="theme-color"]');
    if(meta)meta.setAttribute('content',theme==='dark'?'#08131E':'#102F4B');
    updateArtwork(theme);
    if(persist){try{localStorage.setItem(STORAGE_KEY,theme)}catch{}}
  }

  function installThemeControl(){
    if($('#rlbThemeControl'))return;
    const top=$('.top');
    const who=$('#who');
    if(!top)return;
    const control=document.createElement('div');
    control.id='rlbThemeControl';
    control.className='rlb-theme-control';
    control.setAttribute('role','group');
    control.setAttribute('aria-label','Tema da interface');
    control.innerHTML='<button type="button" data-rlb-theme="light" aria-pressed="false"><span class="rlb-theme-icon">☀</span> Claro</button><button type="button" data-rlb-theme="dark" aria-pressed="false"><span class="rlb-theme-icon">◐</span> Escuro</button>';
    control.addEventListener('click',e=>{const btn=e.target.closest('[data-rlb-theme]');if(btn)setTheme(btn.dataset.rlbTheme,true)});
    if(who)top.insertBefore(control,who);else top.appendChild(control);
  }

  function replaceUsageGuide(){
    $('#rlbUsageGuide')?.remove();
    if($('#rlbPlatformValue'))return;
    const hero=$('#rlbInstitutionalHero');
    if(!hero)return;
    const strip=document.createElement('section');
    strip.id='rlbPlatformValue';
    strip.className='rlb-platform-value';
    strip.innerHTML=`
      <div class="rlb-value-card"><span class="rlb-value-icon">●</span><div><b>Monitoramento ativo</b><span>O Radar acompanha novas publicações e alimenta o Feed ao Vivo enquanto o serviço está disponível.</span></div></div>
      <div class="rlb-value-card"><span class="rlb-value-icon">⌕</span><div><b>Busca inteligente</b><span>Localize oportunidades por objeto, localidade, modalidade, órgão, fonte e demais critérios.</span></div></div>
      <div class="rlb-value-card"><span class="rlb-value-icon">✓</span><div><b>Fontes oficiais</b><span>Acesse o PNCP e, quando informado pelo registro oficial, o portal de origem da contratação.</span></div></div>`;
    hero.insertAdjacentElement('afterend',strip);
  }

  function refineCopy(){
    const hero=$('#rlbInstitutionalHero');
    if(!hero)return;
    const eye=hero.querySelector('.rlb-hero-eyebrow');
    const h=hero.querySelector('h1');
    const p=hero.querySelector('p');
    if(eye)eye.innerHTML='<i></i> inteligência para oportunidades públicas';
    if(h)h.textContent='Descubra, acompanhe e organize oportunidades de contratação pública em um só ambiente.';
    if(p)p.textContent='Use dados oficiais para pesquisar licitações, acompanhar novas publicações e chegar mais rápido às oportunidades relevantes para sua atuação.';
  }

  function install(){
    installThemeControl();
    replaceUsageGuide();
    refineCopy();
    setTheme(safeTheme(),false);
  }

  const initial=safeTheme();
  document.documentElement.dataset.theme=initial;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
