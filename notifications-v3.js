(()=>{
  'use strict';
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const state={profile:null,providers:null,unread:0,loading:false};
  const UFS=['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
  const MODALITIES={1:'Leilão - Eletrônico',2:'Diálogo Competitivo',3:'Concurso',4:'Concorrência - Eletrônica',5:'Concorrência - Presencial',6:'Pregão - Eletrônico',7:'Pregão - Presencial',8:'Dispensa de Licitação',9:'Inexigibilidade',10:'Manifestação de Interesse',11:'Pré-qualificação',12:'Credenciamento',13:'Leilão - Presencial',14:'Outras / código 14'};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})};
  const money=v=>{const n=Number(v);return Number.isFinite(n)?n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'—'};
  const channelLabel=c=>({onsite:'No Radar',email:'E-mail',whatsapp:'WhatsApp'}[c]||c);
  const statusLabel=s=>({sent:'Enviado',queued:'Na fila',sending:'Enviando',waiting_provider:'Aguardando provedor',failed:'Falhou',skipped:'Ignorado'}[s]||s);
  const isAuth=()=>{const a=$('#auth'),app=$('#app');return Boolean(a&&app&&(a.classList.contains('hidden')||getComputedStyle(a).display==='none')&&!app.classList.contains('hidden'))};

  function icon(name){
    const p={bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',mail:'<path d="M3 5h18v14H3z"/><path d="m3 7 9 6 9-6"/>',whatsapp:'<path d="M20 11.5a8 8 0 0 1-11.7 7.1L4 20l1.4-4.1A8 8 0 1 1 20 11.5Z"/><path d="M9 8.5c.4 2.5 2 4.1 4.5 4.8"/>',refresh:'<path d="M20 6v5h-5M4 18v-5h5M6 9a7 7 0 0 1 12-3l2 5M18 15a7 7 0 0 1-12 3l-2-5"/>',send:'<path d="m3 11 18-8-8 18-2-7z"/><path d="M11 14 21 3"/>'};
    return `<svg class="rlb-notif-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p[name]||p.bell}</svg>`;
  }

  async function api(path,opt={}){
    const r=await fetch(path,{credentials:'same-origin',headers:{'Content-Type':'application/json',accept:'application/json',...(opt.headers||{})},...opt});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||'Falha na operação.');
    return d;
  }
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
    let group=$('#rlbNotificationsGroup');
    if(!group){group=document.createElement('div');group.id='rlbNotificationsGroup';group.className='rlb-nav-section';group.innerHTML='<div class="rlb-nav-section-title">Comunicação</div>';nav.insertBefore(group,$('#logout')||null)}
    let btn=$('#rlbNotificationsNav');
    if(!btn){btn=document.createElement('button');btn.id='rlbNotificationsNav';btn.type='button';btn.dataset.view='notifications';btn.innerHTML=`<span class="rlb-nav-v6-icon">${icon('bell')}</span><span class="rlb-nav-copy"><strong>Notificações</strong><small>Radar, e-mail e WhatsApp</small></span><span class="rlb-notif-nav-badge" id="rlbNotifBadge" hidden>0</span>`;group.appendChild(btn)}
    btn.hidden=false;btn.classList.remove('hidden');group.hidden=false;group.classList.remove('hidden');
  }

  function markup(){return `
    <div class="rlb-section-banner rlb-notif-banner"><span class="rlb-section-icon">${icon('bell')}</span><div><h2>Central de Notificações</h2><p>O Radar registra a oportunidade primeiro. Depois, a fila envia por e-mail e/ou WhatsApp conforme os canais confirmados e habilitados em cada alerta.</p></div></div>
    <div id="rlbNotifMsg"></div>
    <div class="rlb-notif-provider-strip" id="rlbNotifProviderStrip"></div>
    <div class="rlb-notif-grid">
      <article class="card rlb-notif-contact-card"><div class="rlb-notif-card-head"><span class="rlb-notif-channel-icon email">${icon('mail')}</span><div><h3>E-mail de alertas</h3><p>Cadastre e confirme o endereço que receberá as oportunidades.</p></div><span class="rlb-notif-state" id="rlbEmailState">—</span></div><div class="rlb-notif-contact-form"><label>E-mail</label><div class="rlb-notif-inline"><input id="rlbNotifEmail" type="email" autocomplete="email" placeholder="voce@empresa.com.br"><button id="rlbEmailVerifyRequest" class="btn" type="button">Enviar código</button></div><div class="rlb-notif-code-row" id="rlbEmailCodeRow" hidden><input id="rlbEmailCode" inputmode="numeric" maxlength="6" placeholder="Código de 6 dígitos"><button id="rlbEmailVerifyConfirm" class="btn primary" type="button">Confirmar</button></div><div class="rlb-notif-card-actions"><label class="rlb-notif-switch"><input id="rlbEmailEnabled" type="checkbox"><span></span> Receber por e-mail</label><button id="rlbEmailTest" class="btn tiny" type="button">Enviar teste</button></div></div></article>
      <article class="card rlb-notif-contact-card"><div class="rlb-notif-card-head"><span class="rlb-notif-channel-icon whatsapp">${icon('whatsapp')}</span><div><h3>WhatsApp de alertas</h3><p>Cadastre o número com DDD, confirme e autorize o recebimento.</p></div><span class="rlb-notif-state" id="rlbWhatsappState">—</span></div><div class="rlb-notif-contact-form"><label>WhatsApp com DDD</label><div class="rlb-notif-inline"><input id="rlbNotifWhatsapp" type="tel" autocomplete="tel" placeholder="(84) 99999-9999"><button id="rlbWhatsappVerifyRequest" class="btn" type="button">Enviar código</button></div><div class="rlb-notif-code-row" id="rlbWhatsappCodeRow" hidden><input id="rlbWhatsappCode" inputmode="numeric" maxlength="6" placeholder="Código de 6 dígitos"><button id="rlbWhatsappVerifyConfirm" class="btn primary" type="button">Confirmar</button></div><div class="rlb-notif-card-actions"><label class="rlb-notif-switch"><input id="rlbWhatsappEnabled" type="checkbox"><span></span> Receber pelo WhatsApp</label><button id="rlbWhatsappTest" class="btn tiny" type="button">Enviar teste</button></div><p class="rlb-notif-consent">Ao confirmar, você autoriza mensagens exclusivamente relacionadas aos alertas configurados no Radar.</p></div></article>
    </div>
    <article class="card rlb-notif-rules-card"><div class="toolbar"><div><h2>Canais por alerta</h2><div class="sub">A notificação no Radar é obrigatória. E-mail e WhatsApp são adicionais e podem ser habilitados separadamente.</div></div><button id="rlbNotifRefreshRules" class="btn" type="button">${icon('refresh')} Atualizar</button></div><div id="rlbNotifRules" class="rlb-notif-rules"></div></article>
    <article class="card rlb-notif-history-card section-gap"><div class="toolbar"><div><h2>Histórico de notificações</h2><div class="sub">Cada licitação é registrada uma única vez por alerta e canal.</div></div><div class="actions"><button id="rlbNotifReadAll" class="btn" type="button">Marcar como lidas</button><button id="rlbNotifRefreshHistory" class="btn" type="button">${icon('refresh')} Atualizar</button></div></div><div id="rlbNotifHistory" class="rlb-notif-history"></div></article>`}

  function ensureView(){
    const app=$('#app');if(!app)return null;
    let view=$('#view-notifications');
    if(!view){view=document.createElement('section');view.id='view-notifications';view.className='hidden rlb-notifications-view';app.appendChild(view)}
    if(!view.dataset.rlbV3){view.innerHTML=markup();view.dataset.rlbV3='1'}
    return view;
  }

  function setBadge(n){for(const id of ['#rlbNotifBadge','#rlbMobileNotifBadge']){const b=$(id);if(!b)continue;b.textContent=String(n);b.hidden=n<=0}}

  function renderProviders(){
    const p=state.providers||{},box=$('#rlbNotifProviderStrip');if(!box)return;
    const email=Boolean(p.email?.configured),wa=Boolean(p.whatsapp?.configured),wav=Boolean(p.whatsapp?.verification_configured);
    box.innerHTML=`<div class="rlb-notif-provider ${email?'ok':'warn'}"><span>${icon('mail')}</span><div><b>E-mail • Resend</b><small>${email?'Servidor pronto para envio':'Canal ainda não conectado ao provedor'}</small></div></div><div class="rlb-notif-provider ${wa&&wav?'ok':'warn'}"><span>${icon('whatsapp')}</span><div><b>WhatsApp • Twilio</b><small>${wa?(wav?'Envio e verificação prontos':'Envio configurado; falta verificação por template'):'Canal ainda não conectado ao provedor'}</small></div></div><div class="rlb-notif-provider ok"><span>${icon('bell')}</span><div><b>Radar</b><small>Canal interno obrigatório e ativo</small></div></div>`;
  }

  function renderProfile(){
    const p=state.profile||{};renderProviders();
    const email=$('#rlbNotifEmail'),wa=$('#rlbNotifWhatsapp');if(email&&!email.matches(':focus'))email.value=p.email||'';if(wa&&!wa.matches(':focus'))wa.value=p.whatsapp_e164||'';
    if($('#rlbEmailEnabled'))$('#rlbEmailEnabled').checked=p.email_enabled!==false;
    if($('#rlbWhatsappEnabled'))$('#rlbWhatsappEnabled').checked=p.whatsapp_enabled!==false;
    const es=$('#rlbEmailState');if(es){es.textContent=p.email_verified?'Confirmado':'Não confirmado';es.className='rlb-notif-state '+(p.email_verified?'ok':'warn')}
    const ws=$('#rlbWhatsappState');if(ws){ws.textContent=p.whatsapp_verified?'Confirmado':'Não confirmado';ws.className='rlb-notif-state '+(p.whatsapp_verified?'ok':'warn')}
    if($('#rlbEmailTest'))$('#rlbEmailTest').disabled=!p.email_verified||!state.providers?.email?.configured;
    if($('#rlbWhatsappTest'))$('#rlbWhatsappTest').disabled=!p.whatsapp_verified||!state.providers?.whatsapp?.configured;
    setBadge(state.unread||0);
  }

  async function loadProfile(){const d=await api('/api/notifications/profile');state.profile=d.profile;state.providers=d.providers;state.unread=Number(d.unread_count||0);renderProfile()}
  function summary(a){const bits=[];if(a.keyword)bits.push(`Objeto: “${a.keyword}”`);bits.push(`UF: ${a.uf||'Todas'}`);if(a.municipality)bits.push(`Município: ${a.municipality}`);bits.push(`Modalidade: ${a.modality_code?(MODALITIES[a.modality_code]||('Código '+a.modality_code)):'Todas'}`);if(a.org_name)bits.push(`Órgão: ${a.org_name}`);return bits.join(' • ')}

  async function loadRules(){
    const box=$('#rlbNotifRules');if(!box)return;box.innerHTML='<div class="rlb-notif-loading">Carregando alertas...</div>';
    try{const d=await api('/api/notifications/alerts');const items=d.items||[];box.innerHTML=items.map(a=>`<div class="rlb-notif-rule" data-rule-id="${Number(a.id)}"><div class="rlb-notif-rule-main"><div class="rlb-notif-rule-title"><span class="rlb-notif-rule-dot ${a.enabled?'ok':'off'}"></span><div><b>${esc(a.name)}</b><small>${esc(summary(a))}</small></div></div><div class="rlb-notif-rule-region"><label>Macrorregião adicional</label><select data-rule-region><option value="ALL" ${a.region==='ALL'?'selected':''}>Sem restrição adicional</option><option value="NORTE" ${a.region==='NORTE'?'selected':''}>Norte</option><option value="NORDESTE" ${a.region==='NORDESTE'?'selected':''}>Nordeste</option><option value="CENTRO-OESTE" ${a.region==='CENTRO-OESTE'?'selected':''}>Centro-Oeste</option><option value="SUDESTE" ${a.region==='SUDESTE'?'selected':''}>Sudeste</option><option value="SUL" ${a.region==='SUL'?'selected':''}>Sul</option></select></div></div><div class="rlb-notif-rule-channels"><label title="Obrigatório"><input type="checkbox" checked disabled> <span>No Radar • obrigatório</span></label><label><input type="checkbox" data-rule-email ${a.email_enabled?'checked':''}> <span>E-mail</span></label><label><input type="checkbox" data-rule-whatsapp ${a.whatsapp_enabled?'checked':''}> <span>WhatsApp</span></label><button type="button" class="btn tiny primary" data-rule-save>Salvar canais</button></div></div>`).join('')||'<div class="empty">Você ainda não possui alertas salvos.</div>'}catch(e){box.innerHTML=`<div class="empty">${esc(e.message)}</div>`}
  }

  function groupDeliveries(items){const map=new Map();for(const x of items){const key=`${x.alert_id}:${x.pncp_id}`;if(!map.has(key))map.set(key,{...x,channels:[]});map.get(key).channels.push({channel:x.channel,status:x.status,error:x.error,sent_at:x.sent_at,read_at:x.read_at})}return [...map.values()]}
  async function loadHistory(){
    const box=$('#rlbNotifHistory');if(!box)return;box.innerHTML='<div class="rlb-notif-loading">Carregando notificações...</div>';
    try{const d=await api('/api/notifications/deliveries?limit=90');const groups=groupDeliveries(d.items||[]);box.innerHTML=groups.map(x=>{const p=x.payload||{},unread=x.channels.some(c=>c.channel==='onsite'&&!c.read_at);return `<article class="rlb-notif-event ${unread?'unread':''}"><div class="rlb-notif-event-mark"></div><div class="rlb-notif-event-body"><div class="rlb-notif-event-top"><span class="rlb-notif-event-alert">${esc(x.alert_name||p.alert_name||'Alerta')}</span><span>${esc(fmt(x.created_at))}</span></div><h3>${esc(p.object||'Oportunidade monitorada')}</h3><div class="rlb-notif-event-meta"><span>${esc(p.modality||'Modalidade não informada')}</span><span>${esc(p.org||'Órgão não informado')}</span><span>${esc([p.municipality,p.uf].filter(Boolean).join(' / ')||'Local não informado')}</span>${p.estimated_value!==null&&p.estimated_value!==undefined?`<span>${esc(money(p.estimated_value))}</span>`:''}</div><div class="rlb-notif-event-channels">${x.channels.map(c=>`<span class="rlb-delivery-chip ${esc(c.status)}" title="${esc(c.error||'')}">${esc(channelLabel(c.channel))}: ${esc(statusLabel(c.status))}</span>`).join('')}</div></div>${p.pncp_url?`<a class="btn tiny" href="${esc(p.pncp_url)}" target="_blank" rel="noopener">Abrir PNCP</a>`:''}</article>`}).join('')||'<div class="empty">Ainda não há notificações para esta conta.</div>'}catch(e){box.innerHTML=`<div class="empty">${esc(e.message)}</div>`}
  }

  async function loadAll(){if(!isAuth()||state.loading)return;state.loading=true;try{await Promise.allSettled([loadProfile(),loadRules(),loadHistory()])}finally{state.loading=false}}

  function openView(){
    if(!isAuth())return;
    ensureNav();ensureView();
    $$('section[id^="view-"]').forEach(s=>s.classList.add('hidden'));
    $('#view-notifications')?.classList.remove('hidden');
    $$('.nav [data-view]').forEach(b=>b.classList.toggle('active',b.id==='rlbNotificationsNav'));
    $('#view-notifications')?.scrollIntoView({block:'start'});
    loadAll();
  }

  async function requestVerification(channel){
    const input=channel==='email'?$('#rlbNotifEmail'):$('#rlbNotifWhatsapp');if(!input?.value.trim())return notice('Informe o contato antes de solicitar o código.','err');
    try{notice('Enviando código de confirmação...','info');const d=await api('/api/notifications/verify/request',{method:'POST',body:JSON.stringify({channel,destination:input.value.trim()})});(channel==='email'?$('#rlbEmailCodeRow'):$('#rlbWhatsappCodeRow')).hidden=false;notice(d.message||'Código enviado.','ok')}catch(e){notice(e.message,'err')}
  }
  async function confirmVerification(channel){
    const input=channel==='email'?$('#rlbEmailCode'):$('#rlbWhatsappCode');if(!/^\d{6}$/.test(input?.value||''))return notice('Informe o código de 6 dígitos.','err');
    try{const d=await api('/api/notifications/verify/confirm',{method:'POST',body:JSON.stringify({channel,code:input.value})});input.value='';(channel==='email'?$('#rlbEmailCodeRow'):$('#rlbWhatsappCodeRow')).hidden=true;notice(d.message,'ok');await loadProfile()}catch(e){notice(e.message,'err')}
  }
  async function saveGlobal(){try{const d=await api('/api/notifications/profile',{method:'PUT',body:JSON.stringify({email_enabled:$('#rlbEmailEnabled')?.checked===true,whatsapp_enabled:$('#rlbWhatsappEnabled')?.checked===true})});state.profile=d.profile;state.providers=d.providers;state.unread=Number(d.unread_count||0);renderProfile();notice('Preferências atualizadas.','ok')}catch(e){notice(e.message,'err')}}
  async function sendTest(channel){try{notice(`Enviando teste por ${channelLabel(channel)}...`,'info');await api('/api/notifications/test',{method:'POST',body:JSON.stringify({channel})});notice(`Teste enviado por ${channelLabel(channel)}.`,'ok')}catch(e){notice(e.message,'err')}}
  async function saveRule(row){const id=row?.dataset.ruleId;if(!id)return;const btn=$('[data-rule-save]',row);if(btn)btn.disabled=true;try{await api('/api/notifications/alerts/'+id,{method:'PUT',body:JSON.stringify({region:$('[data-rule-region]',row)?.value||'ALL',onsite_enabled:true,email_enabled:$('[data-rule-email]',row)?.checked===true,whatsapp_enabled:$('[data-rule-whatsapp]',row)?.checked===true})});notice('Canais do alerta atualizados.','ok')}catch(e){notice(e.message,'err')}finally{if(btn)btn.disabled=false}}

  function routeClick(e){
    const nav=e.target.closest('#rlbNotificationsNav,#rlbQuickNotifications,[data-mobile-notifications]');
    if(nav){e.preventDefault();e.stopImmediatePropagation();openView();return}
    const b=e.target.closest('#rlbEmailVerifyRequest,#rlbWhatsappVerifyRequest,#rlbEmailVerifyConfirm,#rlbWhatsappVerifyConfirm,#rlbEmailTest,#rlbWhatsappTest,#rlbNotifRefreshRules,#rlbNotifRefreshHistory,#rlbNotifReadAll,[data-rule-save]');
    if(!b)return;
    e.preventDefault();
    if(b.id==='rlbEmailVerifyRequest')return requestVerification('email');
    if(b.id==='rlbWhatsappVerifyRequest')return requestVerification('whatsapp');
    if(b.id==='rlbEmailVerifyConfirm')return confirmVerification('email');
    if(b.id==='rlbWhatsappVerifyConfirm')return confirmVerification('whatsapp');
    if(b.id==='rlbEmailTest')return sendTest('email');
    if(b.id==='rlbWhatsappTest')return sendTest('whatsapp');
    if(b.id==='rlbNotifRefreshRules')return loadRules();
    if(b.id==='rlbNotifRefreshHistory')return loadHistory();
    if(b.id==='rlbNotifReadAll')return api('/api/notifications/read-all',{method:'POST',body:'{}'}).then(()=>{state.unread=0;setBadge(0);return loadHistory()}).catch(x=>notice(x.message,'err'));
    if(b.matches('[data-rule-save]'))return saveRule(b.closest('.rlb-notif-rule'));
  }

  function ensureAlertHint(){const view=$('#view-alerts');if(!view||$('#rlbNotifAlertHint'))return;const hint=document.createElement('div');hint.id='rlbNotifAlertHint';hint.className='rlb-notif-alert-hint';hint.innerHTML=`<span>${icon('send')}</span><div><b>Alertas multicanal</b><p>O Radar registra primeiro. E-mail e WhatsApp seguem depois, conforme seus contatos e canais habilitados.</p></div><button class="btn tiny primary" type="button" data-open-notifications>Cadastrar contatos</button>`;hint.querySelector('button').addEventListener('click',openView);view.prepend(hint)}

  function install(){
    upgradeAlertFilters();ensureNav();ensureView();ensureAlertHint();
    document.addEventListener('click',routeClick,true);
    document.addEventListener('change',e=>{if(e.target?.id==='rlbEmailEnabled'||e.target?.id==='rlbWhatsappEnabled')saveGlobal()});
    window.RLBNotificationsOpen=openView;
    [100,300,700,1500,3000,6000].forEach(ms=>setTimeout(()=>{ensureNav();ensureView();ensureAlertHint();if(isAuth()&&ms>=700)loadProfile().catch(()=>{})},ms));
    $('#authBtn')?.addEventListener('click',()=>[300,900,1800].forEach(ms=>setTimeout(()=>{ensureNav();if(isAuth())loadProfile().catch(()=>{})},ms)));
    window.addEventListener('pageshow',()=>{ensureNav();if(isAuth())loadProfile().catch(()=>{})});
    window.addEventListener('focus',()=>{ensureNav();if(isAuth())loadProfile().catch(()=>{})});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
