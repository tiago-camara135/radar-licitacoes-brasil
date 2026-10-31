(()=>{
'use strict';
if(window.__rlbSearchResultsV2)return;
window.__rlbSearchResultsV2=true;
window.__RLB_UI_BUILD__='2.8.1';

const $=(s,r=document)=>r.querySelector(s);
const root=()=>$('#searchResults');
const panel=()=>root()?.closest('.results-panel');
const meta=()=>$('#searchMeta');
const badge=()=>$('#rlbSearchStateBadge');
let timer=null,longTimer=null,rendering=false,stageIndex=0;

const stages=[
  ['Preparando a pesquisa','Validando palavra-chave, UF, modalidade, período e demais filtros selecionados.'],
  ['Consultando o PNCP','Buscando oportunidades compatíveis na principal fonte oficial monitorada pelo Radar.'],
  ['Cruzando a base do Radar','Comparando a consulta com os registros já indexados pelo monitoramento nacional.'],
  ['Organizando oportunidades','Ordenando os registros encontrados para apresentar os resultados mais recentes.']
];

function clearTimers(){
  if(timer){clearInterval(timer);timer=null;}
  if(longTimer){clearTimeout(longTimer);longTimer=null;}
}
function setBadge(text,tone='idle'){
  const el=badge();
  if(!el)return;
  el.textContent=text;
  el.dataset.tone=tone;
}
function decoratePanel(){
  const p=panel();
  if(!p)return;
  p.classList.add('rlb-results-premium');
  if(p.dataset.rlbSearchV2==='1')return;
  p.dataset.rlbSearchV2='1';
  const head=p.querySelector('.panel-head');
  if(!head)return;
  const oldMeta=meta()?.textContent||'Use os filtros acima para pesquisar.';
  head.innerHTML=`
    <div class="rlb-results-head-copy">
      <span class="eyebrow electric">CENTRAL DE OPORTUNIDADES</span>
      <div class="rlb-results-title-row">
        <h2>Resultados da busca</h2>
        <span id="rlbSearchStateBadge" class="rlb-search-state-badge" data-tone="idle">Pronto para buscar</span>
      </div>
      <p id="searchMeta">${oldMeta}</p>
      <div class="rlb-search-source-row" aria-label="Fontes da pesquisa">
        <span><i></i>PNCP</span>
        <span><i></i>Base monitorada RLB</span>
        <span><i></i>Entes públicos indexados</span>
      </div>
    </div>
    <div class="rlb-results-head-mark" aria-hidden="true">
      <span class="rlb-head-doc"></span><span class="rlb-head-scan"></span>
    </div>`;
}
function documentVisual(){
  return `<div class="rlb-doc-search" aria-hidden="true">
    <span class="rlb-doc-back"></span>
    <span class="rlb-doc-mid"></span>
    <span class="rlb-doc-front"><i></i><i></i><i></i></span>
    <span class="rlb-doc-lens"></span>
    <span class="rlb-doc-scan"></span>
    <b class="rlb-doc-ping p1"></b><b class="rlb-doc-ping p2"></b>
  </div>`;
}
function timeline(){
  return `<div class="rlb-search-timeline" aria-label="Etapas da busca">
    <span class="active"><i>1</i><b>Preparando</b></span>
    <span><i>2</i><b>PNCP</b></span>
    <span><i>3</i><b>Base RLB</b></span>
    <span><i>4</i><b>Resultados</b></span>
  </div>`;
}
function skeleton(){
  return `<article class="rlb-search-skeleton" aria-hidden="true">
    <div class="rlb-skel-tags"><i></i><i></i></div>
    <div class="rlb-skel-line wide"></div>
    <div class="rlb-skel-line medium"></div>
    <div class="rlb-skel-line short"></div>
    <div class="rlb-skel-foot"><span></span><b></b></div>
  </article>`;
}
function loadingMarkup(){
  return `<section class="rlb-search-experience is-loading" role="status" aria-live="polite">
    <div class="rlb-search-stage">
      <div class="rlb-search-visual">
        ${documentVisual()}
        <span class="rlb-search-orbit o1"></span><span class="rlb-search-orbit o2"></span>
      </div>
      <div class="rlb-search-copy">
        <span class="rlb-loading-eyebrow"><i></i> BUSCA INTELIGENTE EM ANDAMENTO</span>
        <h3 id="rlbSearchLoadingTitle">${stages[0][0]}</h3>
        <p id="rlbSearchLoadingText">${stages[0][1]}</p>
        ${timeline()}
        <div class="rlb-search-trust"><span>✓ Fonte oficial</span><span>✓ Filtros aplicados</span><span>✓ Ordenação por atualização</span></div>
      </div>
    </div>
    <div class="rlb-search-skeleton-title"><span>Preparando as oportunidades</span><em>Os resultados aparecerão automaticamente.</em></div>
    <div class="rlb-search-skeletons">${skeleton()}${skeleton()}${skeleton()}</div>
  </section>`;
}
function stateMarkup(kind,title,text,action=''){
  const icon=kind==='empty'?'⌕':kind==='error'?'!':'⌁';
  const eyebrow=kind==='empty'?'BUSCA CONCLUÍDA':kind==='error'?'CONSULTA INTERROMPIDA':'RADAR DE OPORTUNIDADES';
  return `<section class="rlb-search-experience is-${kind}">
    <div class="rlb-search-state-icon" aria-hidden="true">${icon}</div>
    <div><span class="rlb-loading-eyebrow">${eyebrow}</span><h3>${title}</h3><p>${text}</p>${action}</div>
  </section>`;
}
function setStage(index){
  stageIndex=Math.min(index,stages.length-1);
  const title=$('#rlbSearchLoadingTitle'),text=$('#rlbSearchLoadingText');
  if(title)title.textContent=stages[stageIndex][0];
  if(text)text.textContent=stages[stageIndex][1];
  document.querySelectorAll('.rlb-search-timeline span').forEach((el,i)=>{
    el.classList.toggle('active',i===stageIndex);
    el.classList.toggle('done',i<stageIndex);
  });
}
function renderLoading(){
  decoratePanel();
  const el=root();
  if(!el)return;
  clearTimers();
  rendering=true;
  stageIndex=0;
  el.classList.add('rlb-search-loading-host');
  el.innerHTML=loadingMarkup();
  if(meta())meta().textContent='Consultando o PNCP e a base monitorada do Radar com os filtros selecionados.';
  setBadge('Buscando agora','loading');
  queueMicrotask(()=>{rendering=false;});
  timer=setInterval(()=>{
    if(!document.querySelector('.rlb-search-experience.is-loading')){clearTimers();return;}
    setStage(Math.min(stageIndex+1,stages.length-1));
  },950);
  longTimer=setTimeout(()=>{
    const title=$('#rlbSearchLoadingTitle'),text=$('#rlbSearchLoadingText');
    if(title)title.textContent='A busca continua em andamento';
    if(text)text.textContent='Algumas consultas podem levar mais tempo. O Radar continua processando os registros sem interromper a pesquisa.';
    setBadge('Processando','loading');
  },5500);
}
function renderInitial(){
  decoratePanel();
  const el=root();if(!el)return;
  clearTimers();rendering=true;
  el.classList.remove('rlb-search-loading-host');
  el.innerHTML=stateMarkup('idle','Pronto para encontrar novas oportunidades','Defina os filtros acima e clique em “Pesquisar oportunidades”. O Radar consulta o PNCP e a base monitorada para organizar os registros compatíveis.');
  if(meta())meta().textContent='Use os filtros acima para iniciar uma pesquisa.';
  setBadge('Pronto para buscar','idle');
  queueMicrotask(()=>{rendering=false;});
}
function renderEmpty(){
  decoratePanel();const el=root();if(!el)return;
  clearTimers();rendering=true;
  el.classList.remove('rlb-search-loading-host');
  el.innerHTML=stateMarkup('empty','Nenhuma oportunidade encontrada','Não encontramos registros compatíveis com estes filtros. Amplie o período, remova algum filtro ou tente outra palavra-chave.','<button type="button" class="btn ghost compact rlb-search-reset-action">Limpar filtros</button>');
  setBadge('0 resultados','empty');
  queueMicrotask(()=>{rendering=false;});
}
function renderError(message){
  decoratePanel();const el=root();if(!el)return;
  clearTimers();rendering=true;
  el.classList.remove('rlb-search-loading-host');
  el.innerHTML=stateMarkup('error','Não foi possível concluir a busca',message||'A consulta encontrou uma falha temporária. Tente novamente sem alterar seus filtros.','<button type="button" class="btn ghost compact rlb-search-retry-action">Tentar novamente</button>');
  setBadge('Falha na consulta','error');
  queueMicrotask(()=>{rendering=false;});
}
function markResults(){
  decoratePanel();clearTimers();root()?.classList.remove('rlb-search-loading-host');setBadge('Resultados prontos','success');
}
function classify(){
  const el=root();
  if(!el||rendering)return;
  if(el.querySelector('.rlb-search-experience'))return;
  if(el.querySelector('.result-item')){markResults();return;}
  const text=el.textContent.trim().replace(/\s+/g,' ');
  if(/^Pesquisando/i.test(text)){renderLoading();return;}
  if(/Nenhuma pesquisa realizada/i.test(text)){renderInitial();return;}
  if(/Nenhum resultado encontrado/i.test(text)){renderEmpty();return;}
  if(el.querySelector('.empty-state')&&text&&!/Carregando oportunidades/i.test(text))renderError(text);
}
function bind(){
  document.addEventListener('click',e=>{
    if(e.target.closest?.('#searchBtn')){setTimeout(renderLoading,0);return;}
    if(e.target.closest?.('.rlb-search-reset-action')){e.preventDefault();$('#resetSearch')?.click();setTimeout(renderInitial,0);return;}
    if(e.target.closest?.('.rlb-search-retry-action')){e.preventDefault();$('#searchBtn')?.click();}
  },true);
}
function boot(){
  decoratePanel();bind();
  const el=root();if(el)new MutationObserver(classify).observe(el,{childList:true,subtree:true,characterData:true});
  classify();
  console.info('RLB Search Results UI 2.8.1 active');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
