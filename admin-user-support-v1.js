(()=>{
'use strict';
if(window.__rlbAdminUserSupportV1)return;
window.__rlbAdminUserSupportV1=true;

const $=(s,r=document)=>r.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const when=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})};
const date=v=>v?String(v).slice(0,10):'';
const num=v=>Number(v||0).toLocaleString('pt-BR');
let userId=null,data=null,tab='overview',loading=false;

const DOC_TYPES=[
 ['federal','Certidão Federal / RFB e PGFN'],['fgts','CRF do FGTS'],['cndt','CNDT — Débitos Trabalhistas'],['estadual','Certidão Estadual'],['municipal','Certidão Municipal'],
 ['cartao_cnpj','Cartão do CNPJ'],['contrato_social','Contrato Social / Requerimento de Empresário'],['alteracao_contratual','Alteração Contratual / Consolidação'],['junta_comercial','Certidão da Junta Comercial'],
 ['falencia','Certidão de Falência / Recuperação Judicial'],['balanco','Balanço Patrimonial'],['indices','Índices Econômico-Financeiros'],
 ['registro_conselho','Registro em Conselho Profissional'],['atestado_tecnico','Atestado de Capacidade Técnica'],['acervo_tecnico','CAT / Acervo Técnico'],['licenca','Licença / Alvará'],
 ['declaracao','Declaração'],['procuracao','Procuração'],['documento_socio','Documento de Sócio / Representante'],['outro','Outro documento']
];
const MOD=[['','Todas'],['1','Leilão - Eletrônico'],['2','Diálogo Competitivo'],['3','Concurso'],['4','Concorrência - Eletrônica'],['5','Concorrência - Presencial'],['6','Pregão - Eletrônico'],['7','Pregão - Presencial'],['8','Dispensa de Licitação'],['9','Inexigibilidade'],['10','Manifestação de Interesse'],['11','Pré-qualificação'],['12','Credenciamento'],['13','Leilão - Presencial'],['14','Inaplicabilidade da Lei 14.133/2021']];
const UFS=['','AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

async function api(path,opt={}){
  const r=await fetch(path,{credentials:'same-origin',cache:'no-store',...opt,headers:{accept:'application/json',...(opt.body?{'content-type':'application/json'}:{}),...(opt.headers||{})}});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||`Erro ${r.status}`);
  return d;
}
function toast(msg,error=false){
  const e=$('#toast');if(!e)return;
  e.textContent=msg;e.className='toast show'+(error?' error':'');
  clearTimeout(toast.t);toast.t=setTimeout(()=>e.className='toast',3500);
}
const pill=(text,tone='')=>`<span class="aus-pill ${tone}">${esc(text)}</span>`;
const yesNo=v=>v?pill('Ativo','green'):pill('Inativo','red');

