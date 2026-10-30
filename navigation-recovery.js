(()=>{
  'use strict';
  const $=(s,r=document)=>r.querySelector(s);
  let busy=false;

  function ensureQuickAccess(){
    const top=$('.top');
    if(!top)return null;
    let box=$('#rlbQuickAccess');
    if(!box){
      box=document.createElement('div');
      box.id='rlbQuickAccess';
      box.className='rlb-quick-access';
      box.innerHTML=`
        <button type="button" id="rlbQuickNotifications" class="rlb-quick-access-btn notifications" hidden><span class="rlb-quick-access-dot"></span>Notificações</button>
        <button type="button" id="rlbQuickAdmin" class="rlb-quick-access-btn admin" hidden><span class="rlb-quick-access-dot"></span>Administração</button>`;
      const who=$('#who');
      if(who)who.insertAdjacentElement('beforebegin',box);else top.appendChild(box);
      $('#rlbQuickNotifications',box)?.addEventListener('click',()=>{
        if(typeof window.RLBNotificationsOpen==='function')return window.RLBNotificationsOpen();
        $('#rlbNotificationsNav')?.click();
      });
      $('#rlbQuickAdmin',box)?.addEventListener('click',()=>{
        const admin=$('#adminTab');
        if(admin)return admin.click();
        document.querySelectorAll('section[id^="view-"]').forEach(s=>s.classList.add('hidden'));
        $('#view-admin')?.classList.remove('hidden');
      });
    }
    return box;
  }

  function setAdminNavigation(isAdmin){
    const admin=$('#adminTab');
    const group=$('#rlbAdminNavGroup');
    const quick=$('#rlbQuickAdmin');
    for(const el of [admin,group]){
      if(!el)continue;
      el.hidden=!isAdmin;
      el.classList.toggle('hidden',!isAdmin);
      if(isAdmin){el.removeAttribute('aria-hidden');el.style.removeProperty('display')}
      else el.setAttribute('aria-hidden','true');
    }
    if(quick)quick.hidden=!isAdmin;
  }

  function setNotificationAccess(isAdmin){
    // The management shortcut in the top bar is administrator-only.
    // Standard users still receive in-app notifications automatically.
    const quick=$('#rlbQuickNotifications');
    if(quick)quick.hidden=!isAdmin;
    const nav=$('#rlbNotificationsNav');
    const group=$('#rlbNotificationsGroup');
    if(nav){nav.hidden=false;nav.classList.remove('hidden');nav.style.removeProperty('display')}
    if(group){group.hidden=false;group.classList.remove('hidden');group.style.removeProperty('display')}
  }

  function updateBoxVisibility(){
    const box=$('#rlbQuickAccess');
    if(!box)return;
    const visible=[...box.querySelectorAll('button')].some(b=>!b.hidden);
    box.classList.toggle('is-visible',visible);
  }

  async function recover(){
    if(busy)return;
    busy=true;
    try{
      const box=ensureQuickAccess();
      if(!box)return;
      const auth=$('#auth'),app=$('#app');
      const authenticated=Boolean(app&&!app.classList.contains('hidden')&&auth&&(auth.classList.contains('hidden')||getComputedStyle(auth).display==='none'));
      if(!authenticated){
        box.querySelectorAll('button').forEach(b=>b.hidden=true);
        updateBoxVisibility();
        return;
      }
      const r=await fetch('/api/me',{credentials:'same-origin',headers:{accept:'application/json'},cache:'no-store'});
      if(!r.ok)return;
      const d=await r.json().catch(()=>({}));
      const user=d?.user;
      if(!user)return;
      const isAdmin=user.role==='admin';
      setAdminNavigation(isAdmin);
      setNotificationAccess(isAdmin);
      updateBoxVisibility();
      const who=$('#who');
      if(who)who.textContent=isAdmin?`${user.email} • ADMIN`:user.email;
      document.body?.classList.toggle('rlb-role-admin',isAdmin);
      document.body?.classList.toggle('rlb-role-user',!isAdmin);
    }catch(e){
      console.warn('navigation recovery:',e?.message||e);
    }finally{busy=false}
  }

  function install(){
    ensureQuickAccess();
    [0,150,400,900,1800,3500,7000].forEach(ms=>setTimeout(recover,ms));
    $('#authBtn')?.addEventListener('click',()=>[250,700,1400,2500].forEach(ms=>setTimeout(recover,ms)));
    window.addEventListener('pageshow',recover);
    window.addEventListener('focus',recover);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)recover()});
    setInterval(recover,30000).unref?.();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();