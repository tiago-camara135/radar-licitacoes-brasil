(()=>{
  'use strict';
  if(window.__RLB_MOVEMENT_PANEL_V2__)return;
  window.__RLB_MOVEMENT_PANEL_V2__=true;
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const fmt=v=>Number(v||0).toLocaleString('pt-BR');

  function installStyle(){
    if($('#rlbMovementPanelV2Style'))return;
    const st=document.createElement('style');
    st.id='rlbMovementPanelV2Style';
    st.textContent=`
      #rlbMovementDashboard{margin:0 0 16px;padding:16px;border:1px solid var(--rlb3-line,#d9e4eb);border-radius:14px;background:var(--rlb3-surface,#fff);box-shadow:0 8px 24px rgba(17,49,74,.06)}
      #rlbMovementDashboard .mv-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:12px}
      #rlbMovementDashboard .mv-head span{display:block;color:#0b74de;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.09em;margin-bottom:3px}
      #rlbMovementDashboard .mv-head h3{margin:0;color:var(--rlb3-text,#102f4b);font-size:16px;line-height:1.3}
      #rlbMovementDashboard .mv-head p{margin:4px 0 0;color:var(--rlb3-muted,#718596);font-size:9px;line-height:1.45}
      #rlbMovementDashboard .mv-badge{padding:6px 9px;border-radius:999px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.18);color:#059669;font-size:8px;font-weight:850;white-space:nowrap}
      #rlbMovementDashboard .mv-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}
      #rlbMovementDashboard .mv-card{padding:11px;border:1px solid var(--rlb3-line,#d9e4eb);border-radius:10px;background:var(--rlb3-surface-soft,#f8fbfd)}
      #rlbMovementDashboard .mv-card small{display:block;color:var(--rlb3-muted,#718596);font-size:7.7px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}
      #rlbMovementDashboard .mv-card strong{display:block;margin-top:5px;color:var(--rlb3-text,#102f4b);font-size:20px;line-height:1;font-weight:900}
      #rlbMovementDashboard .mv-bottom{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
      #rlbMovementDashboard .mv-list{padding:10px 11px;border:1px solid var(--rlb3-line,#d9e4eb);border-radius:10px;background:var(--rlb3-surface-soft,#f8fbfd)}
      #rlbMovementDashboard .mv-list b{display:block;margin-bottom:6px;color:var(--rlb3-text,#102f4b);font-size:9px}
      #rlbMovementDashboard .mv-pills{display:flex;gap:6px;flex-wrap:wrap}
      #rlbMovementDashboard .mv-pills span{padding:4px 7px;border-radius:999px;background:var(--rlb3-surface,#fff);border:1px solid var(--rlb3-line,#d9e4eb);color:var(--rlb3-text-2,#35556b);font-size:8px;font-weight:800}
      #rlbMovementDashboard .mv-foot{margin-top:8px;color:var(--rlb3-muted,#718596);font-size:7.8px;line-height:1.45}
      html[data-theme="dark"] #rlbMovementDashboard{background:#0f1d29;border-color:#243746}html[data-theme="dark"] #rlbMovementDashboard .mv-card,html[data-theme="dark"] #rlbMovementDashboard .mv-list{background:#122330;border-color:#243746}html[data-theme="dark"] #rlbMovementDashboard .mv-head h3,html[data-theme="dark"] #rlbMovementDashboard .mv-card strong,html[data-theme="dark"] #rlbMovementDashboard .mv-list b{color:#edf6fb}html[data-theme="dark"] #rlbMovementDashboard .mv-pills span{background:#0f1d29;border-color:#243746;color:#c6d7e1}
      @media(max-width:1050px){#rlbMovementDashboard .mv-grid{grid-template-columns:repeat(3,1fr)}}@media(max-width:700px){#rlbMovementDashboard .mv-grid{grid-template-columns:repeat(2,1fr)}#rlbMovementDashboard .mv-bottom{grid-template-columns:1fr}.mv-badge{display:none}}
    `;
    document.head.appendChild(st);
  }

  async function loadMetrics(panel){
    try{
      const r=await fetch('/api/movement-metrics',{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||'Falha ao carregar indicadores');
      const s=d.summary||{};
      const values={mv24:s.last_24h,mv7:s.last_7d,mv30:s.last_30d,mvAvg:s.avg_daily_30d,mvOpen:s.open_now,mvTotal:s.total_stored};
      Object.entries(values).forEach(([id,v])=>{const el=$('#'+id,panel);if(el)el.textContent=fmt(v)});
      const states=$('#mvStates',panel);if(states)states.innerHTML=(d.top_states||[]).map(x=>`<span>${String(x.uf||'').toUpperCase()} · ${fmt(x.total)}</span>`).join('')||'<span>Sem dados suficientes</span>';
      const mods=$('#mvMods',panel);if(mods)mods.innerHTML=(d.top_modalities||[]).slice(0,5).map(x=>`<span>${String(x.name||'Modalidade')} · ${fmt(x.total)}</span>`).join('')||'<span>Sem dados suficientes</span>';
      const foot=$('#mvFoot',panel);if(foot)foot.textContent=`Fonte: ${d.source}. Atualizado em ${new Date(d.generated_at).toLocaleString('pt-BR')}. ${d.scope}`;
    }catch(e){
      const foot=$('#mvFoot',panel);if(foot)foot.textContent='Os indicadores estão temporariamente indisponíveis. O restante do Radar continua operacional.';
    }
  }

  function build(){
    const hero=$('#rlbInstitutionalHero');if(!hero)return false;
    $('#rlbUsageGuide')?.remove();
    $('#rlbPlatformValue')?.remove();
    $$('.rlb-command-center').forEach(x=>x.remove());
    let panel=$('#rlbMovementDashboard');
    if(!panel){panel=document.createElement('section');panel.id='rlbMovementDashboard';hero.insertAdjacentElement('afterend',panel)}
    panel.innerHTML=`<div class="mv-head"><div><span>Movimentação nacional monitorada</span><h3>Panorama real de licitações acompanhadas pelo Radar</h3><p>Indicadores calculados sobre registros efetivamente armazenados a partir do PNCP.</p></div><div class="mv-badge">Dados reais da base</div></div><div class="mv-grid"><div class="mv-card"><small>Últimas 24h</small><strong id="mv24">—</strong></div><div class="mv-card"><small>Últimos 7 dias</small><strong id="mv7">—</strong></div><div class="mv-card"><small>Últimos 30 dias</small><strong id="mv30">—</strong></div><div class="mv-card"><small>Média diária 30d</small><strong id="mvAvg">—</strong></div><div class="mv-card"><small>Propostas abertas</small><strong id="mvOpen">—</strong></div><div class="mv-card"><small>Base monitorada</small><strong id="mvTotal">—</strong></div></div><div class="mv-bottom"><div class="mv-list"><b>UFs com maior movimentação · 30 dias</b><div id="mvStates" class="mv-pills"><span>Carregando…</span></div></div><div class="mv-list"><b>Modalidades mais frequentes · 30 dias</b><div id="mvMods" class="mv-pills"><span>Carregando…</span></div></div></div><div id="mvFoot" class="mv-foot">Calculando indicadores da base real do Radar…</div>`;
    loadMetrics(panel);
    return true;
  }

  function install(){
    installStyle();
    build();
    const observer=new MutationObserver(()=>{if($('#rlbUsageGuide')||!$('#rlbMovementDashboard'))build()});
    observer.observe(document.body,{childList:true,subtree:true});
    setTimeout(()=>observer.disconnect(),12000);
    [300,900,1800,3500].forEach(ms=>setTimeout(build,ms));
  }
  if(document.readyState==='complete')install();else window.addEventListener('load',install,{once:true});
})();
