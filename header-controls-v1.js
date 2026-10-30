(()=>{
  'use strict';
  const STORAGE_KEY='rlb-theme';
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));

  function ensureStyle(){
    let st=$('#rlbHeaderControlsV1Style');
    if(st)st.remove();
    st=document.createElement('style');
    st.id='rlbHeaderControlsV1Style';
    st.textContent=`
      #rlbQuickAccess,#rlbQuickNotifications,#rlbQuickAdmin{display:none!important;visibility:hidden!important;pointer-events:none!important}
      #rlbThemeControl{display:inline-flex!important;align-items:center!important;gap:4px!important;padding:4px!important;margin-left:auto!important;border:1px solid var(--rlb3-line,var(--line,#d9e4eb))!important;border-radius:999px!important;background:color-mix(in srgb,var(--rlb3-surface,#fff) 94%,transparent)!important;box-shadow:0 7px 20px rgba(12,35,52,.07)!important;backdrop-filter:blur(10px)!important;flex:0 0 auto!important;visibility:visible!important;opacity:1!important}
      #rlbThemeControl button{display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;min-height:32px!important;padding:7px 10px!important;border:0!important;border-radius:999px!important;background:transparent!important;color:var(--rlb3-muted,#718596)!important;font:inherit!important;font-size:10px!important;font-weight:900!important;cursor:pointer!important;transition:background .15s ease,color .15s ease,box-shadow .15s ease!important}
      #rlbThemeControl button:hover{background:var(--rlb3-surface-soft,#f8fbfd)!important;color:var(--rlb3-text,#102f4b)!important}
      #rlbThemeControl button[aria-pressed="true"]{background:var(--rlb3-surface,#fff)!important;color:var(--rlb3-text,#102f4b)!important;box-shadow:0 3px 10px rgba(10,31,50,.10)!important}
      #rlbThemeControl .rlb-theme-icon{width:14px!important;height:14px!important;display:block!important;flex:0 0 14px!important}#rlbThemeControl .rlb-theme-icon svg{width:14px!important;height:14px!important;display:block!important}
      html[data-theme="dark"] #rlbThemeControl{background:#11232f!important;border-color:#2b4050!important}html[data-theme="dark"] #rlbThemeControl button{color:#8fa5b4!important}html[data-theme="dark"] #rlbThemeControl button:hover{background:#162936!important;color:#edf6fb!important}html[data-theme="dark"] #rlbThemeControl button[aria-pressed="true"]{background:#1a2d3a!important;color:#edf6fb!important;box-shadow:0 3px 12px rgba(0,0,0,.22)!important}
      @media(max-width:760px){#rlbThemeControl{order:2!important;margin-left:0!important}#rlbThemeControl button{padding:6px 8px!important;font-size:9px!important}}@media(max-width:520px){#rlbThemeControl .rlb-theme-label{display:none!important}#rlbThemeControl button{width:32px!important;padding:6px!important}}
    `;
    document.head.appendChild(st);
  }

  const sun=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`;
  const moon=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></svg>`;
  function preferredTheme(){try{const saved=localStorage.getItem(STORAGE_KEY);if(saved==='light'||saved==='dark')return saved}catch{}return window.matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'light'}
  function applyTheme(theme,persist=true){const next=theme==='dark'?'dark':'light';document.documentElement.dataset.theme=next;document.body?.setAttribute('data-theme',next);$$('#rlbThemeControl [data-rlb-theme]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.rlbTheme===next)));const meta=$('meta[name="theme-color"]');if(meta)meta.setAttribute('content',next==='dark'?'#08131e':'#f8fafc');if(persist){try{localStorage.setItem(STORAGE_KEY,next)}catch{}}}
  function removeTopShortcuts(){const q=$('#rlbQuickAccess');if(q){q.classList.remove('is-visible');q.setAttribute('aria-hidden','true')}$('#rlbQuickNotifications')?.setAttribute('hidden','');$('#rlbQuickAdmin')?.setAttribute('hidden','')}
  function installThemeControl(){const top=$('.top');if(!top)return false;let control=$('#rlbThemeControl');if(!control){control=document.createElement('div');control.id='rlbThemeControl';control.setAttribute('role','group');control.setAttribute('aria-label','Tema da interface');control.innerHTML=`<button type="button" data-rlb-theme="light" aria-pressed="false" aria-label="Usar tema claro"><span class="rlb-theme-icon">${sun}</span><span class="rlb-theme-label">Claro</span></button><button type="button" data-rlb-theme="dark" aria-pressed="false" aria-label="Usar tema escuro"><span class="rlb-theme-icon">${moon}</span><span class="rlb-theme-label">Escuro</span></button>`;control.addEventListener('click',e=>{const btn=e.target.closest('[data-rlb-theme]');if(btn)applyTheme(btn.dataset.rlbTheme,true)})}const who=$('#who');if(control.parentElement!==top){if(who)top.insertBefore(control,who);else top.appendChild(control)}else if(who&&control.nextElementSibling!==who)top.insertBefore(control,who);applyTheme(preferredTheme(),false);return true}
  function stabilize(){ensureStyle();removeTopShortcuts();installThemeControl()}
  window.RLBHeaderControlsStabilize=stabilize;
  function install(){stabilize();[100,300,700,1500,3000,6000].forEach(ms=>setTimeout(stabilize,ms));const observer=new MutationObserver(()=>{removeTopShortcuts();if(!$('#rlbThemeControl')||$('#rlbThemeControl')?.parentElement!==$('.top'))installThemeControl()});observer.observe(document.documentElement,{childList:true,subtree:true});setInterval(stabilize,5000);$('#authBtn')?.addEventListener('click',()=>[250,700,1400,2500,5000].forEach(ms=>setTimeout(stabilize,ms)));window.addEventListener('pageshow',stabilize);window.addEventListener('focus',stabilize);document.addEventListener('visibilitychange',()=>{if(!document.hidden)stabilize()})}
  const initial=preferredTheme();document.documentElement.dataset.theme=initial;
  if(document.readyState==='complete')install();else window.addEventListener('load',install,{once:true});
})();
