(()=>{
  'use strict';
  const $=(s,r=document)=>r.querySelector(s);
  let currentUser=null;
  let probing=false;
  let probeTimer=null;

  function uiLooksAuthenticated(){
    const auth=$('#auth');
    const app=$('#app');
    if(!auth||!app)return false;
    const authHidden=auth.classList.contains('hidden')||auth.hidden||getComputedStyle(auth).display==='none';
    const appVisible=!app.classList.contains('hidden')&&!app.hidden&&getComputedStyle(app).display!=='none';
    return authHidden&&appVisible;
  }

  function revealSharedFeatures(){
    document.body?.classList.add('rlb-platform-authenticated');

    const theme=$('#rlbThemeControl');
    if(theme){
      theme.hidden=false;
      theme.classList.remove('hidden');
      theme.style.removeProperty('display');
      theme.removeAttribute('aria-hidden');
    }

    const aiLauncher=$('#rlbAiLauncher');
    if(aiLauncher){
      aiLauncher.hidden=false;
      aiLauncher.classList.remove('hidden');
      aiLauncher.style.removeProperty('display');
      aiLauncher.removeAttribute('aria-hidden');
    }

    const sidebarAi=$('#rlbSidebarAi');
    if(sidebarAi){
      sidebarAi.hidden=false;
      sidebarAi.classList.remove('hidden');
      sidebarAi.style.removeProperty('display');
      sidebarAi.removeAttribute('aria-hidden');
    }
  }

  function hideSharedFeatures(){
    document.body?.classList.remove('rlb-platform-authenticated');
    const panel=$('#rlbAiPanel');
    if(panel)panel.hidden=true;
  }

  function enforceRoleBoundaries(user){
    const isAdmin=user?.role==='admin';
    const admin=$('#adminTab');
    const adminGroup=$('#rlbAdminNavGroup');
    const quickAdmin=$('#rlbQuickAdmin');

    if(!isAdmin){
      if(admin){admin.classList.add('hidden');admin.hidden=true;admin.setAttribute('aria-hidden','true')}
      if(adminGroup){adminGroup.classList.add('hidden');adminGroup.hidden=true;adminGroup.setAttribute('aria-hidden','true')}
      if(quickAdmin)quickAdmin.hidden=true;
    }
  }

  function applyAuthenticated(user){
    currentUser=user||currentUser;
    revealSharedFeatures();
    enforceRoleBoundaries(currentUser);
  }

  async function probeSession(){
    if(probing)return currentUser;
    probing=true;
    try{
      const r=await fetch('/api/me',{credentials:'same-origin',headers:{accept:'application/json'},cache:'no-store'});
      if(!r.ok){
        currentUser=null;
        if(!uiLooksAuthenticated())hideSharedFeatures();
        return null;
      }
      const d=await r.json().catch(()=>({}));
      if(d?.user){
        currentUser=d.user;
        applyAuthenticated(d.user);
        return d.user;
      }
      return null;
    }catch{
      if(uiLooksAuthenticated())revealSharedFeatures();
      return currentUser;
    }finally{
      probing=false;
    }
  }

  function sync(){
    if(uiLooksAuthenticated()){
      revealSharedFeatures();
      probeSession();
    }else{
      clearTimeout(probeTimer);
      probeTimer=setTimeout(probeSession,120);
    }
  }

  function observeAuthState(){
    const targets=[$('#auth'),$('#app')].filter(Boolean);
    if(!targets.length)return;
    const observer=new MutationObserver(sync);
    targets.forEach(el=>observer.observe(el,{attributes:true,attributeFilter:['class','hidden','style']}));
  }

  function observeLateFeatures(){
    const observer=new MutationObserver(()=>{
      if(currentUser||uiLooksAuthenticated())revealSharedFeatures();
      if(currentUser)enforceRoleBoundaries(currentUser);
    });
    observer.observe(document.documentElement,{childList:true,subtree:true});
  }

  function install(){
    observeAuthState();
    observeLateFeatures();
    sync();
    [200,600,1200,2500,5000].forEach(ms=>setTimeout(sync,ms));
    document.addEventListener('click',e=>{
      if(e.target.closest('#authBtn,#logout,#tabLogin,#tabRegister')){
        [150,500,1000,2000,4000].forEach(ms=>setTimeout(sync,ms));
      }
    },true);
    window.addEventListener('pageshow',sync);
    window.addEventListener('focus',sync);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync()});
    setInterval(()=>{if(uiLooksAuthenticated()||currentUser)probeSession();},15000);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
