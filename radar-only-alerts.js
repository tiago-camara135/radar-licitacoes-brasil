(()=>{
  let scheduled=false;

  function radarActive(){
    const app=document.querySelector('#app');
    if(!app||app.classList.contains('hidden'))return false;
    const radarBtn=document.querySelector('.nav button[data-view="radar"]');
    return !!radarBtn?.classList.contains('active');
  }

  function syncAlertVisibility(){
    scheduled=false;
    const active=radarActive();
    const center=document.querySelector('#auto-notifications');
    const popup=document.querySelector('#rlbFloatingAlert');

    if(center){
      center.style.display=active?'':'none';
      center.setAttribute('aria-hidden',active?'false':'true');
    }

    if(!active&&popup){
      popup.classList.remove('show');
      popup.setAttribute('aria-hidden','true');
    }else if(active&&popup){
      popup.setAttribute('aria-hidden','false');
    }
  }

  function scheduleSync(){
    if(scheduled)return;
    scheduled=true;
    queueMicrotask(syncAlertVisibility);
  }

  function start(){
    syncAlertVisibility();

    document.addEventListener('click',e=>{
      if(e.target.closest('.nav button[data-view]'))setTimeout(syncAlertVisibility,0);
    },true);

    const nav=document.querySelector('.nav');
    if(nav)new MutationObserver(scheduleSync).observe(nav,{subtree:true,attributes:true,attributeFilter:['class']});

    new MutationObserver(scheduleSync).observe(document.body,{
      subtree:true,
      childList:true,
      attributes:true,
      attributeFilter:['class']
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
