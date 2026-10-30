(()=>{
  const ACTIVE_CLASS='rlb-platform-authenticated';
  const $=s=>document.querySelector(s);

  function isAuthenticatedView(){
    const auth=$('#auth');
    if(!auth)return false;
    return auth.classList.contains('hidden') || getComputedStyle(auth).display==='none';
  }

  function syncAuthenticatedUi(){
    const active=isAuthenticatedView();
    document.body?.classList.toggle(ACTIVE_CLASS,active);

    const aiPanel=$('#rlbAiPanel');
    if(!active && aiPanel)aiPanel.hidden=true;

    const aiHistory=$('#rlbAiHistory');
    if(!active && aiHistory)aiHistory.hidden=true;

    return active;
  }

  function boundedSync(){
    syncAuthenticatedUi();
    requestAnimationFrame(syncAuthenticatedUi);
    setTimeout(syncAuthenticatedUi,80);
    setTimeout(syncAuthenticatedUi,280);
    setTimeout(syncAuthenticatedUi,750);
    setTimeout(syncAuthenticatedUi,1600);
  }

  document.addEventListener('click',e=>{
    if(e.target.closest('#authBtn,#logout,#tabLogin,#tabRegister'))boundedSync();
  },true);

  document.addEventListener('submit',boundedSync,true);
  window.addEventListener('pageshow',boundedSync);

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boundedSync,{once:true});
  else boundedSync();
})();
