(()=>{
  'use strict';
  const STORAGE_KEY='rlb-theme';
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));

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
      control=document.createElement('div');
      control.id='rlbThemeControl';
      control.className='rlb-theme-control';
      control.setAttribute('role','group');
      control.setAttribute('aria-label','Tema da interface');
      control.innerHTML='<button type="button" data-rlb-theme="light" aria-pressed="false"><span class="rlb-theme-icon">☀</span> Claro</button><button type="button" data-rlb-theme="dark" aria-pressed="false"><span class="rlb-theme-icon">◐</span> Escuro</button>';
      control.addEventListener('click',e=>{const btn=e.target.closest('[data-rlb-theme]');if(btn)setTheme(btn.dataset.rlbTheme,true)});
      if(who)top.insertBefore(control,who);else top.appendChild(control);
    }
    setTheme(safeTheme(),false);
  }

  function installDashboardStyle(){
    let st=$('#rlbMovementDashboardStyle');if(st)st.remove();
    st=document.createElement('style');st.id='rlbMovementDashboardStyle';
    st.textContent=`
      #rlbPlatformValue.rlb-movement-dashboard{display:block!important;margin:0 0 18px!important;padding:18px!important;border:1px solid var(--rlb3-line,#d9e4eb)!important;border-radius:16px!important;background:var(--rlb3-surface,#fff)!important;box-shadow:0 10px 28px rgba(17,49,74,.07)!important;color:var(--rlb3-text,#102f4b)!important}
      .rlb-mv-head{display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:16px!important;margin-bottom:14px!important}.rlb-mv-head-copy{min-width:0!important}.rlb-mv-kicker{display:block!important;margin-bottom:4px!important;color:#0b74de!important;font-size:8.5px!important;font-weight:900!important;text-transform:uppercase!important;letter-spacing:.1em!important}.rlb-mv-head h3{margin:0!important;font-size:17px!important;line-height:1.25!important;font-weight:850!important}.rlb-mv-head p{margin:5px 0 0!important;color:var(--rlb3-muted,#718596)!important;font-size:9.5px!important;line-height:1.5!important}.rlb-mv-refresh{min-height:36px!important;padding:0 12px!important;border:1px solid var(--rlb3-line,#d9e4eb)!important;border-radius:9px!important;background:var(--rlb3-surface-soft,#f8fbfd)!important;color:var(--rlb3-text,#102f4b)!important;font-size:9px!important;font-weight:800!important;cursor:pointer!important;white-space:nowrap!important}
      .rlb-mv-grid{display:grid!important;grid-template-columns:repeat(6,minmax(0,1fr))!important;gap:9px!important}.rlb-mv-card{padding:12px!important;border:1px solid var(--rlb3-line,#d9e4eb)!important;border-radius:11px!important;background:var(--rlb3-surface-soft,#f8fbfd)!important}.rlb-mv-card span{display:block!important;color:var(--rlb3-muted,#718596)!important;font-size:8px!important;font-weight:800!important;text-transform:uppercase!important;letter-spacing:.05em!important}.rlb-mv-card strong{display:block!important;margin-top:6px!important;font-size:18px!important;line-height:1!important;font-weight:900!important}.rlb-mv-card small{display:block!important;margin-top:5px!important;color:var(--rlb3-muted,#718596)!important;font-size:7.8px!important;line-height:1.35!important}
      .rlb-mv-lower{display:grid!important;grid-template-columns:1.1fr 1.1fr 1.5fr!important;gap:10px!important;margin-top:10px!important}.rlb-mv-panel{padding:12px!important;border:1px solid var(--rlb3-line,#d9e4eb)!important;border-radius:11px!important;background:var(--rlb3-surface-soft,#f8fbfd)!important}.rlb-mv-panel h4{margin:0 0 9px!important;font-size:10px!important;font-weight:850!important}.rlb-mv-list{display:grid!important;gap:6px!important}.rlb-mv-row{display:flex!important;justify-content:space-between!important;gap:12px!important;align-items:center!important;font-size:8.8px!important}.rlb-mv-row b{font-size:9px!important}.rlb-mv-bars{display:grid!important;grid-template-columns:repeat(7,minmax(0,1fr))!important;gap:5px!important;align-items:end!important;height:82px!important}.rlb-mv-bar{display:grid!important;grid-template-rows:1fr auto!important;gap:4px!important;height:100%!important;align-items:end!important}.rlb-mv-bar i{display:block!important;min-height:3px!important;border-radius:5px 5px 2px 2px!important;background:linear-gradient(180deg,#0b74de,#075fc7)!important}.rlb-mv-bar small{text-align:center!important;color:var(--rlb3-muted,#718596)!important;font-size:7px!important}.rlb-mv-foot{display:flex!important;justify-content:space-between!important;gap:12px!important;align-items:flex-start!important;margin-top:10px!important;padding-top:10px!important;border-top:1px solid var(--rlb3-line,#d9e4eb)!important;color:var(--rlb3-muted,#718596)!important;font-size:7.8px!important;line-height:1.45!important}.rlb-mv-loading,.rlb-mv-error{padding:16px!important;border:1px dashed var(--rlb3-line,#d9e4eb)!important;border-radius:10px!important;text-align:center!important;color:var(--rlb3-muted,#718596)!important;font-size:9px!important}
      html[data-theme="dark"] #rlbPlatformValue.rlb-movement-dashboard{background:#0f1d29!important;border-color:#243746!important;color:#edf6fb!important}html[data-theme="dark"] .rlb-mv-card,html[data-theme="dark"] .rlb-mv-panel,html[data-theme="dark"] .rlb-mv-refresh{background:#122330!important;border-color:#243746!important;color:#edf6fb!important}html[data-theme="dark"] .rlb-mv-head p,html[data-theme="dark"] .rlb-mv-card span,html[data-theme="dark"] .rlb-mv-card small,html[data-theme="dark"] .rlb-mv-foot,html[data-theme="dark"] .rlb-mv-bar small{color:#8fa5b4!important}
      @media(max-width:1050px){.rlb-mv-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}.rlb-mv-lower{grid-template-columns:1fr 1fr!important}.rlb-mv-lower .rlb-mv-panel:last-child{grid-column:1/-1!important}}@media(max-width:700px){.rlb-mv-head{flex-direction:column!important}.rlb-mv-refresh{width:100%!important}.rlb-mv-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}.rlb-mv-lower{grid-template-columns:1fr!important}.rlb-mv-lower .rlb-mv-panel:last-child{grid-column:auto!important}}
    `;
    document.head.appendChild(st);
  }

  const num=v=>Number(v||0).toLocaleString('pt-BR');
  const dec=v=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1});

  function buildMovementDashboard(){
    const hero=$('#rlbInstitutionalHero');if(!hero)return false;
    $('#rlbUsageGuide')?.remove();$('#rlbFunctionalIntelligenceV12')?.remove();$$('.rlb-command-center').forEach(x=>x.remove());
    let section=$('#rlbPlatformValue');if(!section){section=document.createElement('section');hero.insertAdjacentElement('afterend',section)}
    section.id='rlbPlatformValue';section.className='rlb-platform-value rlb-movement-dashboard';
    section.innerHTML=`
      <div class="rlb-mv-head"><div class="rlb-mv-head-copy"><span class="rlb-mv-kicker">Movimentação nacional monitorada</span><h3>Panorama real de licitações acompanhadas pelo Radar</h3><p>Indicadores calculados em tempo real sobre os registros efetivamente armazenados pelo monitor do Radar a partir do PNCP.</p></div><button type="button" class="rlb-mv-refresh" id="rlbMvRefresh">Atualizar dados</button></div>
      <div id="rlbMvContent"><div class="rlb-mv-loading">Carregando indicadores reais da base de produção...</div></div>`;
    $('#rlbMvRefresh',section)?.addEventListener('click',loadMovementMetrics);
    return true;
  }

  async function loadMovementMetrics(){
    const root=$('#rlbMvContent');if(!root)return;
    root.innerHTML='<div class="rlb-mv-loading">Atualizando indicadores da base de produção...</div>';
    try{
      const r=await fetch('/api/movement-metrics',{credentials:'same-origin',headers:{accept:'application/json'},cache:'no-store'});const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||'Não foi possível carregar os indicadores.');
      const s=d.summary||{},states=Array.isArray(d.top_states)?d.top_states:[],mods=Array.isArray(d.top_modalities)?d.top_modalities:[],daily=Array.isArray(d.daily_7d)?d.daily_7d:[];
      const max=Math.max(1,...daily.map(x=>Number(x.total||0)));
      root.innerHTML=`
        <div class="rlb-mv-grid">
          <div class="rlb-mv-card"><span>Últimas 24h</span><strong>${num(s.last_24h)}</strong><small>publicações registradas</small></div>
          <div class="rlb-mv-card"><span>Últimos 7 dias</span><strong>${num(s.last_7d)}</strong><small>registros monitorados</small></div>
          <div class="rlb-mv-card"><span>Últimos 30 dias</span><strong>${num(s.last_30d)}</strong><small>movimentação monitorada</small></div>
          <div class="rlb-mv-card"><span>Média diária</span><strong>${dec(s.avg_daily_30d)}</strong><small>registros/dia em 30 dias</small></div>
          <div class="rlb-mv-card"><span>Propostas abertas</span><strong>${num(s.open_now)}</strong><small>com encerramento futuro</small></div>
          <div class="rlb-mv-card"><span>Base monitorada</span><strong>${num(s.total_stored)}</strong><small>registros armazenados</small></div>
        </div>
        <div class="rlb-mv-lower">
          <div class="rlb-mv-panel"><h4>UFs com maior volume • 30 dias</h4><div class="rlb-mv-list">${states.map(x=>`<div class="rlb-mv-row"><span>${String(x.uf||'N/I')}</span><b>${num(x.total)}</b></div>`).join('')||'<div class="rlb-mv-row"><span>Sem dados</span><b>—</b></div>'}</div></div>
          <div class="rlb-mv-panel"><h4>Modalidades mais frequentes • 30 dias</h4><div class="rlb-mv-list">${mods.map(x=>`<div class="rlb-mv-row"><span>${String(x.name||'Não informada')}</span><b>${num(x.total)}</b></div>`).join('')||'<div class="rlb-mv-row"><span>Sem dados</span><b>—</b></div>'}</div></div>
          <div class="rlb-mv-panel"><h4>Movimentação diária • últimos 7 dias</h4><div class="rlb-mv-bars">${daily.map(x=>`<div class="rlb-mv-bar" title="${String(x.day)}: ${num(x.total)}"><i style="height:${Math.max(4,Math.round((Number(x.total||0)/max)*60))}px"></i><small>${String(x.day)}</small></div>`).join('')}</div></div>
        </div>
        <div class="rlb-mv-foot"><span>Fonte: ${String(d.source||'Radar/PNCP')}</span><span>${String(d.scope||'')}</span></div>`;
    }catch(e){root.innerHTML=`<div class="rlb-mv-error">${String(e.message||'Falha temporária ao carregar os indicadores.')}</div>`}
  }

  function refineCopy(){
    const hero=$('#rlbInstitutionalHero');if(!hero)return;
    const eye=hero.querySelector('.rlb-hero-eyebrow'),h=hero.querySelector('h1'),p=hero.querySelector('p');
    if(eye)eye.innerHTML='<i></i> inteligência para oportunidades públicas';
    if(h)h.textContent='Descubra, acompanhe e organize oportunidades de contratação pública em um só ambiente.';
    if(p)p.textContent='Use dados oficiais para pesquisar licitações, acompanhar novas publicações e chegar mais rápido às oportunidades relevantes para sua atuação.';
  }

  function install(){
    installThemeControl();installDashboardStyle();refineCopy();buildMovementDashboard();loadMovementMetrics();
    setInterval(loadMovementMetrics,240000);
  }

  const initial=safeTheme();document.documentElement.dataset.theme=initial;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