async function load(){
  if(!userId||loading)return;
  loading=true;
  const body=$('#ausBody');if(body)body.innerHTML='<div class="aus-loading">Carregando dados do usuário…</div>';
  try{
    data=(await api(`/api/admin-support/users/${userId}`)).data;
    render();
  }catch(e){
    if(body)body.innerHTML=`<div class="aus-error"><b>Falha ao carregar o suporte deste usuário.</b><span>${esc(e.message)}</span></div>`;
    toast(e.message,true);
  }finally{loading=false}
}
function mount(id){
  userId=Number(id);if(!Number.isInteger(userId))return;
  const host=$('#accUserEditor');if(!host)return;
  host.querySelector('#ausPanel')?.remove();
  host.insertAdjacentHTML('beforeend',`<section id="ausPanel" class="aus-panel">
    <div class="aus-head">
      <div><span class="aus-kicker">SUPORTE ADMINISTRATIVO</span><h2>Gestão completa do usuário</h2><p>Ajude o cliente sem acessar senha. Toda ação administrativa relevante é auditada.</p></div>
      <div class="aus-head-actions"><span class="aus-lock">🔒 Menor privilégio</span><button type="button" class="btn ghost compact" data-aus-refresh>Atualizar</button></div>
    </div>
    <nav class="aus-tabs">
      ${[['overview','Visão geral'],['alerts','Alertas'],['habilitation','Habilitação'],['notifications','Notificações'],['security','Segurança'],['activity','Atividade']].map(([id,label])=>`<button type="button" data-aus-tab="${id}" class="${id==='overview'?'active':''}">${label}</button>`).join('')}
    </nav>
    <div id="ausBody" class="aus-body"><div class="aus-loading">Carregando dados do usuário…</div></div>
  </section>`);
  load();
}
function render(){
  const panel=$('#ausPanel');if(!panel||!data)return;
  panel.querySelectorAll('[data-aus-tab]').forEach(b=>b.classList.toggle('active',b.dataset.ausTab===tab));
  const body=$('#ausBody');if(!body)return;
  const renders={overview:renderOverview,alerts:renderAlerts,habilitation:renderHabilitation,notifications:renderNotifications,security:renderSecurity,activity:renderActivity};
  body.innerHTML=(renders[tab]||renderOverview)();
}
function renderOverview(){
  const u=data.user||{},c=data.company||{},s=data.document_summary||{},n=data.notifications||{};
  const verifiedEmail=Boolean(n.email_verified_at),verifiedWa=Boolean(n.whatsapp_verified_at&&n.whatsapp_opt_in_at);
  return `<div class="aus-kpis">
    <article><span>Alertas</span><b>${num(data.alerts?.length)}</b><small>monitoramentos cadastrados</small></article>
    <article><span>Habilitação</span><b>${num(data.documents?.length)}</b><small>${num(s.urgent)} pendência(s) urgente(s)</small></article>
    <article><span>Sessões</span><b>${num(data.sessions?.length)}</b><small>sessões autenticadas abertas</small></article>
    <article><span>Canais verificados</span><b>${Number(verifiedEmail)+Number(verifiedWa)}/2</b><small>e-mail e WhatsApp</small></article>
  </div>
  <div class="aus-grid2">
    <section class="aus-card"><div class="aus-card-head"><div><span>CONTA</span><h3>${esc(u.email)}</h3></div>${u.active?pill('Ativa','green'):pill('Inativa','red')}</div>
      <div class="aus-detail-list">
        <div><span>Perfil</span><b>${esc(u.role==='admin'?'Administrador':'Usuário')}</b></div>
        <div><span>Plano</span><b>${esc(u.plan||'Essencial')} • ${esc(u.subscription_status||'active')}</b></div>
        <div><span>Cadastro</span><b>${esc(when(u.created_at))}</b></div>
        <div><span>Último login</span><b>${esc(when(u.last_login_at))}</b></div>
      </div>
    </section>
    <section class="aus-card"><div class="aus-card-head"><div><span>EMPRESA</span><h3>${esc(c.trade_name||c.legal_name||u.company_name||'Não cadastrada')}</h3></div></div>
      <div class="aus-detail-list">
        <div><span>CNPJ</span><b>${esc(c.cnpj||'—')}</b></div>
        <div><span>Razão social</span><b>${esc(c.legal_name||'—')}</b></div>
        <div><span>Localidade</span><b>${esc([c.municipality,c.state].filter(Boolean).join(' / ')||'—')}</b></div>
        <div><span>Responsável</span><b>${esc(c.contact_name||'—')}</b></div>
      </div>
    </section>
  </div>
  <section class="aus-card">
    <div class="aus-card-head"><div><span>SAÚDE DA CONTA</span><h3>Pontos de atenção</h3></div></div>
    <div class="aus-health">
      <div><b>Documentos urgentes</b>${s.urgent?pill(`${s.urgent} pendência(s)`,'red'):pill('Regular','green')}</div>
      <div><b>E-mail</b>${verifiedEmail?pill('Verificado','green'):pill('Não verificado','orange')}</div>
      <div><b>WhatsApp</b>${verifiedWa?pill('Verificado','green'):pill('Não verificado','orange')}</div>
      <div><b>Sessões abertas</b>${pill(String(data.sessions?.length||0),(data.sessions?.length||0)>3?'orange':'')}</div>
    </div>
  </section>`;
}
function alertForm(a={}){
  const id=a.id||'new';
  return `<form class="aus-alert-form" data-aus-alert-form="${id}">
    <div class="aus-form-grid">
      <label><span>Nome do alerta</span><input name="name" value="${esc(a.name||'')}" required placeholder="Ex.: Combustíveis RN"></label>
      <label><span>Palavra-chave</span><input name="keyword" value="${esc(a.keyword||'')}" placeholder="Ex.: gasolina"></label>
      <label><span>UF</span><select name="uf">${UFS.map(x=>`<option value="${x}" ${a.uf===x?'selected':''}>${x||'Brasil'}</option>`).join('')}</select></label>
      <label><span>Município</span><input name="municipality" value="${esc(a.municipality||'')}" placeholder="Opcional"></label>
      <label><span>Modalidade</span><select name="modality_code">${MOD.map(([v,l])=>`<option value="${v}" ${String(a.modality_code??'')===v?'selected':''}>${esc(l)}</option>`).join('')}</select></label>
      <label><span>Status</span><select name="enabled"><option value="true" ${a.enabled!==false?'selected':''}>Ativo</option><option value="false" ${a.enabled===false?'selected':''}>Pausado</option></select></label>
    </div>
    <div class="aus-channel-row">
      <label><input type="checkbox" name="onsite_enabled" ${a.onsite_enabled!==false?'checked':''}> Radar</label>
      <label><input type="checkbox" name="email_enabled" ${a.email_enabled!==false?'checked':''}> E-mail</label>
      <label><input type="checkbox" name="whatsapp_enabled" ${a.whatsapp_enabled!==false?'checked':''}> WhatsApp</label>
    </div>
    <div class="aus-actions"><button class="btn primary compact" type="submit">${id==='new'?'Criar alerta':'Salvar alerta'}</button>${id!=='new'?`<button type="button" class="btn danger compact" data-aus-alert-delete="${id}">Excluir</button>`:''}</div>
  </form>`;
}
function renderAlerts(){
  return `<section class="aus-card">
    <div class="aus-card-head"><div><span>NOVO MONITORAMENTO</span><h3>Criar alerta para o usuário</h3><p>O alerta pertence à conta do cliente e continuará funcionando normalmente.</p></div></div>
    ${alertForm()}
  </section>
  <section class="aus-card">
    <div class="aus-card-head"><div><span>ALERTAS EXISTENTES</span><h3>${num(data.alerts?.length)} monitoramento(s)</h3></div></div>
    <div class="aus-stack">${(data.alerts||[]).map(a=>`<details class="aus-alert-item"><summary><div><b>${esc(a.name)}</b><span>${esc([a.keyword,a.uf,a.municipality].filter(Boolean).join(' • ')||'Alerta amplo')}</span></div>${a.enabled?pill('Ativo','green'):pill('Pausado','orange')}</summary>${alertForm(a)}</details>`).join('')||'<div class="aus-empty">Nenhum alerta cadastrado.</div>'}</div>
  </section>`;
}
function renderHabilitation(){
  const c=data.company||{},s=data.document_summary||{};
  return `<div class="aus-kpis">
    <article><span>Total</span><b>${num(s.total)}</b><small>documentos atuais</small></article>
    <article><span>Válidos</span><b>${num(s.valid)}</b><small>fora da zona de atenção</small></article>
    <article><span>Até 7 dias</span><b>${num(Number(s.warning||0)+Number(s.critical||0))}</b><small>revisão recomendada</small></article>
    <article><span>Vencidos</span><b>${num(s.expired)}</b><small>regularização necessária</small></article>
  </div>
  <section class="aus-card">
    <div class="aus-card-head"><div><span>DADOS DA EMPRESA</span><h3>Cadastro da Habilitação</h3><p>Alterações ficam vinculadas à conta deste usuário.</p></div></div>
    <form id="ausCompanyForm" class="aus-form-grid">
      <label><span>CNPJ</span><input name="cnpj" value="${esc(c.cnpj||'')}"></label>
      <label><span>Razão social</span><input name="legal_name" value="${esc(c.legal_name||'')}"></label>
      <label><span>Nome fantasia</span><input name="trade_name" value="${esc(c.trade_name||'')}"></label>
      <label><span>UF</span><input name="state" maxlength="2" value="${esc(c.state||'')}"></label>
      <label><span>Município</span><input name="municipality" value="${esc(c.municipality||'')}"></label>
      <label><span>Responsável</span><input name="contact_name" value="${esc(c.contact_name||'')}"></label>
      <div class="aus-span2 aus-actions"><button class="btn primary compact" type="submit">Salvar cadastro</button></div>
    </form>
  </section>
  <section class="aus-card">
    <div class="aus-card-head"><div><span>ADICIONAR DOCUMENTO</span><h3>Upload assistido</h3><p>PDF, JPG ou PNG de até 8 MB. Uma nova versão do mesmo tipo substitui a atual e preserva o histórico do módulo.</p></div></div>
    <form id="ausDocUploadForm">
      <div class="aus-form-grid">
        <label><span>Tipo</span><select name="doc_type">${DOC_TYPES.map(([v,l])=>`<option value="${v}">${esc(l)}</option>`).join('')}</select></label>
        <label><span>Órgão emissor</span><input name="issuer"></label>
        <label><span>Data de emissão</span><input name="issue_date" type="date"></label>
        <label><span>Vencimento</span><input name="expiry_date" type="date"></label>
        <label class="aus-span2"><span>Arquivo</span><input name="file" type="file" accept="application/pdf,image/jpeg,image/png" required></label>
      </div>
      <div class="aus-actions"><button class="btn primary compact" type="submit">Adicionar ao dossiê</button></div>
    </form>
  </section>
  <section class="aus-card">
    <div class="aus-card-head"><div><span>DOSSIÊ ATUAL</span><h3>Documentos controlados</h3></div></div>
    <div class="aus-docs">${(data.documents||[]).map(d=>`<article class="aus-doc">
      <div class="aus-doc-main"><div class="aus-doc-top">${pill(d.status_label,d.status==='expired'?'red':d.status==='critical'||d.status==='warning'?'orange':d.status==='valid'?'green':'')}<span>${esc(d.category||'')}</span></div><b>${esc(d.label)}</b><small>${esc(d.filename)} • ${esc(d.issuer||'Órgão não informado')}</small></div>
      <div class="aus-doc-edit"><label>Vencimento<input type="date" value="${esc(date(d.expiry_date))}" data-aus-doc-expiry="${d.id}"></label><button type="button" class="btn ghost compact" data-aus-doc-save="${d.id}">Salvar</button></div>
      <div class="aus-doc-actions"><a class="btn ghost compact" href="/api/admin-support/users/${userId}/documents/${d.id}/download">Baixar</a><button type="button" class="btn danger compact" data-aus-doc-delete="${d.id}">Excluir</button></div>
    </article>`).join('')||'<div class="aus-empty">Nenhum documento cadastrado.</div>'}</div>
  </section>`;
}
function renderNotifications(){
  const n=data.notifications||{};
  return `<section class="aus-card">
    <div class="aus-card-head"><div><span>CANAIS DO USUÁRIO</span><h3>Notificações e contatos</h3><p>Se o ADM trocar um contato, a verificação desse canal é anulada automaticamente e o usuário precisará confirmar novamente.</p></div></div>
    <form id="ausNotificationsForm">
      <div class="aus-channel-card">
        <div><b>E-mail</b>${n.email_verified_at?pill('Verificado','green'):pill('Não verificado','orange')}</div>
        <div class="aus-form-grid"><label><span>Endereço</span><input name="email" type="email" value="${esc(n.email||'')}"></label><label><span>Canal</span><select name="email_enabled"><option value="true" ${n.email_enabled!==false?'selected':''}>Habilitado</option><option value="false" ${n.email_enabled===false?'selected':''}>Desabilitado</option></select></label></div>
      </div>
      <div class="aus-channel-card">
        <div><b>WhatsApp</b>${n.whatsapp_verified_at&&n.whatsapp_opt_in_at?pill('Verificado + opt-in','green'):pill('Não verificado','orange')}</div>
        <div class="aus-form-grid"><label><span>Número</span><input name="whatsapp_e164" value="${esc(n.whatsapp_e164||'')}" placeholder="(84) 99999-9999"></label><label><span>Canal</span><select name="whatsapp_enabled"><option value="true" ${n.whatsapp_enabled!==false?'selected':''}>Habilitado</option><option value="false" ${n.whatsapp_enabled===false?'selected':''}>Desabilitado</option></select></label></div>
      </div>
      <div class="aus-actions"><button class="btn primary" type="submit">Salvar canais</button></div>
    </form>
    <div class="aus-notice">O administrador não pode marcar um contato como verificado manualmente. Isso protege a identidade do usuário e o consentimento do WhatsApp.</div>
  </section>`;
}
function renderSecurity(){
  const u=data.user||{};
  return `<section class="aus-card">
    <div class="aus-card-head"><div><span>SEGURANÇA DA CONTA</span><h3>Sessões e acesso</h3><p>Senha e token de sessão nunca são exibidos ao administrador.</p></div></div>
    <div class="aus-health">
      <div><b>Status da conta</b>${yesNo(u.active)}</div>
      <div><b>Perfil</b>${pill(u.role==='admin'?'Administrador':'Usuário',u.role==='admin'?'purple':'')}</div>
      <div><b>Sessões abertas</b>${pill(String(data.sessions?.length||0),(data.sessions?.length||0)>3?'orange':'')}</div>
      <div><b>Último login</b><span>${esc(when(u.last_login_at))}</span></div>
    </div>
    <div class="aus-session-list">${(data.sessions||[]).map(s=>`<div><span>Sessão iniciada ${esc(when(s.created_at))}</span><small>Expira ${esc(when(s.expires_at))}</small></div>`).join('')||'<div class="aus-empty">Nenhuma sessão ativa.</div>'}</div>
    ${data.sessions?.length?`<div class="aus-actions"><button type="button" class="btn danger" data-aus-revoke-sessions>Encerrar todas as sessões</button></div>`:''}
    <div class="aus-notice">Alteração de perfil, ativação/desativação da conta, plano e limites continuam no formulário “Gerenciar conta” logo acima deste painel.</div>
  </section>`;
}
function renderActivity(){
  return `<div class="aus-grid2">
    <section class="aus-card"><div class="aus-card-head"><div><span>AUDITORIA</span><h3>Atividade da conta</h3></div></div>
      <div class="aus-timeline">${(data.activity||[]).map(x=>`<div><i></i><div><b>${esc(x.action)}</b><span>${esc(when(x.created_at))}</span><small>${esc(x.ip||'')}</small></div></div>`).join('')||'<div class="aus-empty">Sem atividade recente.</div>'}</div>
    </section>
    <section class="aus-card"><div class="aus-card-head"><div><span>ENTREGAS</span><h3>Notificações recentes</h3></div></div>
      <div class="aus-timeline">${(data.deliveries||[]).map(x=>`<div><i></i><div><b>${esc((x.channel||'').toUpperCase())} • ${esc(x.status)}</b><span>${esc(when(x.created_at))}</span><small>${esc(x.error||x.provider_id||'Sem erro')}</small></div></div>`).join('')||'<div class="aus-empty">Sem entregas recentes.</div>'}</div>
    </section>
  </div>`;
}
async function fileBase64(file){
  return await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||'').split(',')[1]||'');r.onerror=reject;r.readAsDataURL(file)});
}
function formObject(form){return Object.fromEntries(new FormData(form).entries())}

