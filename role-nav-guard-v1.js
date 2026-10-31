(()=>{
'use strict';
if(window.__rlbRoleNavGuardV1)return;
window.__rlbRoleNavGuardV1=true;

const adminNav=()=>document.getElementById('adminNav');
const adminView=()=>document.getElementById('view-admin');
const radarNav=()=>document.querySelector('#mainNav [data-view="radar"]');

function applyRole(role){
  const isAdmin=role==='admin';
  const nav=adminNav();
  if(nav){
    nav.classList.toggle('hidden',!isAdmin);
    nav.hidden=!isAdmin;
    nav.setAttribute('aria-hidden',String(!isAdmin));
    if(!isAdmin){
      nav.style.setProperty('display','none','important');
      nav.tabIndex=-1;
    }else{
      nav.style.removeProperty('display');
      nav.removeAttribute('tabindex');
    }
  }

  if(!isAdmin&&adminView()?.classList.contains('active')){
    radarNav()?.click();
  }
  document.documentElement.dataset.rlbRole=isAdmin?'admin':'user';
}

async function syncRole(){
  try{
    const response=await fetch('/api/me',{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
    if(!response.ok){applyRole('user');return;}
    const data=await response.json().catch(()=>({}));
    applyRole(data?.user?.role||'user');
  }catch{
    applyRole('user');
  }
}

function init(){
  applyRole('user');
  syncRole();
  const shell=document.getElementById('appShell');
  if(shell){
    new MutationObserver(()=>{
      if(!shell.classList.contains('hidden'))syncRole();
    }).observe(shell,{attributes:true,attributeFilter:['class']});
  }
  document.getElementById('authForm')?.addEventListener('submit',()=>setTimeout(syncRole,450));
  window.addEventListener('pageshow',syncRole);
  window.addEventListener('focus',syncRole);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
