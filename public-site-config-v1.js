(()=>{
'use strict';
if(window.__rlbPublicSiteConfigV1)return;window.__rlbPublicSiteConfigV1=true;
const escText=v=>String(v??'').trim();
function setText(el,value){if(el&&escText(value))el.textContent=escText(value)}
function apply(config={}){
  const screen=document.getElementById('authScreen');if(!screen)return;
  setText(screen.querySelector('.auth-home-kicker'),config.landing_kicker);
  const h1=screen.querySelector('.auth-home-copy-inner h1');
  if(h1&&(config.landing_headline_primary||config.landing_headline_emphasis)){
    h1.replaceChildren();
    h1.append(document.createTextNode((escText(config.landing_headline_primary)||'Transforme o excesso de editais em')+' '));
    const em=document.createElement('em');em.textContent=escText(config.landing_headline_emphasis)||'decisões mais rápidas e oportunidades mais claras.';h1.append(em);
  }
  setText(screen.querySelector('.auth-home-copy-inner>p'),config.landing_subheadline);
  const company=screen.querySelector('.auth-home-company strong');if(company&&config.company_name)company.textContent='Criado e desenvolvido por '+escText(config.company_name);
  let notice=document.getElementById('rlbPublicNotice');
  if(config.public_notice_enabled&&escText(config.public_notice)){
    if(!notice){notice=document.createElement('div');notice.id='rlbPublicNotice';notice.className='rlb-public-notice';const shell=screen.querySelector('.auth-home-shell');const grid=shell?.querySelector('.auth-home-grid');if(shell&&grid)shell.insertBefore(notice,grid)}
    notice.innerHTML='';const dot=document.createElement('span');dot.className='rlb-public-notice-dot';const text=document.createElement('p');text.textContent=escText(config.public_notice);notice.append(dot,text);notice.hidden=false;
  }else if(notice)notice.hidden=true;
  const footer=screen.querySelector('.auth-home-footer');
  if(footer&&(config.support_email||config.support_whatsapp)){
    let contact=footer.querySelector('.rlb-public-contact');if(!contact){contact=document.createElement('div');contact.className='rlb-public-contact';footer.append(contact)}contact.replaceChildren();
    if(config.support_email){const a=document.createElement('a');a.href='mailto:'+escText(config.support_email);a.textContent=escText(config.support_email);contact.append(a)}
    if(config.support_whatsapp){const span=document.createElement('span');span.textContent=escText(config.support_whatsapp);contact.append(span)}
  }
}
async function load(){try{const r=await fetch('/api/public-config',{cache:'no-store',headers:{accept:'application/json'}});if(!r.ok)return;const d=await r.json().catch(()=>({}));apply(d.config||{})}catch{}}
function init(){[150,500,1200].forEach(ms=>setTimeout(load,ms));window.addEventListener('pageshow',load)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
