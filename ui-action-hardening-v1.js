(()=>{
'use strict';
if(window.__rlbUiActionHardeningV1)return;
window.__rlbUiActionHardeningV1=true;
window.__RLB_UI_BUILD__='3.0.1';

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MOD=[['1','Leilão - Eletrônico'],['2','Diálogo Competitivo'],['3','Concurso'],['4','Concorrência - Eletrônica'],['5','Concorrência - Presencial'],['6','Pregão - Eletrônico'],['7','Pregão - Presencial'],['8','Dispensa de Licitação'],['9','Inexigibilidade'],['10','Manifestação de Interesse'],['11','Pré-qualificação'],['12','Credenciamento'],['13','Leilão - Presencial'],['14','Inaplicabilidade da Lei 14.133/2021']];
const state={searchSeq:0,searchController:null,me:null,lastManagedUser:null};

function toast(message,error=false){
  const el=$('#toast');if(!el)return;
  el.textContent=message;
  el.className='toast show'+(error?' error':'');
  clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.className='toast',3400);
}
async function request(path,opt={}){
  const r=await fetch(path,{credentials:'same-origin',cache:'no-store',...opt,headers:{accept:'application/json',...(opt.body?{'content-type':'application/json'}:{}),...(opt.headers||{})}});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw Object.assign(new Error(d.error||`Erro ${r.status}`),{status:r.status,data:d});
  return d;
}
function setBusy(button,on,label=''){
  if(!button)return;
  if(on){
    if(button.dataset.uiBusy==='1')return false;
    button.dataset.uiBusy='1';button.setAttribute('aria-busy','true');button.classList.add('ui-action-busy');button.disabled=true;
    if(label){button.dataset.uiOldHtml=button.innerHTML;button.textContent=label}
    return true;
  }
  button.disabled=false;button.removeAttribute('aria-busy');button.classList.remove('ui-action-busy');delete button.dataset.uiBusy;
  if(button.dataset.uiOldHtml!==undefined){button.innerHTML=button.dataset.uiOldHtml;delete button.dataset.uiOldHtml}
  return true;
}
function refreshView(view){
  const b=$(`#mainNav [data-view="${view}"]`);if(b&&!b.classList.contains('hidden'))b.click();
}
function when(v){if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}
function brl(v){const n=Number(v);return Number.isFinite(n)?n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'Valor não informado'}
function org(x){return x?.orgaoEntidade?.razaoSocial||'Órgão não informado'}
function municipality(x){return x?.unidadeOrgao?.municipioNome||x?.unidadeOrgao?.nomeMunicipio||x?.municipioNome||'Município não informado'}
function uf(x){return x?.unidadeOrgao?.ufSigla||x?.ufSigla||''}
function modality(x){return x?.modalidadeNome||MOD.find(m=>Number(m[0])===Number(x?._modalidadeConsultada||x?.modalidadeId))?.[1]||'Modalidade não informada'}
function pncp(x){if(x?._pncpUrl)return x._pncpUrl;const c=String(x?.orgaoEntidade?.cnpj||'').replace(/\D/g,''),y=Number(x?.anoCompra),s=Number(x?.sequencialCompra);return c.length===14&&Number.isInteger(y)&&Number.isInteger(s)?`https://pncp.gov.br/app/editais/${c}/${y}/${s}`:'#'}
function renderSearchItems(items){
  return items.map(x=>`<div class="result-item"><div class="item-tags"><span class="tag">${esc(modality(x))}</span><span class="tag green">${esc(municipality(x))}${uf(x)?' / '+esc(uf(x)):''}</span></div><div class="item-title">${esc(x?.objetoCompra||'Objeto não informado')}</div><div class="item-meta">${esc(org(x))} • publicação ${esc(when(x?.dataPublicacaoPncp))} • encerramento ${esc(when(x?.dataEncerramentoProposta||x?.dataFimRecebimentoProposta))}</div><div class="result-value">${esc(brl(x?.valorTotalEstimado))}</div><div class="item-meta"><a href="${esc(pncp(x))}" target="_blank" rel="noopener">Abrir fonte oficial ↗</a></div></div>`).join('')||'<div class="empty-state">Nenhum resultado encontrado.</div>';
}
async function runSearch(button){
  const seq=++state.searchSeq;
  try{state.searchController?.abort()}catch{}
  const controller=new AbortController();state.searchController=controller;
  const params=new URLSearchParams();
  const vals={keyword:$('#searchKeyword')?.value.trim(),uf:$('#searchUf')?.value,modalidade:$('#searchModality')?.value,days:$('#searchDays')?.value,openOnly:String($('#searchOpenOnly')?.checked||false),order:'newest'};
  Object.entries(vals).forEach(([k,v])=>{if(v&&v!=='false')params.set(k,v)});
  const root=$('#searchResults');if(root)root.innerHTML='<div class="empty-state">Pesquisando…</div>';
  setBusy(button,true);
  try{
    const r=await fetch('/api/licitacoes?'+params.toString(),{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'},signal:controller.signal});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||`Erro ${r.status}`);
    if(seq!==state.searchSeq)return;
    const items=d.items||[];
    if($('#searchMeta'))$('#searchMeta').textContent=`${items.length} resultado(s) • fonte PNCP`;
    if(root)root.innerHTML=renderSearchItems(items);
  }catch(error){
    if(error?.name==='AbortError'||seq!==state.searchSeq)return;
    if(root)root.innerHTML=`<div class="empty-state">${esc(error.message||'Falha temporária na busca.')}</div>`;
  }finally{
    if(seq===state.searchSeq){state.searchController=null;setBusy(button,false)}
  }
}
function cancelSearch(){
  ++state.searchSeq;
  try{state.searchController?.abort()}catch{}
  state.searchController=null;
  setBusy($('#searchBtn'),false);
}
async function createAlert(button){
  if(!setBusy(button,true,'Criando…'))return;
  try{
    await request('/api/alerts',{method:'POST',body:JSON.stringify({name:$('#alertName')?.value.trim(),keyword:$('#alertKeyword')?.value.trim(),uf:$('#alertUf')?.value,modality_code:$('#alertModality')?.value||null,enabled:true})});
    toast('Alerta criado.');if($('#alertName'))$('#alertName').value='';if($('#alertKeyword'))$('#alertKeyword').value='';refreshView('alerts');
  }catch(e){toast(e.message,true)}finally{setBusy(button,false)}
}
async function alertAction(button,kind){
  if(!setBusy(button,true,kind==='delete'?'Excluindo…':'Atualizando…'))return;
  try{
    if(kind==='delete')await request('/api/alerts/'+button.dataset.deleteAlert,{method:'DELETE',body:'{}'});
    else await request('/api/alerts/'+button.dataset.toggleAlert,{method:'PATCH',body:JSON.stringify({enabled:button.dataset.enabled!=='true'})});
    toast(kind==='delete'?'Alerta excluído.':'Alerta atualizado.');refreshView('alerts');
  }catch(e){toast(e.message,true);setBusy(button,false)}
}
async function notificationAction(button,kind){
  const channel=button.dataset.requestVerify||button.dataset.confirmVerify||button.dataset.testNotification;
  if(!channel)return;
  const labels={request:'Enviando…',confirm:'Confirmando…',test:'Testando…'};
  if(!setBusy(button,true,labels[kind]))return;
  try{
    if(kind==='request'){
      const d=await request('/api/notifications/verify/request',{method:'POST',body:JSON.stringify({channel,destination:$('#notif-'+channel)?.value.trim()})});
      toast(d.message||'Código enviado.');
    }else if(kind==='confirm'){
      await request('/api/notifications/verify/confirm',{method:'POST',body:JSON.stringify({channel,code:$('#code-'+channel)?.value.trim()})});
      toast('Canal confirmado.');refreshView('alerts');
    }else{
      await request('/api/notifications/test',{method:'POST',body:JSON.stringify({channel})});
      toast(channel==='email'?'E-mail de teste enviado. Confira sua caixa de entrada.':'Notificação de teste enviada.');
    }
  }catch(e){toast(e.message,true)}finally{setBusy(button,false)}
}
async function deleteDocument(button){
  if(!confirm('Excluir este documento?'))return;
  if(!setBusy(button,true,'Excluindo…'))return;
  try{await request('/api/documents/'+button.dataset.deleteDoc,{method:'DELETE',body:'{}'});toast('Documento excluído.');refreshView('documents')}
  catch(e){toast(e.message,true);setBusy(button,false)}
}
async function uploadDocumentInput(input){
  const file=input.files?.[0];if(!file)return;
  const label=input.closest('.file-button');
  if(file.size>3*1024*1024){toast('O arquivo deve ter no máximo 3 MB.',true);input.value='';return}
  if(label){label.classList.add('ui-action-busy');label.setAttribute('aria-busy','true')}
  try{
    const content=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||'').split(',')[1]||'');r.onerror=reject;r.readAsDataURL(file)});
    await request('/api/documents',{method:'POST',body:JSON.stringify({filename:file.name,mime_type:file.type||'application/octet-stream',content_base64:content})});
    toast('Documento enviado.');refreshView('documents');
  }catch(e){toast(e.message||'Não foi possível enviar o documento.',true)}finally{
    input.value='';if(label){label.classList.remove('ui-action-busy');label.removeAttribute('aria-busy')}
  }
}
function lockClick(button,ms=1200){
  if(!button)return false;
  if(button.dataset.uiClickLock==='1')return true;
  button.dataset.uiClickLock='1';setTimeout(()=>{if(button.isConnected)delete button.dataset.uiClickLock},ms);return false;
}
function scheduleAdvancedUser(id,attempt=0){
  const target=String(id||'');if(!target||attempt>20)return;
  const form=$('#accUserForm');
  const panel=$('#ausPanel');
  if(form?.dataset.userId===target&&panel){normalizeAdminSupport();return}
  const manage=$(`[data-user-edit="${CSS.escape(target)}"]`);
  if(manage){manage.click();setTimeout(normalizeAdminSupport,120);return}
  setTimeout(()=>scheduleAdvancedUser(target,attempt+1),100);
}
function resetAdvancedTab(id){
  state.lastManagedUser=String(id||'');
  let tries=0;
  const tick=()=>{
    const form=$('#accUserForm');const panel=$('#ausPanel');
    if(form?.dataset.userId===state.lastManagedUser&&panel){const overview=panel.querySelector('[data-aus-tab="overview"]');if(overview&&!overview.classList.contains('active'))overview.click();normalizeAdminSupport();return}
    if(++tries<16)setTimeout(tick,90);
  };
  setTimeout(tick,30);
}
async function loadMe(){try{state.me=(await request('/api/me')).user||null}catch{state.me=null}}
function normalizeAdminSupport(){
  const form=$('#accUserForm');const panel=$('#ausPanel');if(!form||!panel)return;
  const target=Number(form.dataset.userId),self=state.me&&Number(state.me.id)===target;
  const revoke=panel.querySelector('[data-aus-revoke-sessions]');
  if(revoke){
    revoke.hidden=Boolean(self);revoke.disabled=Boolean(self);
    if(self)revoke.title='Use o botão Sair para encerrar sua própria sessão.';
  }
}
function guardFormSubmit(e){
  const form=e.target;if(!(form instanceof HTMLFormElement))return;
  if(!form.closest('#ausPanel,#accPanel'))return;
  if(form.dataset.uiSubmitting==='1'){
    e.preventDefault();e.stopImmediatePropagation();toast('Esta ação já está sendo processada.');return;
  }
  form.dataset.uiSubmitting='1';
  const submitter=e.submitter;
  if(submitter){submitter.disabled=true;submitter.setAttribute('aria-busy','true');submitter.classList.add('ui-action-busy')}
  setTimeout(()=>{
    if(!form.isConnected)return;
    delete form.dataset.uiSubmitting;
    if(submitter?.isConnected){submitter.disabled=false;submitter.removeAttribute('aria-busy');submitter.classList.remove('ui-action-busy')}
  },8000);
}
function captureClick(e){
  const search=e.target.closest?.('#searchBtn');
  if(search){e.preventDefault();e.stopImmediatePropagation();runSearch(search);return}
  if(e.target.closest?.('#resetSearch')){cancelSearch();return}

  const create=e.target.closest?.('#createAlertBtn');
  if(create){e.preventDefault();e.stopImmediatePropagation();createAlert(create);return}
  const alertDelete=e.target.closest?.('#alertsList [data-delete-alert]');
  if(alertDelete){e.preventDefault();e.stopImmediatePropagation();if(confirm('Excluir este alerta?'))alertAction(alertDelete,'delete');return}
  const alertToggle=e.target.closest?.('#alertsList [data-toggle-alert]');
  if(alertToggle){e.preventDefault();e.stopImmediatePropagation();alertAction(alertToggle,'toggle');return}

  const verifyRequest=e.target.closest?.('#notificationProfile [data-request-verify]');
  if(verifyRequest){e.preventDefault();e.stopImmediatePropagation();notificationAction(verifyRequest,'request');return}
  const verifyConfirm=e.target.closest?.('#notificationProfile [data-confirm-verify]');
  if(verifyConfirm){e.preventDefault();e.stopImmediatePropagation();notificationAction(verifyConfirm,'confirm');return}
  const test=e.target.closest?.('#notificationProfile [data-test-notification]');
  if(test){e.preventDefault();e.stopImmediatePropagation();notificationAction(test,'test');return}

  const docDelete=e.target.closest?.('#documentsList [data-delete-doc]');
  if(docDelete){e.preventDefault();e.stopImmediatePropagation();deleteDocument(docDelete);return}

  const planEdit=e.target.closest?.('[data-go-user]');
  if(planEdit){const id=planEdit.dataset.goUser;setTimeout(()=>scheduleAdvancedUser(id),80)}
  const manage=e.target.closest?.('[data-user-edit]');
  if(manage)resetAdvancedTab(manage.dataset.userEdit);

  const debounce=e.target.closest?.('#refreshLive,#maturityRefresh,#maturityHistoryRefresh,#maturityAdminRefresh,#maturityAuditSearch,#accRefreshAll,#habHistory');
  if(debounce&&lockClick(debounce,debounce.id==='habHistory'?1800:1000)){e.preventDefault();e.stopImmediatePropagation();return}
}
function captureChange(e){
  const input=e.target.closest?.('#docInput');if(!input)return;
  e.preventDefault();e.stopImmediatePropagation();uploadDocumentInput(input);
}
function boot(){
  loadMe();
  document.addEventListener('click',captureClick,true);
  document.addEventListener('change',captureChange,true);
  document.addEventListener('submit',guardFormSubmit,true);
  const admin=$('#view-admin');if(admin)new MutationObserver(()=>normalizeAdminSupport()).observe(admin,{childList:true,subtree:true});
  window.addEventListener('pageshow',loadMe);
  console.info('RLB UI action hardening v1 active');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