document.addEventListener('click',e=>{
  const manage=e.target.closest('[data-user-edit]');
  if(manage)setTimeout(()=>mount(manage.dataset.userEdit),0);
  const p=e.target.closest('#ausPanel');if(!p)return;
  const tb=e.target.closest('[data-aus-tab]');if(tb){tab=tb.dataset.ausTab;render();return}
  if(e.target.closest('[data-aus-refresh]')){load();return}
  const delAlert=e.target.closest('[data-aus-alert-delete]');
  if(delAlert&&confirm('Excluir este alerta da conta do usuário?')){api(`/api/admin-support/users/${userId}/alerts/${delAlert.dataset.ausAlertDelete}`,{method:'DELETE',body:'{}'}).then(()=>{toast('Alerta excluído.');load()}).catch(x=>toast(x.message,true));return}
  const saveDoc=e.target.closest('[data-aus-doc-save]');
  if(saveDoc){const id=saveDoc.dataset.ausDocSave,expiry=$(`[data-aus-doc-expiry="${id}"]`);api(`/api/admin-support/users/${userId}/documents/${id}`,{method:'PATCH',body:JSON.stringify({expiry_date:expiry?.value||null})}).then(()=>{toast('Validade atualizada.');load()}).catch(x=>toast(x.message,true));return}
  const delDoc=e.target.closest('[data-aus-doc-delete]');
  if(delDoc&&confirm('Excluir este documento do dossiê do usuário? Esta ação será auditada.')){api(`/api/admin-support/users/${userId}/documents/${delDoc.dataset.ausDocDelete}`,{method:'DELETE',body:'{}'}).then(()=>{toast('Documento excluído.');load()}).catch(x=>toast(x.message,true));return}
  if(e.target.closest('[data-aus-revoke-sessions]')&&confirm('Encerrar todas as sessões abertas deste usuário?')){api(`/api/admin-support/users/${userId}/sessions/revoke`,{method:'POST',body:'{}'}).then(d=>{toast(`${d.sessions||0} sessão(ões) encerrada(s).`);load()}).catch(x=>toast(x.message,true));return}
});

