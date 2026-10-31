(()=>{
'use strict';
if(window.__rlbCompanyDocumentsV1)return;window.__rlbCompanyDocumentsV1=true;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const state={catalog:[],docs:[],history:false,loaded:false};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateBR=v=>{if(!v)return'—';const [y,m,d]=String(v).slice(0,10).split('-');return y&&m&&d?`${d}/${m}/${y}`:'—'};
const sizeBR=v=>{const n=Number(v||0);return n<1024?`${n} B`:n<1024*1024?`${Math.round(n/1024)} KB`:`${(n/1024/1024).toFixed(1)} MB`};
async function api(path,opt={}){const r=await fetch(path,{credentials:'same-origin',cache:'no-store',...opt,headers:{accept:'application/json',...(opt.body?{'content-type':'application/json'}:{}),...(opt.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`Erro ${r.status}`);return d}
function toast(msg,error=false){const e=$('#toast');if(!e)return;e.textContent=msg;e.className='toast show'+(error?' error':'');clearTimeout(toast.t);toast.t=setTimeout(()=>e.className='toast',3200)}
function statusClass(s){return['valid','attention','warning','critical','expired','no_expiry'].includes(s)?s:'no_expiry'}
function installNav(){const nav=$('#mainNav');if(!nav||$('#habilitationNav'))return;const b=document.createElement('button');b.type='button';b.id='habilitationNav';b.dataset.view='habilitation';b.innerHTML='<span class="nav-icon">✓</span><span><b>Habilitação</b><small>Certidões</small></span><em id="habNavBadge" class="hab-nav-badge" hidden>0</em>';const before=nav.querySelector('[data-view="documents"]')||nav.querySelector('[data-view="admin"]');before?nav.insertBefore(b,before):nav.appendChild(b);nav.addEventListener('click',e=>{const hit=e.target.closest('[data-view="habilitation"]');if(!hit)return;queueMicrotask(()=>{setHeader();loadAll()})})}
function installView(){const main=$('.main');if(!main||$('#view-habilitation'))return;const section=document.createElement('section');section.id='view-habilitation';section.className='view habilitation-view';section.innerHTML=`
  <div class="hab-intro">
    <div><span class="eyebrow electric">CENTRAL DE HABILITAÇÃO</span><h1>Documentação da empresa</h1><p>Organize certidões e documentos exigidos em licitações, acompanhe vencimentos e renove antes que a habilitação fique em risco.</p></div>
    <div class="hab-health"><span>Saúde documental</span><strong id="habCoverage">—</strong><small>documentos controlados e válidos</small></div>
  </div>
  <div id="habUrgentBanner" class="hab-urgent" hidden></div>
  <div class="hab-kpis">
    <article><span>Total atual</span><b id="habTotal">—</b><small>documentos vigentes</small></article>
    <article><span>Válidos</span><b id="habValid">—</b><small>fora da zona de risco</small></article>
    <article><span>Vencem em até 30 dias</span><b id="habDue">—</b><small>atenção necessária</small></article>
    <article><span>Vencidos</span><b id="habExpired">—</b><small>regularize imediatamente</small></article>
  </div>
  <div class="hab-grid">
    <article class="panel glass-panel hab-company-card">
      <div class="panel-head"><div><span class="eyebrow">EMPRESA</span><h2>Dados cadastrais</h2><p>Identifique a empresa responsável por este conjunto documental.</p></div></div>
      <div class="hab-form-grid">
        <label class="field"><span>CNPJ</span><input id="habCnpj" inputmode="numeric" placeholder="00.000.000/0000-00"></label>
        <label class="field"><span>Razão social</span><input id="habLegalName" placeholder="Razão social"></label>
        <label class="field"><span>Nome fantasia</span><input id="habTradeName" placeholder="Nome fantasia"></label>
        <label class="field"><span>UF</span><input id="habState" maxlength="2" placeholder="RN"></label>
        <label class="field"><span>Município</span><input id="habMunicipality" placeholder="Município"></label>
        <label class="field"><span>Responsável</span><input id="habContactName" placeholder="Responsável pela documentação"></label>
      </div>
      <button id="habSaveCompany" type="button" class="btn primary">Salvar dados da empresa</button>
    </article>
    <article class="panel glass-panel hab-upload-card">
      <div class="panel-head"><div><span class="eyebrow">NOVO DOCUMENTO</span><h2>Adicionar à habilitação</h2><p>PDF, JPG ou PNG de até 8 MB. Uma nova versão do mesmo tipo substitui a atual e preserva o histórico.</p></div></div>
      <div class="hab-form-grid">
        <label class="field hab-span-2"><span>Tipo de documento</span><select id="habDocType"><option value="">Selecione...</option></select></label>
        <label class="field"><span>Órgão emissor</span><input id="habIssuer" placeholder="Ex.: Receita Federal, Caixa, TJRN"></label>
        <label class="field"><span>Abrangência</span><input id="habJurisdiction" placeholder="Ex.: Federal, RN, Município"></label>
        <label class="field"><span>Número / código</span><input id="habDocNumber" placeholder="Opcional"></label>
        <label class="field"><span>Data de emissão</span><input id="habIssueDate" type="date"></label>
        <label class="field"><span>Data de vencimento</span><input id="habExpiryDate" type="date"></label>
        <label class="field hab-span-2"><span>Observação</span><input id="habNotes" placeholder="Informação complementar, se necessário"></label>
      </div>
      <div class="hab-upload-row"><label class="btn ghost file-button">Selecionar arquivo<input id="habFile" type="file" accept="application/pdf,image/jpeg,image/png" hidden></label><span id="habFileName">Nenhum arquivo selecionado</span><button id="habUpload" type="button" class="btn primary">Adicionar documento</button></div>
      <div class="hab-control-note"><b>Controle automático de validade</b><span>O Radar calcula diariamente a situação de cada documento com base na data de vencimento cadastrada e destaca documentos próximos do prazo.</span></div>
    </article>
  </div>
  <article class="panel glass-panel hab-docs-panel">
    <div class="hab-list-head"><div><span class="eyebrow electric">DOSSIÊ DE HABILITAÇÃO</span><h2>Documentos da empresa</h2><p id="habListMeta">Carregando documentação...</p></div><div class="hab-list-actions"><input id="habSearch" placeholder="Buscar documento"><select id="habStatusFilter"><option value="">Todos os status</option><option value="valid">Válidos</option><option value="attention">Até 30 dias</option><option value="warning">Até 7 dias</option><option value="critical">Críticos</option><option value="expired">Vencidos</option><option value="no_expiry">Sem vencimento</option></select><button id="habHistory" type="button" class="btn ghost compact">Ver histórico</button></div></div>
    <div class="hab-status-legend"><span class="valid">Válido</span><span class="attention">Até 30 dias</span><span class="warning">Até 7 dias</span><span class="critical">Até 2 dias</span><span class="expired">Vencido</span></div>
    <div id="habDocumentsList" class="hab-doc-list"><div class="empty-state">Carregando...</div></div>
  </article>`;
  const docs=$('#view-documents');docs?main.insertBefore(section,docs):main.appendChild(section);
  bindView();
  const obs=new MutationObserver(()=>{if(section.classList.contains('active')){setHeader();loadAll()}});obs.observe(section,{attributes:true,attributeFilter:['class']})
}
function setHeader(){if(!$('#view-habilitation')?.classList.contains('active'))return;const t=$('#pageTitle'),s=$('#pageSubtitle');if(t)t.textContent='Habilitação';if(s)s.textContent='Certidões, documentos e controle de vencimentos'}
function bindView(){
  $('#habSaveCompany')?.addEventListener('click',saveProfile);
  $('#habFile')?.addEventListener('change',e=>{$('#habFileName').textContent=e.target.files?.[0]?.name||'Nenhum arquivo selecionado'});
  $('#habUpload')?.addEventListener('click',uploadDocument);
  $('#habSearch')?.addEventListener('input',renderDocs);$('#habStatusFilter')?.addEventListener('change',renderDocs);
  $('#habHistory')?.addEventListener('click',async()=>{state.history=!state.history;$('#habHistory').textContent=state.history?'Ocultar histórico':'Ver histórico';await loadDocs()});
  $('#habDocumentsList')?.addEventListener('click',async e=>{
    const del=e.target.closest('[data-hab-delete]'),edit=e.target.closest('[data-hab-edit]'),save=e.target.closest('[data-hab-save-expiry]');
    if(del&&confirm('Excluir este documento do dossiê?')){try{await api('/api/company-documents/'+del.dataset.habDelete,{method:'DELETE',body:'{}'});toast('Documento excluído.');await loadAll()}catch(err){toast(err.message,true)}}
    if(edit){const row=$(`[data-hab-expiry-row="${edit.dataset.habEdit}"]`);if(row)row.hidden=!row.hidden}
    if(save){const id=save.dataset.habSaveExpiry,input=$(`[data-hab-expiry-input="${id}"]`);try{await api('/api/company-documents/'+id,{method:'PATCH',body:JSON.stringify({expiry_date:input?.value||null})});toast('Validade atualizada.');await loadAll()}catch(err){toast(err.message,true)}}
  });
}
async function loadCatalog(){if(state.catalog.length)return;const d=await api('/api/company-documents/catalog');state.catalog=d.catalog||[];const select=$('#habDocType');if(!select)return;for(const g of state.catalog){const og=document.createElement('optgroup');og.label=g.group;for(const [value,label] of g.items||[]){const op=document.createElement('option');op.value=value;op.textContent=label;og.appendChild(op)}select.appendChild(og)}}
async function loadProfile(){const d=await api('/api/company-documents/profile'),p=d.profile||{};const map={habCnpj:p.cnpj,habLegalName:p.legal_name,habTradeName:p.trade_name,habState:p.state,habMunicipality:p.municipality,habContactName:p.contact_name};for(const[id,v]of Object.entries(map)){const el=$('#'+id);if(el&&!el.dataset.touched)el.value=v||''}}
async function saveProfile(){try{const body={cnpj:$('#habCnpj')?.value,legal_name:$('#habLegalName')?.value,trade_name:$('#habTradeName')?.value,state:$('#habState')?.value,municipality:$('#habMunicipality')?.value,contact_name:$('#habContactName')?.value};await api('/api/company-documents/profile',{method:'PUT',body:JSON.stringify(body)});toast('Dados da empresa salvos.')}catch(e){toast(e.message,true)}}
async function fileBase64(file){return await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||'').split(',')[1]||'');r.onerror=reject;r.readAsDataURL(file)})}
async function uploadDocument(){const file=$('#habFile')?.files?.[0],type=$('#habDocType')?.value;if(!type)return toast('Selecione o tipo do documento.',true);if(!file)return toast('Selecione o arquivo.',true);if(file.size>8*1024*1024)return toast('O arquivo deve ter no máximo 8 MB.',true);if(!['application/pdf','image/jpeg','image/png'].includes(file.type))return toast('Use arquivo PDF, JPG ou PNG.',true);const button=$('#habUpload');button.disabled=true;button.textContent='Enviando...';try{const content=await fileBase64(file);await api('/api/company-documents',{method:'POST',body:JSON.stringify({doc_type:type,issuer:$('#habIssuer')?.value,jurisdiction:$('#habJurisdiction')?.value,document_number:$('#habDocNumber')?.value,issue_date:$('#habIssueDate')?.value||null,expiry_date:$('#habExpiryDate')?.value||null,notes:$('#habNotes')?.value,filename:file.name,mime_type:file.type,content_base64:content})});toast('Documento adicionado à habilitação.');for(const id of ['habIssuer','habJurisdiction','habDocNumber','habIssueDate','habExpiryDate','habNotes'])if($('#'+id))$('#'+id).value='';if($('#habDocType'))$('#habDocType').value='';if($('#habFile'))$('#habFile').value='';if($('#habFileName'))$('#habFileName').textContent='Nenhum arquivo selecionado';await loadAll()}catch(e){toast(e.message,true)}finally{button.disabled=false;button.textContent='Adicionar documento'}}
async function loadSummary(){const d=await api('/api/company-documents/summary'),s=d.summary||{};$('#habTotal').textContent=s.total??0;$('#habValid').textContent=(Number(s.valid||0)+Number(s.attention||0));$('#habDue').textContent=Number(s.attention||0)+Number(s.warning||0)+Number(s.critical||0);$('#habExpired').textContent=s.expired??0;$('#habCoverage').textContent=(s.coverage??0)+'%';const urgent=Number(s.expired||0)+Number(s.critical||0)+Number(s.warning||0),banner=$('#habUrgentBanner'),badge=$('#habNavBadge');if(badge){badge.textContent=String(urgent);badge.hidden=!urgent}if(banner){if(urgent){banner.hidden=false;banner.innerHTML=`<b>Atenção documental</b><span>${Number(s.expired||0)} vencido(s), ${Number(s.critical||0)} crítico(s) e ${Number(s.warning||0)} com vencimento em até 7 dias. Revise antes de participar de uma licitação.</span>`}else banner.hidden=true}}
async function loadDocs(){const d=await api('/api/company-documents'+(state.history?'?history=1':''));state.docs=d.items||[];renderDocs()}
function renderDocs(){const root=$('#habDocumentsList');if(!root)return;const q=String($('#habSearch')?.value||'').trim().toLowerCase(),status=$('#habStatusFilter')?.value||'';let items=state.docs.filter(d=>(!status||d.status===status)&&(!q||[d.type_label,d.category,d.issuer,d.jurisdiction,d.filename].join(' ').toLowerCase().includes(q)));$('#habListMeta').textContent=`${items.length} documento(s) ${state.history?'incluindo versões anteriores':'atuais'} • validade acompanhada automaticamente`;root.innerHTML=items.map(d=>`<article class="hab-doc-card ${d.is_current===false?'history':''}">
  <div class="hab-doc-icon">${d.mime_type==='application/pdf'?'PDF':'IMG'}</div>
  <div class="hab-doc-main"><div class="hab-doc-top"><span class="hab-status ${statusClass(d.status)}">${esc(d.status_label)}</span>${d.is_current===false?'<span class="hab-history-tag">Versão anterior</span>':''}<span class="hab-category">${esc(d.category)}</span></div><h3>${esc(d.type_label)}</h3><p>${esc([d.issuer,d.jurisdiction,d.document_number&&'Nº '+d.document_number].filter(Boolean).join(' • ')||'Sem dados adicionais de emissão')}</p><div class="hab-doc-dates"><span><b>Emissão</b>${dateBR(d.issue_date)}</span><span><b>Validade</b>${dateBR(d.expiry_date)}</span><span><b>Arquivo</b>${esc(d.filename)} • ${sizeBR(d.size_bytes)}</span></div>${d.notes?`<small class="hab-notes">${esc(d.notes)}</small>`:''}<div class="hab-expiry-edit" data-hab-expiry-row="${d.id}" hidden><input type="date" value="${esc(d.expiry_date||'')}" data-hab-expiry-input="${d.id}"><button class="btn primary compact" data-hab-save-expiry="${d.id}">Salvar validade</button></div></div>
  <div class="hab-doc-actions"><a class="btn ghost compact" href="/api/company-documents/${d.id}/download">Baixar</a>${d.is_current!==false?`<button class="btn ghost compact" data-hab-edit="${d.id}">Ajustar validade</button>`:''}<button class="btn danger compact" data-hab-delete="${d.id}">Excluir</button></div>
</article>`).join('')||'<div class="empty-state">Nenhum documento encontrado neste filtro.</div>'}
async function loadAll(){if(!$('#view-habilitation')?.classList.contains('active'))return;try{await loadCatalog();await Promise.all([loadProfile(),loadSummary(),loadDocs()]);state.loaded=true}catch(e){toast(e.message,true);const root=$('#habDocumentsList');if(root)root.innerHTML=`<div class="empty-state">${esc(e.message)}</div>`}}
function boot(){installNav();installView();window.__rlbCompanyDocs={load:loadAll};}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
