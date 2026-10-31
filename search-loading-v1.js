(()=>{
'use strict';
if(window.__rlbSearchLoadingV1)return;window.__rlbSearchLoadingV1=true;
const root=()=>document.getElementById('searchResults');
const meta=()=>document.getElementById('searchMeta');
const stages=[
  ['Consultando oportunidades oficiais','Buscando novas contratações públicas na base monitorada do Radar.'],
  ['Aplicando os filtros da pesquisa','Cruzando palavra-chave, localização, modalidade e período informado.'],
  ['Organizando os resultados','Preparando as oportunidades mais relevantes para exibição.']
];
let timer=null,longTimer=null,startedAt=0,stage=0;
function clearTimers(){if(timer){clearInterval(timer);timer=null}if(longTimer){clearTimeout(longTimer);longTimer=null}}
function skeleton(){return `<article class="rlb-search-skeleton" aria-hidden="true"><div class="rlb-skel-tags"><i></i><i></i></div><div class="rlb-skel-line wide"></div><div class="rlb-skel-line medium"></div><div class="rlb-skel-line short"></div><div class="rlb-skel-foot"><span></span><b></b></div></article>`}
function markup(){return `<section class="rlb-search-loading" role="status" aria-live="polite" aria-label="Busca de oportunidades em andamento"><div class="rlb-search-loading-head"><div class="rlb-radar" aria-hidden="true"><span class="rlb-radar-grid"></span><span class="rlb-radar-sweep"></span><span class="rlb-radar-dot one"></span><span class="rlb-radar-dot two"></span><span class="rlb-radar-core"></span></div><div class="rlb-search-loading-copy"><span class="rlb-loading-eyebrow">RADAR EM BUSCA</span><h3 id="rlbSearchLoadingTitle">${stages[0][0]}</h3><p id="rlbSearchLoadingText">${stages[0][1]}</p><div class="rlb-search-steps"><span class="active"></span><span></span><span></span></div></div></div><div class="rlb-search-skeletons">${skeleton()}${skeleton()}${skeleton()}</div></section>`}
function setStage(index){stage=index%stages.length;const t=document.getElementById('rlbSearchLoadingTitle'),p=document.getElementById('rlbSearchLoadingText');if(t)t.textContent=stages[stage][0];if(p)p.textContent=stages[stage][1];document.querySelectorAll('.rlb-search-steps span').forEach((el,i)=>el.classList.toggle('active',i===stage));}
function enhance(){const el=root();if(!el)return;const text=el.textContent.trim().replace(/\s+/g,' ');if(text!=='Pesquisando...'&&text!=='Pesquisando…')return;clearTimers();startedAt=Date.now();stage=0;el.innerHTML=markup();el.classList.add('rlb-search-loading-host');if(meta())meta().textContent='Busca em andamento • consultando oportunidades oficiais';timer=setInterval(()=>{if(!document.querySelector('.rlb-search-loading')){clearTimers();return}setStage(stage+1)},1050);longTimer=setTimeout(()=>{const t=document.getElementById('rlbSearchLoadingTitle'),p=document.getElementById('rlbSearchLoadingText');if(t)t.textContent='A busca continua em andamento';if(p)p.textContent='A consulta está levando um pouco mais que o normal, mas o Radar continua processando os resultados.'},5200)}
function observe(){const el=root();if(!el)return;const obs=new MutationObserver(()=>{if(document.querySelector('.rlb-search-loading')){if(el.children.length===1&&el.firstElementChild?.classList.contains('rlb-search-loading'))return;clearTimers();el.classList.remove('rlb-search-loading-host');return}enhance()});obs.observe(el,{childList:true,subtree:false,characterData:false});enhance()}
function start(){observe();document.addEventListener('visibilitychange',()=>{if(document.hidden)return;if(document.querySelector('.rlb-search-loading')&&Date.now()-startedAt>5200){const p=document.getElementById('rlbSearchLoadingText');if(p)p.textContent='O Radar continua consultando e organizando as oportunidades da sua pesquisa.'}})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();