document.addEventListener('submit',async e=>{
  if(!e.target.closest('#ausPanel'))return;
  e.preventDefault();
  try{
    if(e.target.id==='ausCompanyForm'){
      await api(`/api/admin-support/users/${userId}/company`,{method:'PATCH',body:JSON.stringify(formObject(e.target))});
      toast('Cadastro da empresa atualizado.');await load();return;
    }
    if(e.target.id==='ausNotificationsForm'){
      const p=formObject(e.target);p.email_enabled=p.email_enabled!=='false';p.whatsapp_enabled=p.whatsapp_enabled!=='false';
      const r=await api(`/api/admin-support/users/${userId}/notifications`,{method:'PATCH',body:JSON.stringify(p)});
      toast(r.requires_reverification?'Canais salvos. O contato alterado precisará ser verificado novamente.':'Canais atualizados.');await load();return;
    }
    if(e.target.matches('[data-aus-alert-form]')){
      const p=formObject(e.target);p.enabled=p.enabled!=='false';p.onsite_enabled=e.target.elements.onsite_enabled.checked;p.email_enabled=e.target.elements.email_enabled.checked;p.whatsapp_enabled=e.target.elements.whatsapp_enabled.checked;
      const id=e.target.dataset.ausAlertForm;
      await api(id==='new'?`/api/admin-support/users/${userId}/alerts`:`/api/admin-support/users/${userId}/alerts/${id}`,{method:id==='new'?'POST':'PATCH',body:JSON.stringify(p)});
      toast(id==='new'?'Alerta criado para o usuário.':'Alerta atualizado.');await load();return;
    }
    if(e.target.id==='ausDocUploadForm'){
      const f=new FormData(e.target),file=f.get('file');
      if(!(file instanceof File)||!file.size)throw new Error('Selecione um arquivo.');
      if(file.size>8*1024*1024)throw new Error('O arquivo deve ter no máximo 8 MB.');
      if(!['application/pdf','image/jpeg','image/png'].includes(file.type))throw new Error('Use PDF, JPG ou PNG.');
      const p={doc_type:f.get('doc_type'),issuer:f.get('issuer'),issue_date:f.get('issue_date')||null,expiry_date:f.get('expiry_date')||null,filename:file.name,mime_type:file.type,content_base64:await fileBase64(file)};
      const b=e.target.querySelector('button[type="submit"]');if(b){b.disabled=true;b.textContent='Enviando…'}
      try{await api(`/api/admin-support/users/${userId}/documents`,{method:'POST',body:JSON.stringify(p)});toast('Documento adicionado ao dossiê.');await load()}finally{if(b){b.disabled=false;b.textContent='Adicionar ao dossiê'}}
      return;
    }
  }catch(x){toast(x.message,true)}
});

document.addEventListener('DOMContentLoaded',async()=>{
  try{
    const me=await api('/api/me');
    if(me.user?.role!=='admin')return;
    document.documentElement.dataset.adminSupport='1';
  }catch{}
},{once:true});
})();