(()=>{
  'use strict';
  if(window.__RLB_NOTIFICATION_ENTRY_V15__)return;
  window.__RLB_NOTIFICATION_ENTRY_V15__=true;

  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));

  function installStyle(){
    let st=$('#rlbNotificationEntryStyle');
    if(st)st.remove();
    st=document.createElement('style');
    st.id='rlbNotificationEntryStyle';
    st.textContent=`
      #rlbPlatformValue.rlb-notification-entry{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:20px!important;align-items:center!important;margin:0 0 18px!important;padding:20px 22px!important;border:1px solid var(--rlb3-line,#d9e4eb)!important;border-radius:16px!important;background:linear-gradient(135deg,var(--rlb3-surface,#fff),var(--rlb3-surface-soft,#f8fbfd))!important;box-shadow:0 10px 28px rgba(17,49,74,.07)!important;position:relative!important;overflow:hidden!important;z-index:5!important}
      #rlbPlatformValue.rlb-notification-entry:after{content:'';position:absolute;right:-70px;top:-95px;width:220px;height:220px;border-radius:50%;background:radial-gradient(circle,rgba(37,99,235,.12),transparent 68%);pointer-events:none}
      .rlb-notification-entry-main{display:grid!important;grid-template-columns:54px minmax(0,1fr)!important;gap:15px!important;align-items:center!important;min-width:0!important}
      .rlb-notification-entry-icon{width:54px!important;height:54px!important;display:grid!important;place-items:center!important;border-radius:14px!important;background:rgba(37,99,235,.09)!important;border:1px solid rgba(37,99,235,.18)!important;color:#2563eb!important}
      .rlb-notification-entry-icon svg{width:26px!important;height:26px!important;fill:none!important;stroke:currentColor!important;stroke-width:1.8!important;stroke-linecap:round!important;stroke-linejoin:round!important}
      .rlb-notification-entry-copy{min-width:0!important}.rlb-notification-entry-copy>span{display:block!important;margin-bottom:4px!important;color:#2563eb!important;font-size:8.5px!important;font-weight:900!important;text-transform:uppercase!important;letter-spacing:.1em!important}.rlb-notification-entry-copy h3{margin:0!important;color:var(--rlb3-text,#102f4b)!important;font-size:16px!important;line-height:1.25!important;font-weight:850!important}.rlb-notification-entry-copy p{margin:6px 0 0!important;color:var(--rlb3-muted,#718596)!important;font-size:10px!important;line-height:1.55!important;max-width:780px!important}
      .rlb-notification-entry-channels{display:flex!important;gap:7px!important;flex-wrap:wrap!important;margin-top:10px!important}.rlb-notification-entry-channels span{display:inline-flex!important;align-items:center!important;gap:5px!important;padding:5px 8px!important;border-radius:999px!important;border:1px solid var(--rlb3-line,#d9e4eb)!important;background:var(--rlb3-surface,#fff)!important;color:var(--rlb3-text-2,#35556b)!important;font-size:8.5px!important;font-weight:750!important}.rlb-notification-entry-channels i{width:6px!important;height:6px!important;border-radius:50%!important;background:#10b981!important}
      .rlb-notification-entry-action{position:relative!important;z-index:2!important;min-width:190px!important;min-height:46px!important;padding:0 16px!important;border:0!important;border-radius:11px!important;background:linear-gradient(135deg,#075fc7,#0b74de)!important;color:#fff!important;font-size:10px!important;font-weight:850!important;cursor:pointer!important;box-shadow:0 8px 20px rgba(7,95,199,.22)!important;transition:transform .16s ease,box-shadow .16s ease!important}.rlb-notification-entry-action:hover{transform:translateY(-1px)!important;box-shadow:0 11px 25px rgba(7,95,199,.28)!important}.rlb-notification-entry-action:focus-visible{outline:3px solid rgba(37,99,235,.25)!important;outline-offset:2px!important}.rlb-notification-entry-note{display:block!important;margin-top:6px!important;color:var(--rlb3-muted,#718596)!important;font-size:8px!important;text-align:center!important;position:relative!important;z-index:2!important}
      html[data-theme="dark"] #rlbPlatformValue.rlb-notification-entry{background:linear-gradient(135deg,#0f1d29,#122330)!important;border-color:#243746!important}html[data-theme="dark"] .rlb-notification-entry-copy h3{color:#edf6fb!important}html[data-theme="dark"] .rlb-notification-entry-copy p,html[data-theme="dark"] .rlb-notification-entry-note{color:#8fa5b4!important}html[data-theme="dark"] .rlb-notification-entry-channels span{background:#0f1d29!important;border-color:#243746!important;color:#c6d7e1!important}
      @media(max-width:850px){#rlbPlatformValue.rlb-notification-entry{grid-template-columns:1fr!important}.rlb-notification-entry-action{width:100%!important}.rlb-notification-entry-note{text-align:left!important}}
      @media(max-width:600px){#rlbPlatformValue.rlb-notification-entry{padding:16px!important}.rlb-notification-entry-main{grid-template-columns:44px minmax(0,1fr)!important}.rlb-notification-entry-icon{width:44px!important;height:44px!important}.rlb-notification-entry-copy h3{font-size:14px!important}}
    `;
    document.head.appendChild(st);
  }

  function openNotifications(){
    try{if(typeof window.RLBNotificationsOpen==='function'){window.RLBNotificationsOpen();return true}}catch{}
    const nav=$('#rlbNotificationsNav')||$('#rlbQuickNotifications')||$('[data-view="notifications"]');
    if(nav){nav.click();return true}
    const view=$('#view-notifications');
    if(view){
      $$('section[id^="view-"]').forEach(s=>{if(s!==view){s.hidden=true;s.classList.add('hidden')}});
      view.hidden=false;view.classList.remove('hidden');view.style.display='';
      view.scrollIntoView({behavior:'smooth',block:'start'});
      return true;
    }
    return false;
  }

  function openWithRetry(){
    if(openNotifications())return;
    let tries=0;
    const timer=setInterval(()=>{tries+=1;if(openNotifications()||tries>=8)clearInterval(timer)},250);
  }

  function build(){
    const hero=$('#rlbInstitutionalHero');
    if(!hero)return false;
    $('#rlbUsageGuide')?.remove();
    $('#rlbFunctionalIntelligenceV12')?.remove();
    $$('.rlb-command-center').forEach(x=>x.remove());
    let section=$('#rlbPlatformValue');
    if(!section){section=document.createElement('section');hero.insertAdjacentElement('afterend',section)}
    section.id='rlbPlatformValue';
    section.className='rlb-platform-value rlb-notification-entry';
    section.innerHTML=`
      <div class="rlb-notification-entry-main">
        <span class="rlb-notification-entry-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/><path d="M12 2v2"/></svg></span>
        <div class="rlb-notification-entry-copy">
          <span>Central de notificações</span>
          <h3>Receba novas licitações no Radar e configure seus canais de aviso.</h3>
          <p>Cadastre e confirme seu e-mail e WhatsApp, escolha os canais de cada alerta e acompanhe as notificações da sua conta em um único lugar.</p>
          <div class="rlb-notification-entry-channels"><span><i></i> Radar no site</span><span><i></i> E-mail</span><span><i></i> WhatsApp</span></div>
        </div>
      </div>
      <div><button type="button" class="rlb-notification-entry-action" id="rlbOpenNotificationCenter">Configurar notificações →</button><small class="rlb-notification-entry-note">Configuração individual por usuário</small></div>`;
    $('#rlbOpenNotificationCenter',section)?.addEventListener('click',openWithRetry);
    return true;
  }

  function install(){installStyle();build();[300,900,1800].forEach(ms=>setTimeout(build,ms))}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();