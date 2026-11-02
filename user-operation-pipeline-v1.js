(()=>{
'use strict';
if(window.__rlbOperationPipelineV1)return;window.__rlbOperationPipelineV1=true;
const STATUS_STEPS=[
  ['', 'Todos'],
  ['analisar','Analisar'],
  ['preparando_documentacao','Documentação'],
  ['proposta_pronta','Proposta pronta'],
  ['participando','Participando'],
  ['recurso','Recurso'],
  ['vencida','Vencida'],
  ['perdida','Perdida'],
  ['arquivada','Arquivada']
];
const PIPELINE_HINT='Selecione uma etapa para visualizar somente as licitações desse estágio.';
let activeFilter='',enhanceScheduled=false;
function completedCounts(root){
  const text=root.querySelector('.op-funnel-foot')?.textContent||'';
  const pick=(label)=>{const m=text.match(new RegExp(label+'\\s*:\\s*(\\d+)','i'));return m?Number(m[1]):0};
  return{vencida:pick('Concluídas'),perdida:pick('Perdidas'),arquivada:pick('Arquivadas')};
}
function removeAnalyze(){document.querySelectorAll('#dbRoot [data-db-analyze]').forEach(b=>b.remove())}
function enhanceStageSelects(root){
  root.querySelectorAll('select[data-db-status]').forEach(select=>{
    if(select.closest('.op-stage-control'))return;
    const parent=select.parentNode;if(!parent)return;
    const wrap=document.createElement('label');wrap.className='op-stage-control';
    const title=document.createElement('span');title.textContent='Etapa atual';
    parent.insertBefore(wrap,select);wrap.append(title,select);
    select.setAttribute('aria-label','Etapa atual da licitação');
  });
}
function enhancePipeline(){
  const root=document.querySelector('#opRoot');if(!root)return;
  const funnel=root.querySelector('.op-funnel');if(!funnel){enhanceStageSelects(root);return}
  const counts=completedCounts(root);
  const existing=new Map([...funnel.querySelectorAll('[data-op-filter]')].map(b=>[b.dataset.opFilter||'',b]));
  for(const [key,label] of STATUS_STEPS){
    let button=existing.get(key);
    if(!button){
      button=document.createElement('button');button.type='button';button.dataset.opFilter=key;
      const count=key in counts?counts[key]:0;
      button.innerHTML=`<span>${label}</span><b>${count.toLocaleString('pt-BR')}</b>`;
      funnel.appendChild(button);
    }
    button.classList.toggle('active',key===activeFilter);
    button.setAttribute('aria-pressed',String(key===activeFilter));
    button.title=key?`Mostrar licitações em ${label}`:'Mostrar todas as licitações acompanhadas';
  }
  const foot=root.querySelector('.op-funnel-foot');
  if(foot&&foot.textContent!==PIPELINE_HINT)foot.textContent=PIPELINE_HINT;
  enhanceStageSelects(root);
}
function enhance(){removeAnalyze();enhancePipeline()}
function scheduleEnhance(){
  if(enhanceScheduled)return;
  enhanceScheduled=true;
  requestAnimationFrame(()=>{enhanceScheduled=false;enhance()});
}
document.addEventListener('click',event=>{
  const filter=event.target.closest('#opRoot [data-op-filter]');
  if(filter){activeFilter=filter.dataset.opFilter||'';scheduleEnhance()}
},true);
document.addEventListener('change',event=>{
  if(event.target.closest('#opRoot select[data-db-status]')){activeFilter='';scheduleEnhance()}
},true);
const observer=new MutationObserver(scheduleEnhance);
function install(){
  enhance();observer.observe(document.body,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
