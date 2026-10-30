(()=>{
  'use strict';
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const state={profile:null,providers:null,unread:0,busy:false,bound:false,lastLoad:0};
  const UFS=['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
  const MODALITIES={1:'Leilão - Eletrônico',2:'Diálogo Competitivo',3:'Concurso',4:'Concorrência - Eletrônica',5:'Concorrência - Presencial',6:'Pregão - Eletrônico',7:'Pregão - Presencial',8:'Dispensa de Licitação',9:'Inexigibilidade',10:'Manifestação de Interesse',11:'Pré-qualificação',12:'Credenciamento',13:'Leilão - Presencial',14:'Outras / código 14'};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const isAuth=()=>{const a=$('#auth'),app=$('#app');return Boolean(a&&app&&(a.classList.contains('hidden')||getComputedStyle(a).display==='none')&&!app.classList.contains('hidden'))};
  const fmtDate=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})};
  const money=v=>{const n=Number(v);return Number.isFinite(n)?n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'—'};
  const channelLabel=c=>({onsite:'No Radar',email:'E-mail',whatsapp:'WhatsApp'}[c]||c);
  const statusLabel=s=>({sent:'Enviado',queued:'Na fila',sending:'Enviando',waiting_provider:'Aguardando provedor',failed:'Falhou',skipped:'Ignorado'}[s]||s);

  function icon(name){
    const p={bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',mail:'<path d="M3 5h18v14H3z"/><path d="m3 7 9 6 9-6"/>',whatsapp:'<path d="M20 11.5a8 8 0 0 1-11.7 7.1L4 20l1.4-4.1A8 8 0 1 1 20 11.5Z"/><path d="M9 8.5c.4 2.5 2 4.1 4.5 4.8"/>',refresh:'<path d="M20 6v5h-5M4 18v-5h5M6 9a7 7 0 0 1 12-3l2 5M18 15a7 7 0 0 1-12 3l-2-5"/>',send:'<path d="m3 11 18-8-8 18-2-7z"/><path d="M11 14 21 3"/>'};
    return `<svg class="rlb-notif-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p[name]||p.bell}</svg>`;
  }
  async function api(path,opt={}){const r=await fetch(path,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(opt.headers||{})},...opt});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Falha na operação.');return d}
  function notice(text,type='ok'){const box=$('#rlbNotifMsg');if(box)box.innerHTML=text?`<div class="rlb-notif-notice ${type}">${esc(text)}</div>`:''}

  function upgradeAlertFilters(){
    const currentUf=$('#alertUf');
    if(currentUf&&currentUf.tagName!=='SELECT'){
      const sel=document.createElement('select');sel.id='alertUf';sel.innerHTML='<option value="">Todos os estados</option>'+UFS.map(uf=>`<option value="${uf}">${uf}</option>`).join('');currentUf.replaceWith(sel);
    }
    const modal=$('#alertModal');
    if(modal&&!modal.dataset.rlbFull){modal.innerHTML='<option value="">Todas as modalidades</option>'+Object.entries(MODALITIES).map(([k,v])=>`<option value="${k}">${esc(v)}</option>`).join('');modal.dataset.rlbFull='1'}
  }

  function ensureNav(){
    const nav=$('.nav');if(!nav)return;
    let btn=$('#rlbNotificationsNav');
    if(!btn){btn=document.createElement('button');btn.type='button';btn.id='rlbNotificationsNav';btn.dataset.view='notifications';btn.innerHTML=`<span class="rlb-nav-v6-icon">${icon('bell')}</span><span class="rlb-nav-copy"><strong>Notificações</strong><small>E-mail, WhatsApp e Radar</small></span><span class="rlb-notif-nav-badge" id="rlbNotifBadge" hidden>0</span>`;}
    let group=$('#rlbNotificationsGroup');
    if(!group){group=document.createElement('div');group.className='rlb-nav-section';group.id='rlbNotificationsGroup';group.innerHTML='<div class="rlb-nav-section-title">Comunicação</div>';const logout=$('#logout');nav.insertBefore(group,logout||null)}
    if(btn.parentElement!==group)group.appendChild(btn);
    if(!btn.dataset.rlbBound){btn.dataset.rlbBound='1';btn.addEventListener('click',showView)}
  }

  function viewMarkup(){return `
    <div class="rlb-section-banner rlb-notif-banner"><span class="rlb-section-icon">${icon('bell')}</span><div><h2>Central de Notificações</h2><p>Cadastre e confirme seus contatos. Sempre que um alerta corresponder a uma nova oportunidade, o Radar registra primeiro e envia também por e-mail e/ou WhatsApp quando esses canais estiverem habilitados.</p></div></div>
    <div id="rlbNotifMsg"></div>
    <div class="rlb-notif-provider-strip" id="rlbNotifProviderStrip"></div>
    <div class="rlb-notif-grid">
      <article class="card rlb-notif-contact-card"><div class="rlb-notif-card-head"><span class="rlb-notif-channel-icon email">${icon('mail')}</span><div><h3>E-mail de alertas</h3><p>Cadastre um endereço e confirme pelo código recebido.</p></div><span class="rlb-notif-state" id="rlbEmailState">—</span></div><div class="rlb-notif-contact-form"><label for="rlbNotifEmail">E-mail</label><div class="rlb-notif-inline"><input id="rlbNotifEmail" type="email" autocomplete="email" placeholder="voce@empresa.com.br"><button id="rlbEmailVerifyRequest" class="btn" type="button">Enviar código</button></div><div class="rlb-notif-code-row" id="rlbEmailCodeRow" hidden><input id="rlbEmailCode" inputmode="numeric" maxlength="6" placeholder="Código de 6 dígitos"><button id="rlbEmailVerifyConfirm" class="btn primary" type="button">Confirmar</button></div><div class="rlb-notif-card-actions"><label class="rlb-notif-switch"><input id="rlbEmailEnabled" type="checkbox"><span></span> Receber alertas por e-mail</label><button id="rlbEmailTest" class="btn tiny" type="button">Enviar teste</button></div></div></article>
      <article class="card rlb-notif-contact-card"><div class="rlb-notif-card-head"><span class="rlb-notif-channel-icon whatsapp">${icon('whatsapp')}</span><div><h3>WhatsApp de alertas</h3><p>Cadastre o número com DDD, confirme e autorize as notificações.</p></div><span class="rlb-notif-state" id="rlbWhatsappState">—</span></div><div class="rlb-notif-contact-form"><label for="rlbNotifWhatsapp">WhatsApp com DDD</label><div class="rlb-notif-inline"><input id="rlbNotifWhatsapp" type="tel" autocomplete="tel" placeholder="(84) 99999-9999"><button id="rlbWhatsappVerifyRequest" class="btn" type="button">Enviar código</button></div><div class="rlb-notif-code-row" id="rlbWhatsappCodeRow" hidden><input id="rlbWhatsappCode" inputmode="numeric" maxlength="6" placeholder="Código de 6 dígitos"><button id="rlbWhatsappVerifyConfirm" class="btn primary" type="button">Confirmar</button></div><div class="rlb-notif-card-actions"><label class="rlb-notif-switch"><input id="rlbWhatsappEnabled" type="checkbox"><span></span> Receber alertas pelo WhatsApp</label><button id="rlbWhatsappTest" class="btn tiny" type="button">Enviar teste</button></div><p class="rlb-notif-consent">Ao confirmar, você autoriza o Radar de Licitações Brasil a enviar mensagens relacionadas exclusivamente aos alertas configurados.</p></div></article>
    </div>
    <article class="card rlb-notif-rules-card"><div class="toolbar"><div><h2>Filtros e canais por alerta</h2><div class="sub">UF, município e modalidade vêm do alerta salvo. A notificação no Radar é obrigatória; e-mail e WhatsApp são adicionais.</div></div><button id="rlbNotifRefreshRules" class="btn">${icon('refresh')} Atualizar</button></div><div id="rlbNotifRules" class="rlb-notif-rules"></div></article>
    <article class="card rlb-notif-history-card section-gap"><div class="toolbar"><div><h2>Histórico de notificações</h2><div class="sub">Cada oportunidade é registrada uma única vez por alerta e canal.</div></div><div class="actions"><button id="rlbNotifReadAll" class="btn">Marcar como lidas</button><button id="rlbNotifRefreshHistory" class="btn">${icon('refresh')} Atualizar</button></div></div><div id="rlbNotifHistory" class="rlb-notif-history"></div></article>`}

  function ensureView(){
    const app=$('#app');if(!app)return;
    let section=$('#view-notifications');
    if(!section){section=document.createElement('section');section.id='view-notifications';section.className='hidden rlb-notifications-view';app.appendChild(section)}
    if(!section.dataset.rlbReady){section.innerHTML=viewMarkup();section.dataset.rlbReady='1';bindView()}
  }

  function ensureAlertHint(){
    const view=$('#view-alerts');if(!view||$('#rlbNotifAlertHint'))return;
    const hint=document.createElement('div');hint.id='rlbNotifAlertHint';hint.className='rlb-notif-alert-hint';hint.innerHTML=`<span>${icon('send')}</span><div><b>Alertas multicanal</b><p>O Radar sempre registra a oportunidade. Cadastre seu e-mail/WhatsApp e escolha os canais adicionais na Central de Notificações.</p></div><button class="btn tiny primary" type="button">Cadastrar contatos</button>`;hint.querySelector('button').addEventListener('click',showView);view.prepend(hint);
  }

  function ensureMobile(){
    const more=$('#rlbMobileMore');if(!more||$('[data-mobile-notifications]',more))return;
    const b=document.createElement('button');b.type='button';b.dataset.mobileNotifications='';b.innerHTML=`${icon('bell')}<span>Notificações</span><span class="rlb-mobile-notif-count" id="rlbMobileNotifBadge" hidden>0</span>`;b.addEventListener('click',()=>{showView();more.hidden=true});more.insertBefore(b,more.firstChild);
  }

  function showView(){
    ensureView();$$('section[id^="view-"]').forEach(s=>s.classList.add('hidden'));$('#view-notifications')?.classList.remove('hidden');$$('.nav [data-view]').forEach(b=>b.classList.toggle('active',b.id==='rlbNotificationsNav'));loadAll(true);
  }

  function providerStrip(){
    const p=state.providers||{},email=p.email?.configured,wa=p.whatsapp?.configured,waVerify=p.whatsapp?.verification_configured,box=$('#rlbNotifProviderStrip');if(!box)return;
    box.innerHTML=`<div class="rlb-notif-provider ${email?'ok':'warn'}"><span>${icon('mail')}</span><div><b>E-mail • Resend</b><small>${email?'Provedor conectado':'Aguardando configuração do provedor'}</small></div></div><div class="rlb-notif-provider ${wa?'ok':'warn'}"><span>${icon('whatsapp')}</span><div><b>WhatsApp • Twilio</b><small>${wa?(waVerify?'Envio e verificação configurados':'Envio configurado; falta template de verificação'):'Aguardando configuração do WhatsApp Business'}</small></div></div><div class="rlb-notif-provider ok"><span>${icon('bell')}</span><div><b>Radar</b><small>Canal interno obrigatório e ativo para todos os alertas correspondentes</small></div></div>`;
  }
  function setBadge(n){for(const id of ['#rlbNotifBadge','#rlbMobileNotifBadge']){const b=$(id);if(!b)continue;b.textContent=String(n);b.hidden=n<=0}}
  function renderProfile(){
    const p=state.profile||{};providerStrip();const email=$('#rlbNotifEmail'),wa=$('#rlbNotifWhatsapp');if(email&&!email.matches(':focus'))email.value=p.email||'';if(wa&&!wa.matches(':focus'))wa.value=p.whatsapp_e164||'';
    if($('#rlbEmailEnabled'))$('#rlbEmailEnabled').checked=p.email_enabled!==false;if($('#rlbWhatsappEnabled'))$('#rlbWhatsappEnabled').checked=p.whatsapp_enabled!==false;
    const es=$('#rlbEmailState');if(es){es.textContent=p.email_verified?'Confirmado':'Não confirmado';es.className='rlb-notif-state '+(p.email_verified?'ok':'warn')}
    const ws=$('#rlbWhatsappState');if(ws){ws.textContent=p.whatsapp_verified?'Confirmado':'Não confirmado';ws.className='rlb-notif-state '+(p.whatsapp_verified?'ok':'warn')}
    if($('#rlbEmailTest'))$('#rlbEmailTest').disabled=!p.email_verified||!state.providers?.email?.configured;if($('#rlbWhatsappTest'))$('#rlbWhatsappTest').disabled=!p.whatsapp_verified||!state.providers?.whatsapp?.configured;setBadge(state.unread||0)
  }

  async function loadProfile(){const d=await api('/api/notifications/profile');state.profile=d.profile;state.providers=d.providers;state.unread=Number(d.unread_count||0);renderProfile()}
  async function requestVerification(channel){const input=channel==='email'?$('#rlbNotifEmail'):$('#rlbNotifWhatsapp');if(!input?.value.trim())return notice('Informe o contato antes de solicitar o código.','err');try{notice('Enviando código de confirmação...','info');const d=await api('/api/notifications/verify/request',{method:'POST',body:JSON.stringify({channel,destination:input.value.trim()})});(channel==='email'?$('#rlbEmailCodeRow'):$('#rlbWhatsappCodeRow')).hidden=false;notice(d.message||'Código enviado.','ok')}catch(e){notice(e.message,'err')}}
  async function confirmVerification(channel){const input=channel==='email'?$('#rlbEmailCode'):$('#rlbWhatsappCode');if(!/^\d{6}$/.test(input?.value||''))return notice('Informe o código de 6 dígitos.','err');try{const d=await api('/api/notifications/verify/confirm',{method:'POST',body:JSON.stringify({channel,code:input.value})});input.value='';(channel==='email'?$('#rlbEmailCodeRow'):$('#rlbWhatsappCodeRow')).hidden=true;notice(d.message,'ok');await loadProfile()}catch(e){notice(e.message,'err')}}
  async function saveGlobal(){try{const d=await api('/api/notifications/profile',{method:'PUT',body:JSON.stringify({email_enabled:$('#rlbEmailEnabled')?.checked===true,whatsapp_enabled:$('#rlbWhatsappEnabled')?.checked===true})});state.profile=d.profile;state.providers=d.providers;state.unread=Number(d.unread_count||0);renderProfile()}catch(e){notice(e.message,'err')}}
  async function sendTest(channel){try{notice(`Enviando teste por ${channelLabel(channel)}...`,'info');await api('/api/notifications/test',{method:'POST',body:JSON.stringify({channel})});notice(`Teste enviado por ${channelLabel(channel)}.`,'ok')}catch(e){notice(e.message,'err')}}

  function summary(a){const bits=[];if(a.keyword)bits.push(`Objeto: “${a.keyword}”`);bits.push(`UF: ${a.uf||'Todas'}`);if(a.municipality)bits.push(`Município: ${a.municipality}`);bits.push(`Modalidade: ${a.modality_code?(MODALITIES[a.modality_code]||('Código '+a.modality_code)):'Todas'}`);if(a.org_name)bits.push(`Órgão: ${a.org_name}`);return bits.join(' • ')}
  async function loadRules(){
    const box=$('#rlbNotifRules');if(!box)return;box.innerHTML='<div class="rlb-notif-loading">Carregando alertas...</div>';
    try{const d=await api('/api/notifications/alerts');const items=d.items||[];box.innerHTML=items.map(a=>`<div class="rlb-notif-rule" data-rule-id="${Number(a.id)}"><div class="rlb-notif-rule-main"><div class="rlb-notif-rule-title"><span class="rlb-notif-rule-dot ${a.enabled?'ok':'off'}"></span><div><b>${esc(a.name)}</b><small>${esc(summary(a))}</small></div></div><div class="rlb-notif-rule-region"><label>Macrorregião adicional</label><select data-rule-region><option value="ALL" ${a.region==='ALL'?'selected':''}>Sem restrição adicional</option><option value="NORTE" ${a.region==='NORTE'?'selected':''}>Norte</option><option value="NORDESTE" ${a.region==='NORDESTE'?'selected':''}>Nordeste</option><option value="CENTRO-OESTE" ${a.region==='CENTRO-OESTE'?'selected':''}>Centro-Oeste</option><option value="SUDESTE" ${a.region==='SUDESTE'?'selected':''}>Sudeste</option><option value="SUL" ${a.region==='SUL'?'selected':''}>Sul</option></select></div></div><div class="rlb-notif-rule-channels"><label title="Obrigatório"><input type="checkbox" checked disabled> <span>No Radar • obrigatório</span></label><label><input type="checkbox" data-rule-email ${a.email_enabled?'checked':''}> <span>E-mail</span></label><label><input type="checkbox" data-rule-whatsapp ${a.whatsapp_enabled?'checked':''}> <span>WhatsApp</span></label><button type="button" class="btn tiny primary" data-rule-save>Salvar canais</button></div></div>`).join('')||'<div class="empty">Você ainda não possui alertas. Abra “Alertas”, escolha UF, modalidade e demais filtros e salve o primeiro.</div>'}catch(e){box.innerHTML=`<div class="empty">${esc(e.message)}</div>`}}
  async function saveRule(row){const id=row?.dataset.ruleId;if(!id)return;const btn=$('[data-rule-save]',row);btn.disabled=true;try{await api('/api/notifications/alerts/'+id,{method:'PUT',body:JSON.stringify({region:$('[data-rule-region]',row).value,onsite_enabled:true,email_enabled:$('[data-rule-email]',row).checked,whatsapp_enabled:$('[data-rule-whatsapp]',row).checked})});notice('Canais e região do alerta atualizados.','ok')}catch(e){notice(e.message,'err')}finally{btn.disabled=false}}

  function groupDeliveries(items){const map=new Map();for(const x of items){const key=`${x.alert_id}:${x.pncp_id}`;if(!map.has(key))map.set(key,{...x,channels:[]});map.get(key).channels.push({channel:x.channel,status:x.status,error:x.error,sent_at:x.sent_at,read_at:x.read_at})}return [...map.values()]}
  async function loadHistory(){const box=$('#rlbNotifHistory');if(!box)return;box.innerHTML='<div class="rlb-notif-loading">Carregando notificações...</div>';try{const d=await api('/api/notifications/deliveries?limit=90');const groups=groupDeliveries(d.items||[]);box.innerHTML=groups.map(x=>{const p=x.payload||{},unread=x.channels.some(c=>c.channel==='onsite'&&!c.read_at);return `<article class="rlb-notif-event ${unread?'unread':''}"><div class="rlb-notif-event-mark"></div><div class="rlb-notif-event-body"><div class="rlb-notif-event-top"><span class="rlb-notif-event-alert">${esc(x.alert_name||p.alert_name||'Alerta')}</span><span>${esc(fmtDate(x.created_at))}</span></div><h3>${esc(p.object||'Oportunidade monitorada')}</h3><div class="rlb-notif-event-meta"><span>${esc(p.modality||'Modalidade não informada')}</span><span>${esc(p.org||'Órgão não informado')}</span><span>${esc([p.municipality,p.uf].filter(Boolean).join(' / ')||'Local não informado')}</span>${p.estimated_value!==null&&p.estimated_value!==undefined?`<span>${esc(money(p.estimated_value))}</span>`:''}</div><div class="rlb-notif-event-channels">${x.channels.map(c=>`<span class="rlb-delivery-chip ${esc(c.status)}" title="${esc(c.error||'')}">${esc(channelLabel(c.channel))}: ${esc(statusLabel(c.status))}</span>`).join('')}</div></div>${p.pncp_url?`<a class="btn tiny" href="${esc(p.pncp_url)}" target="_blank" rel="noopener">Abrir PNCP</a>`:''}</article>`}).join('')||'<div class="empty">Ainda não há notificações. Quando surgir uma nova oportunidade compatível com um alerta, ela aparecerá aqui.</div>';state.lastLoad=Date.now()}catch(e){box.innerHTML=`<div class="empty">${esc(e.message)}</div>`}}

  async function loadAll(force=false){if(!isAuth()||state.busy)return;if(!force&&Date.now()-state.lastLoad<12000)return;state.busy=true;try{await Promise.allSettled([loadProfile(),loadRules(),loadHistory()])}finally{state.busy=false}}
  function bindView(){if(state.bound)return;state.bound=true;$('#rlbEmailVerifyRequest')?.addEventListener('click',()=>requestVerification('email'));$('#rlbWhatsappVerifyRequest')?.addEventListener('click',()=>requestVerification('whatsapp'));$('#rlbEmailVerifyConfirm')?.addEventListener('click',()=>confirmVerification('email'));$('#rlbWhatsappVerifyConfirm')?.addEventListener('click',()=>confirmVerification('whatsapp'));$('#rlbEmailEnabled')?.addEventListener('change',saveGlobal);$('#rlbWhatsappEnabled')?.addEventListener('change',saveGlobal);$('#rlbEmailTest')?.addEventListener('click',()=>sendTest('email'));$('#rlbWhatsappTest')?.addEventListener('click',()=>sendTest('whatsapp'));$('#rlbNotifRefreshRules')?.addEventListener('click',loadRules);$('#rlbNotifRules')?.addEventListener('click',e=>{const b=e.target.closest('[data-rule-save]');if(b)saveRule(b.closest('.rlb-notif-rule'))});$('#rlbNotifRefreshHistory')?.addEventListener('click',loadHistory);$('#rlbNotifReadAll')?.addEventListener('click',async()=>{try{await api('/api/notifications/read-all',{method:'POST',body:'{}'});state.unread=0;setBadge(0);await loadHistory()}catch(e){notice(e.message,'err')}})}

  async function refreshBadge(){if(!isAuth())return;try{const d=await api('/api/notifications/profile');state.profile=d.profile;state.providers=d.providers;state.unread=Number(d.unread_count||0);setBadge(state.unread)}catch{}}
  function ensureAll(){upgradeAlertFilters();ensureNav();ensureView();ensureAlertHint();ensureMobile();if(isAuth())refreshBadge()}
  function install(){
    ensureAll();[100,300,700,1400,2600,5000,8000,12000].forEach(ms=>setTimeout(ensureAll,ms));
    $('#authBtn')?.addEventListener('click',()=>{[250,700,1500,3000].forEach(ms=>setTimeout(()=>{ensureAll();if(isAuth())loadAll(true)},ms))});
    window.addEventListener('pageshow',ensureAll);window.addEventListener('focus',()=>{ensureAll();if(isAuth())refreshBadge()});window.addEventListener('rlb:live-procurements',()=>setTimeout(()=>{refreshBadge();if(!$('#view-notifications')?.classList.contains('hidden'))loadAll(true)},800));
    document.addEventListener('click',e=>{const b=e.target.closest('.nav [data-view]');if(b&&b.id!=='rlbNotificationsNav')$('#view-notifications')?.classList.add('hidden')},true);
    window.RLBNotificationsOpen=showView;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
