(()=>{
'use strict';
if(window.__rlbCorporateUiV3)return;window.__rlbCorporateUiV3=true;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const SVG={
 radar:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 4v2M20 12h-2M12 20v-2M4 12h2"/><path d="M12 12l5-5"/></svg>',
 alerts:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>',
 habilitation:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h8l4 4v14H7z"/><path d="M15 3v5h5"/><path d="m10 14 2 2 4-4"/></svg>',
 documents:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2h9l4 4v16H6z"/><path d="M15 2v5h5"/><path d="M9 13h6M9 17h6"/></svg>',
 admin:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3"/><path d="M5 21a7 7 0 0 1 14 0"/><path d="M18 4v4M16 6h4"/></svg>',
 ai:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="7" width="14" height="11" rx="2"/><path d="M9 7V5a3 3 0 0 1 6 0v2M9 12h.01M15 12h.01M9 15h6"/></svg>',
 search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>',
 sun:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
 moon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>'
};
function setText(el,text){if(el&&el.textContent!==text)el.textContent=text}
function setHtml(el,html){if(el&&el.innerHTML!==html)el.innerHTML=html}
function decorateNav(){
  const map={radar:'radar',alerts:'alerts',habilitation:'habilitation',documents:'documents',admin:'admin',ai:'ai'};
  $$('#mainNav [data-view]').forEach(btn=>{
    const view=String(btn.dataset.view||'').toLowerCase();
    const key=map[view]||(view.includes('habil')?'habilitation':view.includes('doc')?'documents':view.includes('admin')?'admin':view.includes('ai')?'ai':null);
    const box=btn.querySelector('.nav-icon');
    if(box&&key&&box.dataset.corporateIcon!==key){box.innerHTML=SVG[key];box.dataset.corporateIcon=key}
  });
  const themeBtns=$$('#themeControl [data-theme-choice]');
  for(const b of themeBtns){const key=b.dataset.themeChoice==='light'?'sun':'moon';if(b.dataset.corporateIcon!==key){b.innerHTML=SVG[key];b.dataset.corporateIcon=key}}
  const fab=$('.ai-fab-icon');if(fab&&fab.dataset.corporateIcon!=='ai'){fab.innerHTML=SVG.ai;fab.dataset.corporateIcon='ai'}
  const avatar=$('.ai-avatar');if(avatar&&avatar.dataset.corporateIcon!=='ai'){avatar.innerHTML=SVG.ai;avatar.dataset.corporateIcon='ai'}
}
function decorateHome(){
  const brandSub=$('.sidebar-brand span');setText(brandSub,'Inteligência em compras públicas');
  const badge=$('.hero-badge');if(badge){setText(badge.querySelector('span:not(.pulse-dot)'),'Monitoramento nacional');setText(badge.querySelector('em'),'Fonte: PNCP')}
  const h1=$('.hero-copy h1');setText(h1,'Radar de oportunidades públicas');
  const p=$('.hero-copy>p');setText(p,'Pesquise contratações públicas, acompanhe novas oportunidades e gerencie seus alertas em um único ambiente de trabalho.');
  const sh=$('.search-console-head');if(sh){setText(sh.querySelector('.eyebrow'),'Pesquisa');setText(sh.querySelector('b'),'Pesquisar oportunidades')}
  const searchBtn=$('#searchBtn');if(searchBtn&&searchBtn.dataset.corporateLabel!=='1'){searchBtn.innerHTML=SVG.search+'<span>Pesquisar oportunidades</span>';searchBtn.dataset.corporateLabel='1'}
  const terminalTitle=$('.terminal-title b');setText(terminalTitle,'Atividade do Radar');
  const liveChip=$('.live-chip');setText(liveChip,'Atualização automática');
}
function decorateAuth(){
  const root=$('#authScreen');if(!root)return;
  const eyebrow=root.querySelector('.auth-copy .eyebrow');setText(eyebrow,'Radar de Licitações Brasil');
  const h1=root.querySelector('.auth-copy h1');setText(h1,'Monitoramento de licitações para decisões mais rápidas.');
  const p=root.querySelector('.auth-copy>p');setText(p,'Centralize oportunidades, alertas, documentação e inteligência aplicada a compras públicas em uma plataforma profissional.');
  const features=root.querySelectorAll('.feature-grid>div');
  const labels=[
    ['Monitoramento PNCP','Acompanhe novas contratações públicas em âmbito nacional.'],
    ['Alertas configuráveis','Receba oportunidades alinhadas aos critérios da sua empresa.'],
    ['Gestão documental','Organize habilitação, vencimentos e documentos em um único ambiente.']
  ];
  features.forEach((el,i)=>{if(!labels[i])return;setText(el.querySelector('b'),labels[i][0]);setText(el.querySelector('span'),labels[i][1])});
}
function decorateAdmin(){
  const hero=$('.acc-hero');if(hero){setText(hero.querySelector('.acc-kicker'),'Administração');setText(hero.querySelector('h1'),'Central de gestão');setText(hero.querySelector('p'),'Usuários, operação, monitoramento, suporte e configurações da plataforma em um único ambiente administrativo.')}
}
function decorateSearchResults(){
  const head=$('.rlb-results-head-copy');if(head){setText(head.querySelector('.eyebrow'),'Resultados');const title=head.querySelector('h2');setText(title,'Oportunidades encontradas')}
}
function apply(){document.documentElement.classList.add('rlb-corporate-v3');decorateNav();decorateHome();decorateAuth();decorateAdmin();decorateSearchResults()}
let timer=null;
function schedule(){clearTimeout(timer);timer=setTimeout(apply,40)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{apply();setTimeout(apply,250)},{once:true});else{apply();setTimeout(apply,250)}
const obs=new MutationObserver(schedule);obs.observe(document.documentElement,{childList:true,subtree:true});
window.__rlbCorporateUiV3Apply=apply;
})();
