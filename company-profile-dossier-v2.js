(()=>{
'use strict';
if(window.__rlbCompanyProfileDossierV2)return;window.__rlbCompanyProfileDossierV2=true;
const FIELD_IDS=['habCnpj','habLegalName','habTradeName','habState','habMunicipality','habContactName'];
const $=(s,r=document)=>r.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let profile=null;
let editMode=false;
let installed=false;
function toast(msg,error=false){const e=$('#toast');if(!e)return;e.textContent=msg;e.className='toast show'+(error?' error':'');clearTimeout(toast.t);toast.t=setTimeout(()=>e.className='toast',3200)}
async function api(path,opt={}){const r=await fetch(path,{credentials:'same-origin',cache:'no-store',...opt,headers:{accept:'application/json',...(opt.body?{'content-type':'application/json'}:{}),...(opt.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`Erro ${r.status}`);return d}
function formatCnpj(v){const d=String(v||'').replace(/\D/g,'').slice(0,14);return d.length===14?d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5'):v||'—'}
function hasProfile(p){return Boolean(p&&(p.cnpj||p.legal_name||p.trade_name||p.state||p.municipality||p.contact_name))}
function markControlled(){for(const id of FIELD_IDS){const el=$('#'+id);if(el)el.dataset.touched='1'}}
function clearForm(){for(const id of FIELD_IDS){const el=$('#'+id);if(el){el.value='';el.dataset.touched='1'}}editMode=false;const b=$('#habSaveCompany');if(b)b.textContent='Salvar dados da empresa';const title=$('.hab-company-card .panel-head h2');if(title)title.textContent='Cadastrar ou editar empresa';const p=$('.hab-company-card .panel-head p');if(p)p.textContent='Preencha os dados e salve. Após o cadastro, a ficha da empresa aparecerá no dossiê abaixo.'}
function fillForm(p){if(!p)return;const map={habCnpj:p.cnpj,habLegalName:p.legal_name,habTradeName:p.trade_name,habState:p.state,habMunicipality:p.municipality,habContactName:p.contact_name};for(const[id,v]of Object.entries(map)){const el=$('#'+id);if(el){el.value=v||'';el.dataset.touched='1'}}editMode=true;const b=$('#habSaveCompany');if(b)b.textContent='Salvar alterações da empresa';const card=$('.hab-company-card');card?.scrollIntoView({behavior:'smooth',block:'start'});setTimeout(()=>$('#habCnpj')?.focus(),250)}
function ensureSummary(){const panel=$('.hab-docs-panel');if(!panel)return null;let box=$('#habCompanySummary');if(box)return box;box=document.createElement('section');box.id='habCompanySummary';box.className='hab-company-summary';const head=panel.querySelector('.hab-list-head');head?panel.insertBefore(box,head):panel.prepend(box);return box}
function renderSummary(){const box=ensureSummary();if(!box)return;if(!hasProfile(profile)){
  box.className='hab-company-summary empty';
  box.innerHTML='<div class="hab-company-summary-icon">＋</div><div><span class="eyebrow">EMPRESA DO DOSSIÊ</span><h3>Nenhuma empresa cadastrada</h3><p>Cadastre os dados da empresa acima para identificar corretamente este conjunto de documentos.</p></div>';
  return;
}
const name=profile.legal_name||profile.trade_name||'Empresa cadastrada';
const secondary=profile.trade_name&&profile.trade_name!==name?profile.trade_name:'';
const location=[profile.municipality,profile.state].filter(Boolean).join(' / ')||'Não informado';
box.className='hab-company-summary';
box.innerHTML=`<div class="hab-company-summary-main"><div class="hab-company-avatar">EMP</div><div class="hab-company-summary-copy"><span class="eyebrow electric">EMPRESA DO DOSSIÊ</span><h3>${esc(name)}</h3>${secondary?`<p class="hab-company-trade">${esc(secondary)}</p>`:''}<div class="hab-company-meta"><span><b>CNPJ</b>${esc(formatCnpj(profile.cnpj))}</span><span><b>Localização</b>${esc(location)}</span><span><b>Responsável</b>${esc(profile.contact_name||'Não informado')}</span></div></div></div><button type="button" id="habEditCompany" class="btn ghost compact">Editar dados</button>`;
$('#habEditCompany')?.addEventListener('click',()=>fillForm(profile),{once:true});
}
async function refreshProfile(){try{const d=await api('/api/company-documents/profile');profile=d.profile||null;renderSummary()}catch(e){console.warn('company dossier profile:',e.message)}}
async function saveCompany(){const button=$('#habSaveCompany');if(!button)return;const wasEditing=editMode;const body={cnpj:$('#habCnpj')?.value,legal_name:$('#habLegalName')?.value,trade_name:$('#habTradeName')?.value,state:$('#habState')?.value,municipality:$('#habMunicipality')?.value,contact_name:$('#habContactName')?.value};button.disabled=true;button.textContent='Salvando...';try{const d=await api('/api/company-documents/profile',{method:'PUT',body:JSON.stringify(body)});profile=d.profile||body;clearForm();renderSummary();toast(wasEditing?'Dados da empresa atualizados.':'Dados da empresa salvos.')}catch(e){toast(e.message,true);button.textContent=wasEditing?'Salvar alterações da empresa':'Salvar dados da empresa'}finally{button.disabled=false;if(!editMode&&button.textContent==='Salvando...')button.textContent='Salvar dados da empresa'}}
function install(){if(installed)return;const view=$('#view-habilitation');if(!view)return;installed=true;markControlled();clearForm();ensureSummary();refreshProfile();document.addEventListener('click',e=>{const b=e.target.closest('#habSaveCompany');if(!b)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();saveCompany()},true);const obs=new MutationObserver(()=>{if(view.classList.contains('active')){markControlled();refreshProfile()}});obs.observe(view,{attributes:true,attributeFilter:['class']});}
function boot(){if($('#view-habilitation')){install();return}const obs=new MutationObserver(()=>{if($('#view-habilitation')){obs.disconnect();install()}});obs.observe(document.documentElement,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
