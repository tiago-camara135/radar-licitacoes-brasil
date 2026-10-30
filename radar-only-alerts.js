(()=>{
  let lastActive=null;

  function radarActive(){
    const app=document.querySelector('#app');
    if(!app||app.classList.contains('hidden'))return false;
    return !!document.querySelector('.nav button[data-view="radar"].active');
  }

  function syncAlertVisibility(){
    const active=radarActive();
    if(active===lastActive)return;
    lastActive=active;

    document.body.classList.toggle('rlb-radar-active',active);

    const center=document.querySelector('#auto-notifications');
    if(center){
      center.hidden=!active;
      center.setAttribute('aria-hidden',active?'false':'true');
    }

    const popup=document.querySelector('#rlbFloatingAlert');
    if(popup){
      popup.classList.remove('show');
      popup.setAttribute('aria-hidden',active?'false':'true');
    }
  }

  function install(){
    if(!document.querySelector('#rlb-radar-only-style')){
      const style=document.createElement('style');
      style.id='rlb-radar-only-style';
      style.textContent='body:not(.rlb-radar-active) #auto-notifications,body:not(.rlb-radar-active) #rlbFloatingAlert{display:none!important}';
      document.head.appendChild(style);
    }

    const nav=document.querySelector('.nav');
    if(nav){
      nav.addEventListener('click',e=>{
        if(e.target.closest('button[data-view]'))requestAnimationFrame(()=>{lastActive=null;syncAlertVisibility()});
      });

      nav.querySelectorAll('button[data-view]').forEach(btn=>{
        new MutationObserver(()=>{lastActive=null;syncAlertVisibility()}).observe(btn,{attributes:true,attributeFilter:['class']});
      });
    }

    const app=document.querySelector('#app');
    if(app){
      new MutationObserver(()=>{lastActive=null;syncAlertVisibility()}).observe(app,{attributes:true,attributeFilter:['class']});
      new MutationObserver(()=>{lastActive=null;syncAlertVisibility()}).observe(app,{childList:true});
    }

    syncAlertVisibility();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
