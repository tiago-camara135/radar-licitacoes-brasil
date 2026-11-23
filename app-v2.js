(()=>{
'use strict';
const $=(s,r=document)=>r.querySelector(s);const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const state={user:null,mode:'login',view:'radar',live:[],timer:null,sse:null,livePromise:null};
const UFS=['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const MOD=[['1','Leilão - Eletrônico'],['2','Diálogo Competitivo'],['3','Concurso'],['4','Concorrência - Eletrônica'],['5','Concorrência - Presencial'],['6','Pregão - Eletrônico'],['7','Pregão - Presencial'],['8','Dispensa de Licitação'],['9','Inexigibilidade'],['10','Manifestação de Interesse'],['11','Pré-qualificação'],['12','Credenciamento'],['13','Leilão - Presencial'],['14','Inaplicabilidade da Lei 14.133/2021']];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const time=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})};
const when=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})};
const brl=v=>{const n=Number(v);return Number.isFinite(n)?n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'Valor não informado'};
const org=x=>x?.orgaoEntidade?.razaoSocial||'Órgão não informado';const mun=x=>x?.unidadeOrgao?.municipioNome||x?.unidadeOrgao?.nomeMunicipio||x?.municipioNome||'Município não informado';const uf=x=>x?.unidadeOrgao?.ufSigla||x?.ufSigla||'';const mod=x=>x?.modalidadeNome||MOD.find(m=>Number(m[0])===Number(x?._modalidadeConsultada||x?.modalidadeId))?.[1]||'Modalidade não informada';
function pncp(x){if(x?._pncpUrl)return x._pncpUrl;const c=String(x?.orgaoEntidade?.cnpj||'').replace(/\D/g,''),y=Number(x?.anoCompra),s=Number(x?.sequencialCompra);return c.length===14&&Number.isInteger(y)&&Number.isInteger(s)?`https://pncp.gov.br/app/editais/${c}/${y}/${s}`:'#'}
function toast(msg,error=false){const e=$('#toast');if(!e)return;e.textContent=msg;e.className='toast show'+(error?' error':'');clearTimeout(toast.t);toast.t=setTimeout(()=>e.className='toast',3000)}
async function api(path,opt={}){const {timeoutMs=15000,signal,...request}=opt,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs),relay=()=>controller.abort();if(signal){if(signal.aborted)controller.abort();else signal.addEventListener('abort',relay,{once:true})}try{const r=await fetch(path,{credentials:'same-origin',cache:'no-store',...request,signal:controller.signal,headers:{accept:'application/json',...(request.body?{'content-type':'application/json'}:{}),...(request.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(d.error||`Erro ${r.status}`),{status:r.status,data:d});return d}catch(e){if(controller.signal.aborted&&!signal?.aborted)throw Object.assign(new Error('A solicitação demorou mais que o esperado. Tente novamente.'),{code:'request_timeout'});throw e}finally{clearTimeout(timer);signal?.removeEventListener('abort',relay)}}
function fillSelects(){for(const id of ['searchUf','alertUf']){const e=$('#'+id);if(e&&!e.dataset.ready){UFS.forEach(v=>e.insertAdjacentHTML('beforeend',`<option value="${v}">${v}</option>`));e.dataset.ready='1'}}for(const id of ['searchModality','alertModality']){const e=$('#'+id);if(e&&!e.dataset.ready){MOD.forEach(([v,n])=>e.insertAdjacentHTML('beforeend',`<option value="${v}">${esc(n)}</option>`));e.dataset.ready='1'}}}
function initTheme() {
  const buttons = $$('#radarTheme, #radarPublicTheme');
  const systemTheme = matchMedia('(prefers-color-scheme: dark)');
  let preference;
  try { preference = localStorage.getItem('rlb-theme-v2'); } catch {}
  const render = () => {
    const dark = preference === 'dark' || (preference !== 'light' && systemTheme.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const label = dark ? 'Ativar tema claro' : 'Ativar tema escuro';
    buttons.forEach(button => {
      button.setAttribute('aria-label', label);
      button.title = label;
      $('[data-theme-sun]', button).toggleAttribute('hidden', !dark);
      $('[data-theme-moon]', button).toggleAttribute('hidden', dark);
    });
  };
  const toggleTheme = () => {
    preference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('rlb-theme-v2', preference); } catch {}
    render();
  };
  buttons.forEach(button => button.addEventListener('click', toggleTheme));
  systemTheme.addEventListener('change', render);
  render();
}

function renderRadarAccount(user) {
  const email = String(user.email || '');
  const name = String(user.name || user.display_name || email.split('@')[0] || 'Usuário')
    .replace(/[._-]+/g, ' ').trim() || 'Usuário';
  $('#radarUserName').textContent = name.replace(/(^|\s)\p{L}/gu, letter => letter.toLocaleUpperCase('pt-BR'));
  $('#radarAvatar').textContent = name.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  $('#radarUserRole').textContent = user.role === 'admin' ? 'Administrador' : 'Usuário';
  $('#userPill').textContent = email;
}

function setRadarMenu(open) {
  $('#radarMenuToggle').setAttribute('aria-expanded', String(open));
  $('.sidebar-inner').classList.toggle('radar-menu-open', open);
}

function bindRadarMenu() {
  const toggle = $('#radarMenuToggle');
  toggle.addEventListener('click', () => setRadarMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  $('#mainNav').addEventListener('click', event => {
    if (event.target.closest('[data-view]') && toggle.offsetWidth && toggle.getAttribute('aria-expanded') === 'true') {
      queueMicrotask(() => $('#pageTitle').focus());
    }
  });
  $('.sidebar').addEventListener('keydown', event => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setRadarMenu(false);
      toggle.focus();
    }
  });
}
function authMode(mode){state.mode=mode;const login=mode==='login';$('#tabLogin')?.classList.toggle('active',login);$('#tabRegister')?.classList.toggle('active',!login);$('#tabLogin')?.setAttribute('aria-selected',String(login));$('#tabRegister')?.setAttribute('aria-selected',String(!login));if($('#authSubmit'))$('#authSubmit').textContent=login?'Entrar':'Criar conta';if($('#authPassword'))$('#authPassword').autocomplete=login?'current-password':'new-password';if($('#authMessage'))$('#authMessage').textContent=''}
async function submitAuth(e){e?.preventDefault();const email=$('#authEmail')?.value.trim()||'',password=$('#authPassword')?.value||'',button=$('#authSubmit'),msg=$('#authMessage');if(!email||password.length<10){if(msg)msg.textContent='Informe um e-mail válido e uma senha com pelo menos 10 caracteres.';return}if(button)button.disabled=true;try{const d=await api(state.mode==='login'?'/api/auth/login':'/api/auth/register',{method:'POST',body:JSON.stringify({email,password})});await enter(d.user)}catch(err){if(msg)msg.textContent=err.message}finally{if(button)button.disabled=false}}
async function checkSession(){try{const d=await api('/api/me');if(d.user)await enter(d.user);else throw new Error()}catch{$('#authScreen')?.classList.remove('hidden');$('#appShell')?.classList.add('hidden')}}
async function enter(user){state.user=user;$('#authScreen')?.classList.add('hidden');$('#appShell')?.classList.remove('hidden');renderRadarAccount(user);$('#adminNav')?.classList.toggle('hidden',user.role!=='admin');show('radar');startLive();startRadarDashboard()}
async function logout(){try{await api('/api/auth/logout',{method:'POST',body:'{}'})}catch{}location.reload()}
const titles={radar:['Radar de Licitações',''],saved:['Oportunidades salvas',''], 'saved-searches':['Buscas salvas',''],alerts:['Alertas','Critérios e canais de notificação'],documents:['Documentos','Acervo pessoal'],ai:['IA RLB','Assistente para licitações'],admin:['Administração','Gestão da plataforma']};
function show(v){state.view=v;setRadarMenu(false);$$('.view').forEach(x=>x.classList.remove('active'));$('#view-'+v)?.classList.add('active');$$('#mainNav [data-view]').forEach(x=>{const active=x.dataset.view===v;x.classList.toggle('active',active);if(active)x.setAttribute('aria-current','page');else x.removeAttribute('aria-current')});if($('#pageTitle'))$('#pageTitle').textContent=titles[v]?.[0]||'';if($('#pageSubtitle'))$('#pageSubtitle').textContent=titles[v]?.[1]||'';if(v==='saved'){renderSavedTenders();loadDashboardSaved('tender')}if(v==='saved-searches'){renderSavedSearches();loadDashboardSaved('search')}if(v==='alerts')loadAlertsPage();if(v==='documents')loadDocuments();if(v==='ai')loadAiStatus();if(v==='admin')loadAdmin()}
function isMunicipal(x){return norm(x?.orgaoEntidade?.esferaId)==='M'||/MUNICIPIO|MUNICIPAL|PREFEITURA|CAMARA MUNICIPAL|FUNDO MUNICIPAL|SECRETARIA MUNICIPAL/.test(norm(org(x)+' '+(x?.unidadeOrgao?.nomeUnidade||'')))}
function isChamber(x){return (norm(x?.orgaoEntidade?.poderId)==='L'&&norm(x?.orgaoEntidade?.esferaId)==='M')||/CAMARA MUNICIPAL|CAMARA DE VEREADORES|LEGISLATIVO MUNICIPAL/.test(norm(org(x)+' '+(x?.unidadeOrgao?.nomeUnidade||'')))}
function renderLive() {
  let items = [...state.live];
  const scope = $('#liveScope')?.value || 'all';
  if (scope === 'municipal') items = items.filter(isMunicipal);
  if (scope === 'chambers') items = items.filter(isChamber);
  const root = $('#liveList');
  if (!root) return;

  root.innerHTML = items.slice(0, 30).map(item => {
    const href = pncp(item);
    const location = mun(item) + (uf(item) ? ' / ' + uf(item) : '');
    const title = item?.objetoCompra || 'Objeto não informado';
    return `<article class="live-item">
      <div>
        <div class="item-tags"><span class="tag">${esc(mod(item))}</span><span class="tag green">${esc(location)}</span></div>
        <div class="item-title">${esc(title)}</div>
        <div class="item-meta">${esc(org(item))} • detectada ${esc(when(item?._detectedAt || item?.dataPublicacaoPncp))}</div>
      </div>
      <a class="item-open" href="${esc(href)}" target="_blank" rel="noopener" aria-label="Abrir no PNCP: ${esc(title)}">Abrir ↗</a>
    </article>`;
  }).join('') || '<div class="empty-state">Nenhuma oportunidade neste filtro.</div>';
}
async function refreshLive(){if(state.livePromise)return state.livePromise;const task=(async()=>{try{const d=await api('/api/live-feed?limit=40',{timeoutMs:12000});state.live=d.items||[];renderLive();const s=d.status||{};if($('#metricStored'))$('#metricStored').textContent=Number(s.total_stored||0).toLocaleString('pt-BR');if($('#metricNew'))$('#metricNew').textContent=Number(s.last_new_count||0).toLocaleString('pt-BR');if($('#metricLast'))$('#metricLast').textContent=time(s.last_success_at);$('#statusDot')?.classList.toggle('ok',!s.consecutive_failures);if($('#monitorStatusText'))$('#monitorStatusText').textContent=s.running?'Varredura em andamento':`PNCP • ${s.live?.modalities_per_cycle||14} modalidades • ${s.interval_seconds||90}s`;if($('#liveMeta'))$('#liveMeta').textContent=`Atualização por eventos • varredura ${time(s.last_success_at)} • tela ${time(d.fetched_at)} • ${Number(s.total_stored||0).toLocaleString('pt-BR')} registros`}catch(e){if($('#liveMeta'))$('#liveMeta').textContent=e.code==='request_timeout'?'A atualização demorou mais que o esperado. Tentaremos novamente.':'Falha temporária ao sincronizar o feed.'}})();state.livePromise=task;try{return await task}finally{if(state.livePromise===task)state.livePromise=null}}
function startLive(){clearInterval(state.timer);state.timer=null;try{state.sse?.close()}catch{}state.sse=null;refreshLive();try{state.sse=new EventSource('/api/live-events');const sync=()=>{if(state.view==='radar')refreshLive()};state.sse.addEventListener('procurement',sync);state.sse.addEventListener('status',sync);state.timer=setInterval(()=>{if(!state.sse||state.sse.readyState!==EventSource.OPEN)refreshLive()},90000)}catch{state.sse=null;state.timer=setInterval(refreshLive,90000)}}
const dashboard = {
  search: null, items: [], page: 0, listScroll: 0, selected: '', savedSelected: '',
  saved: new Map(), searches: new Map(), documents: new Map(),
  pendingSave: new Set(), savedLoads: new Map()
};
const dashboardPageSize = 8;
const radarIds = ['searchKeyword', 'radarMunicipality', 'searchModality', 'searchDays', 'radarClosingDays', 'radarOrder', 'radarOrganization'];
const radarParams = ['keyword', 'municipality', 'modalidade', 'days', 'closingDays', 'order', 'org'];

function dashboardUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

function selectedRadarStates() {
  return $$('#radarStates input:checked').map(input => input.value);
}

function dashboardQuery() {
  const params = new URLSearchParams();
  radarIds.forEach((id, index) => {
    const value = $('#' + id).value.trim();
    if (value) params.set(radarParams[index], value);
  });
  const states = selectedRadarStates();
  if (states.length) params.set('states', states.join(','));
  return params;
}

function applyDashboardQuery(query) {
  const params = new URLSearchParams(query);
  radarIds.forEach((id, index) => {
    const control = $('#' + id);
    control.value = params.get(radarParams[index]) || control.options?.[0]?.value || '';
    if (control.tagName === 'SELECT' && control.selectedIndex < 0) control.selectedIndex = 0;
  });
  const states = (params.get('states') || '').split(',');
  $$('#radarStates input').forEach(input => { input.checked = states.includes(input.value); });
  renderDashboardChips();
}

function dashboardChip(label, key) {
  return `<button type="button" class="radar-chip" data-radar-chip="${esc(key)}" aria-label="Remover filtro ${esc(label)}">${esc(label)} <span aria-hidden="true">×</span></button>`;
}

function renderDashboardChips() {
  const states = selectedRadarStates();
  $('#radarStateSummary').textContent = states.length > 3 ? `${states.length} estados` : states.join(', ') || 'Todo o Brasil';
  const chips = states.map(uf => dashboardChip(uf, uf));
  for (const id of ['radarMunicipality', 'searchModality', 'searchDays', 'radarClosingDays', 'radarOrganization']) {
    const input = $('#' + id);
    const value = input.value.trim();
    if (value && !(input.tagName === 'SELECT' && value === '0')) chips.push(dashboardChip(input.selectedOptions?.[0]?.text || value, id));
  }
  $('#radarFiltersToggle').textContent = chips.length ? `Filtros (${chips.length})` : 'Filtros';
  if (!chips.length) chips.push('<span class="radar-chip radar-chip-static">Prazos vigentes</span>');
  $('#radarChips').innerHTML = chips.join('');
}

function radarItem(item) {
  const official = dashboardUrl(pncp(item));
  const path = official && new URL(official).hostname === 'pncp.gov.br' ? new URL(official).pathname : '';
  const ids = path.match(/^\/app\/editais\/(\d{14})\/(\d{4})\/([1-9]\d{0,8})\/?$/);
  const key = ids ? ids.slice(1).join('-') : String(item.numeroControlePNCP || '');
  const closing = item.dataEncerramentoProposta || item.dataFimRecebimentoProposta || '';
  return {
    key, title: item.objetoCompra || 'Objeto não informado', org: org(item), modality: mod(item),
    place: [mun(item), uf(item)].filter(Boolean).join('/'), number: item.numeroCompra && item.anoCompra ? [item.numeroCompra, item.anoCompra].join('/') : item.numeroCompra || item.numeroControlePNCP || '',
    published: item.dataPublicacaoPncp || '', opening: item.dataAberturaProposta || item.dataInicioRecebimentoProposta || '', closing,
    status: item.situacaoCompraNome || (closing ? 'Prazo informado pelo PNCP' : 'Situação não informada'),
    value: item.valorTotalEstimado == null ? '' : brl(item.valorTotalEstimado),
    official, origin: dashboardUrl(item._originUrl || item.linkSistemaOrigem || item.linkProcessoEletronico)
  };
}

function deadlineLabel(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const now = new Date();
  if (date < now) return 'Prazo encerrado';
  if (date.toDateString() === now.toDateString()) return 'Encerra hoje';
  now.setDate(now.getDate() + 1);
  return date.toDateString() === now.toDateString() ? 'Encerra amanhã' : '';
}

function dashboardRows(items, selected) {
  if (!items.length) return '<p class="radar-message">Nenhuma oportunidade encontrada.</p>';
  return `<table class="radar-table">
    <thead><tr><th scope="col">Objeto</th><th scope="col">Município/UF</th><th scope="col">Prazo</th></tr></thead>
    <tbody>${items.map(item => {
      const deadline = deadlineLabel(item.closing);
      return `<tr class="${item.key === selected ? 'radar-selected' : ''}">
      <td><button type="button" data-radar-select="${esc(item.key)}" aria-pressed="${item.key === selected}">${esc(item.title)}</button>
        <small>${esc(item.modality)} · ${esc(item.org)}</small></td>
      <td>${esc(item.place)}</td><td><span class="radar-mobile-label">Prazo </span>${esc(when(item.closing))}${deadline ? `<small class="radar-deadline">${deadline}</small>` : ''}</td>
    </tr>`;
    }).join('')}</tbody></table>`;
}

const radarCompact = matchMedia('(max-width: 760px)');
const opportunityIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6"/></svg>';

function resultRows() {
  const total = dashboard.items.length;
  if (!total) {
    $('#radarResults').innerHTML = '<p class="radar-message">Nenhuma oportunidade encontrada.</p>';
    return;
  }
  const start = dashboard.page * dashboardPageSize;
  const end = Math.min(start + dashboardPageSize, total);
  $('#radarResults').innerHTML = `<ul class="radar-opportunity-list">${dashboard.items.slice(start, end).map(item => {
    const selected = item.key === dashboard.selected;
    const deadline = deadlineLabel(item.closing);
    return `<li><button type="button" class="radar-opportunity${selected ? ' radar-selected' : ''}" data-radar-select="${esc(item.key)}" aria-pressed="${selected}">
      <span class="radar-opportunity-icon">${opportunityIcon}</span>
      <span class="radar-opportunity-copy"><strong>${esc(item.title)}</strong>
        <small>${esc(item.place)} <span class="radar-opportunity-org">· ${esc(item.org)}</span></small></span>
      <span class="radar-opportunity-deadline"><span class="radar-mobile-label">Encerra: </span>${esc(when(item.closing))}${deadline ? `<small>${deadline}</small>` : ''}</span>
      <span class="radar-opportunity-chevron" aria-hidden="true">›</span>
    </button></li>`;
  }).join('')}</ul>
  <nav class="radar-pagination" aria-label="Paginação de oportunidades">
    <span role="status">${start + 1}–${end} de ${total.toLocaleString('pt-BR')}</span>
    <button type="button" class="radar-button" data-radar-page="-1" ${start === 0 ? 'disabled' : ''}>‹ Anterior</button>
    <button type="button" class="radar-primary" data-radar-page="1" ${end === total ? 'disabled' : ''}>Próxima ›</button>
  </nav>`;
}

function selectRadarResult(index, showDetail, moveFocus = false) {
  const item = dashboard.items[index];
  if (!item) return;
  if (showDetail && radarCompact.matches && !$('#view-radar').classList.contains('radar-detail-open')) {
    dashboard.listScroll = window.scrollY;
    $('#view-radar').classList.add('radar-detail-open');
  }
  const page = Math.floor(index / dashboardPageSize);
  const samePage = page === dashboard.page && $('#radarResults [data-radar-select]');
  dashboard.page = page;
  dashboard.selected = item.key;
  if (!samePage) resultRows();
  else $$('#radarResults [data-radar-select]').forEach(button => {
    const selected = button.dataset.radarSelect === item.key;
    button.classList.toggle('radar-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const panel = $('#radarDetail');
  renderRadarDetail(panel, item, index);
  if (showDetail && (radarCompact.matches || moveFocus)) {
    panel.scrollTop = 0;
    $('h2', panel)?.focus({ preventScroll: true });
    if (radarCompact.matches) window.scrollTo({ top: 0, behavior: 'instant' });
  } else if (!showDetail) {
    $('#radarResultsTitle').focus({ preventScroll: true });
    $('#radarListPanel').scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }
}

function closeRadarResult() {
  $('#view-radar').classList.remove('radar-detail-open');
  $('#radarResults [aria-pressed="true"]')?.focus({ preventScroll: true });
  window.scrollTo({ top: dashboard.listScroll, behavior: 'instant' });
}

function radarBusy(isBusy) {
  const button = $('#radarSearchForm [type="submit"]');
  button.textContent = isBusy ? 'Buscando…' : 'Buscar';
  $('#radarResults').setAttribute('aria-busy', String(isBusy));
}

async function runDashboardSearch(query = dashboardQuery()) {
  const controller = new AbortController();
  dashboard.search?.abort();
  dashboard.search = controller;
  query.set('workspace', '1');
  $('#view-radar').classList.remove('radar-detail-open');
  radarBusy(true);
  renderDashboardChips();
  $('#radarSearchMeta').textContent = 'Consultando a base sincronizada do Radar…';
  $('#radarResults').replaceChildren();
  $('#radarDetail').innerHTML = '<p class="radar-message">Aguardando resultados.</p>';
  try {
    const response = await api('/api/licitacoes?' + query, { signal: controller.signal, timeoutMs: 20000 });
    if (controller.signal.aborted) return;
    dashboard.items = (response.items || []).map(radarItem);
    dashboard.page = 0;
    dashboard.selected = dashboard.items[0]?.key || '';
    const count = dashboard.items.length.toLocaleString('pt-BR');
    $('#radarSearchMeta').textContent = `${count} ${dashboard.items.length === 1 ? 'oportunidade' : 'oportunidades'} · PNCP${response.partial ? ' · consulta parcial' : ''}`;
    resultRows();
    renderRadarDetail($('#radarDetail'), dashboard.items[0], 0);
  } catch (error) {
    if (controller.signal.aborted) return;
    $('#radarSearchMeta').textContent = error.message;
    $('#radarResults').innerHTML = '<button type="button" class="radar-button radar-more" id="radarRetry">Tentar novamente</button>';
    renderRadarDetail($('#radarDetail'));
  } finally {
    if (dashboard.search === controller) radarBusy(false);
  }
}

function externalRadarLink(url, label, className = 'radar-button') {
  const href = dashboardUrl(url);
  return href ? `<a class="${className}" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)} <span aria-hidden="true">↗</span></a>` : '';
}

const radarDownloadIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 15v5h14v-5"/></svg>';
const radarOpenIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 4h7v7m0-7-9 9m7-1v8H4V6h8"/></svg>';
const radarBookmarkIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v16l-6-4-6 4z"/></svg>';

function radarSaveLabel(saved) {
  return radarBookmarkIcon + (saved ? 'Remover dos salvos' : 'Salvar');
}

function radarDocumentRow(doc, group, ids) {
  const url = dashboardUrl(doc.url);
  if (!url) return '';
  const pdf = /\.pdf(?:$|[?#])/i.test(doc.url) || /\.pdf$/i.test(doc.title);
  const type = pdf ? 'PDF' : (doc.title.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toUpperCase() || 'ARQ');
  const official = doc.source === 'PNCP' && /^\d{1,10}$/.test(String(doc.id)) && Number(doc.id) > 0;
  const download = official ? `/api/radar/documents/${ids.slice(1).join('/')}/${doc.id}/download?${new URLSearchParams({name:doc.title})}` : url;
  return `<li class="radar-file">
    <span class="radar-file-icon${pdf ? ' radar-file-pdf' : ''}" aria-hidden="true"><svg viewBox="0 0 28 32"><path d="M4 0h13l11 11v17a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4Z"/><path d="M17 0v8a3 3 0 0 0 3 3h8" class="radar-file-fold"/></svg><b>${type}</b></span>
    <div class="radar-file-copy"><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(doc.title)}</a>${group === 'Retificações' ? ' <span class="radar-correction">Retificação</span>' : ''}
      <small>${esc([doc.type, doc.source, doc.publishedAt && when(doc.publishedAt)].filter(Boolean).join(' · '))}</small></div>
    <a class="radar-file-download" href="${esc(download)}" target="_blank" rel="noopener noreferrer"
      title="${official ? 'Baixar arquivo' : 'Abrir arquivo na fonte'}" aria-label="${esc((official ? 'Baixar ' : 'Abrir na fonte ') + doc.title)}">${radarDownloadIcon}</a>
    </li>`;
}

function renderRadarDetail(panel, item, index = -1) {
  if (!item) {
    panel.innerHTML = '<p class="radar-message">Selecione uma oportunidade para consultar os detalhes e documentos.</p>';
    return;
  }
  const saved = dashboard.saved.has(item.key);
  const calendar = 'M4 6h16v14H4zM4 10h16M8 3v5m8-5v5';
  const rows = [
    ['Órgão', item.org,'M3 9 12 4l9 5H3zM5 11v7m7-7v7m7-7v7M3 20h18'],
    ['Local', item.place,'M19 10c0 5-7 10-7 10s-7-5-7-10a7 7 0 1 1 14 0zM12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
    ['Modalidade', item.modality,'m8 4 7 7-4 4-7-7zM13 13l6 6M4 20h8'],
    ['Nº do edital', item.number,'M9 4 6 20M17 4l-3 16M4 9h16M3 15h16'],
    ['Abertura', item.opening && when(item.opening),calendar],
    ['Encerramento', item.closing && when(item.closing),calendar],
    ['Situação', Date.parse(item.closing) < Date.now() ? 'Prazo encerrado' : item.status,'M5 12l4 4L19 6'],
    ['Valor estimado', item.value,'M12 3v18m5-14H9a3 3 0 0 0 0 6h6a3 3 0 0 1 0 6H7']
  ];
  panel.innerHTML = `<article class="result-item radar-detail-card" data-radar-key="${esc(item.key)}">
    <button type="button" class="radar-button radar-back" data-radar-back><span aria-hidden="true">‹</span> Voltar à lista</button>
    <h2 tabindex="-1"${item.title.length > 105 ? ' class="radar-title-clamp"' : ''}>${esc(item.title)}</h2>
    ${item.title.length > 105 ? '<button type="button" class="radar-title-toggle" data-radar-title-toggle aria-expanded="false">Ver objeto completo</button>' : ''}
    <div class="radar-actions radar-detail-actions">
      ${dashboardUrl(item.official) ? `<a class="radar-primary radar-official" href="${esc(dashboardUrl(item.official))}" target="_blank" rel="noopener noreferrer">${radarOpenIcon}Ver edital</a>` : ''}
      ${/^[\w-]{1,100}$/.test(item.key) ? `<button type="button" data-radar-save class="radar-button" aria-pressed="${saved}">${radarSaveLabel(saved)}</button>` : ''}
      ${item.origin !== item.official ? externalRadarLink(item.origin, 'Portal de origem') : ''}
    </div>
    <dl>${rows.filter(([, value])=>value).map(([label,value,icon])=>`<div><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icon}"/></svg><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>
    <div class="radar-analysis-actions" role="group" aria-label="Análises da oportunidade"></div>
    <h3>${opportunityIcon} Documentos</h3><div class="radar-documents" aria-live="polite"></div>
    ${index >= 0 ? `<nav class="radar-detail-navigation" aria-label="Navegação entre oportunidades">
      <button type="button" class="radar-button" data-radar-step="-1" ${index === 0 ? 'disabled' : ''}>‹ Oportunidade anterior</button>
      <button type="button" class="radar-button" data-radar-step="1" ${index + 1 === dashboard.items.length ? 'disabled' : ''}>Próxima oportunidade ›</button>
    </nav>` : ''}
  </article>`;
  loadRadarDocuments(panel.querySelector('.radar-documents'), item);
}

async function loadRadarDocuments(root, item) {
  const ids = item.key.match(/^(\d{14})-(\d{4})-([1-9]\d{0,8})$/);
  if (!ids) {
    root.textContent = 'Consulte os arquivos na publicação oficial.';
    return;
  }
  root.textContent = 'Consultando documentos…';
  let pending = dashboard.documents.get(item.key);
  if (!pending) {
    pending = api('/api/radar/documents/' + ids.slice(1).join('/'), { timeoutMs: 24000 });
    if (dashboard.documents.size >= 60) dashboard.documents.delete(dashboard.documents.keys().next().value);
    dashboard.documents.set(item.key, pending);
    setTimeout(() => {
      if (dashboard.documents.get(item.key) === pending) dashboard.documents.delete(item.key);
    }, 120000);
  }
  try {
    const response = await pending;
    if (!root.isConnected) return;
    const groups = new Map([['Retificações', []], ['Edital e termo de referência', []], ['Anexos e outros documentos', []]]);
    for (const doc of response.items || []) {
      const description = norm(doc.title + ' ' + doc.type).replaceAll('_', ' ');
      const group = /RETIFICA|ERRATA|ADENDO/.test(description) ? 'Retificações' :
        /EDITAL|INSTRUMENTO CONVOCATORIO|TERMO DE REFERENCIA/.test(description) ? 'Edital e termo de referência' : 'Anexos e outros documentos';
      groups.get(group).push(doc);
    }
    root.innerHTML = [...groups].filter(([, docs]) => docs.length).map(([group, docs]) =>
      `<section class="radar-document-group"><h4>${group}</h4><ul>${docs.map(doc => radarDocumentRow(doc, group, ids)).join('')}</ul></section>`).join('') || '<p>Nenhum arquivo listado. Consulte a publicação oficial.</p>';
  } catch (error) {
    if (dashboard.documents.get(item.key) === pending) dashboard.documents.delete(item.key);
    if (root.isConnected) root.innerHTML = `<p>${esc(error.message)}</p><button type="button" class="radar-button" data-radar-doc-retry>Tentar novamente</button>`;
  }
}

function renderSavedTenders() {
  const items = [...dashboard.saved.values()];
  if (!dashboard.saved.has(dashboard.savedSelected)) dashboard.savedSelected = items[0]?.key || '';
  $('#radarSavedList').innerHTML = items.length ? dashboardRows(items, dashboard.savedSelected) : '<p class="radar-message">Você ainda não salvou oportunidades.</p>';
  renderRadarDetail($('#radarSavedDetail'), dashboard.saved.get(dashboard.savedSelected));
}

function renderSavedSearches() {
  $('#radarSavedSearchList').innerHTML = dashboard.searches.size ? `<ul class="radar-saved-search-list">${[...dashboard.searches].map(([key, search]) => `
    <li><strong>${esc(search.name)}</strong><div class="radar-actions">
    <button type="button" class="radar-primary" data-radar-open-search="${esc(key)}">Executar busca</button>
    <button type="button" class="radar-button" data-radar-delete-search="${esc(key)}">Remover</button></div></li>`).join('')}</ul>` :
    '<p class="radar-message">Salve uma combinação de filtros no Radar para repetir a busca aqui.</p>';
}

function loadDashboardSaved(kind) {
  const pending = dashboard.savedLoads.get(kind);
  if (pending) return pending;
  const request = refreshDashboardSaved(kind).finally(() => dashboard.savedLoads.delete(kind));
  dashboard.savedLoads.set(kind, request);
  return request;
}

async function refreshDashboardSaved(kind) {
  const root = $(kind === 'tender' ? '#radarSavedList' : '#radarSavedSearchList');
  try {
    const response = await api('/api/radar/saved/' + kind);
    if (kind === 'tender') {
      dashboard.saved = new Map(response.items.map(({key,payload}) => [key, {...payload,key}]));
      $('#radarSavedCount').textContent = dashboard.saved.size.toLocaleString('pt-BR');
      if (state.view === 'saved') renderSavedTenders();
      const button = $('#radarDetail [data-radar-save]');
      if (button) updateSaveButton(button, dashboard.saved.has(dashboard.selected));
    } else {
      dashboard.searches = new Map(response.items.map(({key,payload}) => [key,payload]));
      if (state.view === 'saved-searches') renderSavedSearches();
    }
  } catch (error) {
    root.innerHTML = `<p class="radar-message">${esc(error.message)}</p>`;
    if (state.view !== 'radar') toast(error.message, true);
  }
}

function updateSaveButton(button, saved) {
  button.setAttribute('aria-pressed', String(saved));
  button.innerHTML = radarSaveLabel(saved);
}

async function changeRadarSave(item, button) {
  if (!item || dashboard.pendingSave.has(item.key)) return;
  dashboard.pendingSave.add(item.key);
  button.disabled = true;
  try {
    await dashboard.savedLoads.get('tender');
    const wasSaved = dashboard.saved.has(item.key);
    const result = await api('/api/radar/saved/tender/' + encodeURIComponent(item.key), wasSaved ? { method: 'DELETE' } :
      { method: 'PUT', body: JSON.stringify(item) });
    if (wasSaved) dashboard.saved.delete(item.key);
    else dashboard.saved.set(item.key, {...result.item.payload, key: item.key});
    $('#radarSavedCount').textContent = dashboard.saved.size.toLocaleString('pt-BR');
    if (state.view === 'saved') renderSavedTenders();
    const selectedButton = $('#radarDetail [data-radar-save]');
    if (selectedButton && dashboard.selected === item.key) updateSaveButton(selectedButton, !wasSaved);
    toast(wasSaved ? 'Oportunidade removida dos salvos.' : 'Oportunidade salva.');
  } catch (error) { toast(error.message, true); }
  finally { dashboard.pendingSave.delete(item.key); button.disabled = false; }
}

function selectSavedRadarItem(button) {
  const key = button.dataset.radarSelect;
  const panel = $('#radarSavedDetail');
  const item = dashboard.saved.get(key);
  if (!item) return;
  dashboard.savedSelected = key;
  $$('[data-radar-select]', button.closest('table')).forEach(entry => {
    const active = entry === button;
    entry.setAttribute('aria-pressed', String(active));
    entry.closest('tr').classList.toggle('radar-selected', active);
  });
  renderRadarDetail(panel, item);
  const heading = $('h2', panel);
  heading?.focus({ preventScroll: true });
  if (matchMedia('(max-width: 1000px)').matches) panel.scrollIntoView({ block: 'start' });
}

function bindRadarDashboard() {
  const names = ['Acre','Alagoas','Amapá','Amazonas','Bahia','Ceará','Distrito Federal','Espírito Santo',
    'Goiás','Maranhão','Mato Grosso','Mato Grosso do Sul','Minas Gerais','Pará','Paraíba','Paraná',
    'Pernambuco','Piauí','Rio de Janeiro','Rio Grande do Norte','Rio Grande do Sul','Rondônia','Roraima',
    'Santa Catarina','São Paulo','Sergipe','Tocantins'];
  const defaultUf = $('#radarDefaultUf');
  const saveDefault = $('#radarSaveDefaultUf');
  UFS.forEach((uf, index) => defaultUf.add(new Option(`${uf} · ${names[index]}`, uf)));
  saveDefault.addEventListener('click', async () => {
    defaultUf.disabled = saveDefault.disabled = true;
    try {
      await api('/api/radar/preferences', {method:'PUT', body:JSON.stringify({uf:defaultUf.value})});
      toast(defaultUf.value ? `UF inicial salva: ${defaultUf.value}.` : 'Busca inicial configurada para todo o Brasil.');
    } catch (error) { toast(error.message, true); }
    finally { defaultUf.disabled = saveDefault.disabled = false; }
  });
  $('#radarStates').innerHTML = UFS.map((uf, i) => `<label><input type="checkbox" value="${uf}"><span><b>${uf}</b> ${names[i]}</span></label>`).join('');
  const picker = $('#radarStatePicker');
  const stateSearch = $('#radarStateSearch');
  const stateOptions = $$('#radarStates label');
  const filterStates = () => {
    const query = norm(stateSearch.value.trim());
    stateOptions.forEach(option => { option.hidden = !norm(option.textContent).includes(query); });
    $('#radarNoStates').hidden = stateOptions.some(option => !option.hidden);
  };
  stateSearch.addEventListener('input', filterStates);
  stateSearch.addEventListener('keydown', event => { if (event.key === 'Enter') event.preventDefault(); });
  picker.addEventListener('toggle', () => {
    if (picker.open) stateSearch.focus();
    else { stateSearch.value = ''; filterStates(); }
  });
  const closePicker = () => { picker.open = false; $('summary', picker).focus(); };
  $('#radarStateDone').addEventListener('click', closePicker);
  picker.addEventListener('keydown', event => { if (event.key === 'Escape' && picker.open) closePicker(); });
  document.addEventListener('click', event => { if (!picker.contains(event.target)) picker.open = false; });
  const form = $('#radarSearchForm');
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!$('#radarFilters').hidden) $('#radarFiltersToggle').click();
    runDashboardSearch();
  });
  $('#radarFilters').addEventListener('change', renderDashboardChips);
  $('#radarFilters').addEventListener('input', event => {
    if (event.target.matches('#radarMunicipality, #radarOrganization')) renderDashboardChips();
  });
  $('#radarOrder').addEventListener('change', () => runDashboardSearch());
  $('#radarFiltersToggle').addEventListener('click', event => {
    const filters = $('#radarFilters');
    filters.hidden = !filters.hidden;
    event.currentTarget.setAttribute('aria-expanded', String(!filters.hidden));
  });
  $('#radarChips').addEventListener('click', event => {
    const chip = event.target.closest('[data-radar-chip]');
    if (!chip) return;
    const key = chip.dataset.radarChip;
    const input = UFS.includes(key) ? `#radarStates input[value="${key}"]` : '#' + key;
    const control = $(input);
    if (control.type === 'checkbox') control.checked = false;
    else control.value = control.options?.[0].value || '';
    runDashboardSearch();
  });
  $('#radarClear').addEventListener('click', () => { applyDashboardQuery(''); runDashboardSearch(); });
  for (const [id, params] of [['radarNew','days=1&order=newest'],['radarSoon','closingDays=7&order=deadline']]) {
    $('#' + id).addEventListener('click', () => { applyDashboardQuery(params); runDashboardSearch(); });
  }
  $('#radarResults').addEventListener('click', event => {
    const page = event.target.closest('[data-radar-page]');
    if (page) selectRadarResult((dashboard.page + Number(page.dataset.radarPage)) * dashboardPageSize, false);
    if (event.target.closest('#radarRetry')) runDashboardSearch();
    const button = event.target.closest('[data-radar-select]');
    if (button) selectRadarResult(dashboard.items.findIndex(item => item.key === button.dataset.radarSelect), true);
  });
  radarCompact.addEventListener('change', () => $('#view-radar').classList.remove('radar-detail-open'));
  $('#radarDetail').addEventListener('keydown', event => {
    if (event.key === 'Escape' && radarCompact.matches && $('#view-radar').classList.contains('radar-detail-open')) closeRadarResult();
  });
  $('#radarSavedList').addEventListener('click', event => {
    const button = event.target.closest('[data-radar-select]');
    if (button) selectSavedRadarItem(button);
  });
  for (const [id, item] of [['radarDetail', () => dashboard.items.find(entry => entry.key === dashboard.selected)],
    ['radarSavedDetail', () => dashboard.saved.get(dashboard.savedSelected)]]) {
    $('#' + id).addEventListener('click', event => {
      const button = event.target.closest('[data-radar-save]');
      if (button) changeRadarSave(item(), button);
      if (event.target.closest('[data-radar-back]')) {
        if (id === 'radarDetail') closeRadarResult();
        else $('#radarSavedList [aria-pressed="true"]')?.focus();
      }
      const toggle = event.target.closest('[data-radar-title-toggle]');
      if (toggle) {
        const expanded = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', String(!expanded));
        toggle.textContent = expanded ? 'Ver objeto completo' : 'Recolher objeto';
        $('h2', event.currentTarget).classList.toggle('radar-title-clamp', expanded);
      }
      const step = event.target.closest('[data-radar-step]');
      if (step) selectRadarResult(dashboard.items.findIndex(entry => entry.key === dashboard.selected) + Number(step.dataset.radarStep), true, true);
      if (event.target.closest('[data-radar-doc-retry]') && item()) loadRadarDocuments($('.radar-documents',event.currentTarget), item());
    });
  }
  const dialog = $('#radarSaveDialog');
  $('#radarSaveSearch').addEventListener('click', () => {
    dialog.returnValue = '';
    $('#radarSearchName').value = $('#searchKeyword').value.trim().slice(0,80);
    dialog.showModal();
  });
  dialog.addEventListener('close', async () => {
    if (dialog.returnValue !== 'save') return;
    const name = $('#radarSearchName').value.trim();
    if (!name) return toast('Informe um nome para a busca.', true);
    try {
      await api('/api/radar/saved/search/' + crypto.randomUUID(), {method:'PUT',body:JSON.stringify({ name, query: dashboardQuery().toString() })});
      toast('Busca salva.');
    } catch (error) { toast(error.message, true); }
  });
  $('#radarSavedSearchList').addEventListener('click', async event => {
    const open = event.target.closest('[data-radar-open-search]');
    if (open) {
      const saved = dashboard.searches.get(open.dataset.radarOpenSearch);
      if (saved) { show('radar'); applyDashboardQuery(saved.query); runDashboardSearch(); }
    }
    const remove = event.target.closest('[data-radar-delete-search]');
    if (remove) {
      remove.disabled = true;
      try {
        await api('/api/radar/saved/search/' + encodeURIComponent(remove.dataset.radarDeleteSearch), {method:'DELETE'});
        dashboard.searches.delete(remove.dataset.radarDeleteSearch);
        renderSavedSearches();
        toast('Busca removida.');
      } catch (error) { toast(error.message, true); remove.disabled = false; }
    }
  });
}

function startRadarDashboard() {
  const initialQuery = dashboardQuery().toString();
  $('#radarSearchMeta').textContent = 'Carregando preferências…';
  api('/api/radar/preferences', {timeoutMs:4000}).then(preferences => {
    const uf = UFS.includes(preferences.uf) ? preferences.uf : '';
    $('#radarDefaultUf').value = uf;
    if (!dashboard.search && dashboardQuery().toString() === initialQuery) {
      applyDashboardQuery(uf ? `states=${uf}` : '');
    }
  }).catch(() => {
    toast('Não foi possível carregar a UF inicial.', true);
  }).finally(() => {
    $('#radarDefaultUf').disabled = $('#radarSaveDefaultUf').disabled = false;
    if (!dashboard.search) runDashboardSearch();
  });
  loadDashboardSaved('tender');
  api('/api/radar/metrics').then(metrics => {
    $('#radarNewCount').textContent = Number(metrics.recent).toLocaleString('pt-BR');
    $('#radarSoonCount').textContent = Number(metrics.soon).toLocaleString('pt-BR');
  }).catch(() => {});
}

async function loadAlertsPage(){await Promise.allSettled([loadAlerts(),loadNotifications()])}
async function loadAlerts(){const root=$('#alertsList');try{const d=await api('/api/alerts');const items=d.items||[];if(root)root.innerHTML=items.map(a=>`<div class="stack-item"><div class="stack-copy"><b>${esc(a.name)}</b><span>${esc([a.keyword,a.uf,a.municipality,a.modality_code&&'Modalidade '+a.modality_code].filter(Boolean).join(' • ')||'Alerta amplo')}</span></div><div class="stack-actions"><button class="btn ghost compact" data-toggle-alert="${a.id}" data-enabled="${a.enabled}">${a.enabled?'Pausar':'Ativar'}</button><button class="btn danger compact" data-delete-alert="${a.id}">Excluir</button></div></div>`).join('')||'<div class="empty-state">Você ainda não criou alertas.</div>'}catch(e){if(root)root.innerHTML=`<div class="empty-state">${esc(e.message)}</div>`}}
async function createAlert(){try{await api('/api/alerts',{method:'POST',body:JSON.stringify({name:$('#alertName')?.value.trim(),keyword:$('#alertKeyword')?.value.trim(),uf:$('#alertUf')?.value,modality_code:$('#alertModality')?.value||null,enabled:true})});toast('Alerta criado.');if($('#alertName'))$('#alertName').value='';if($('#alertKeyword'))$('#alertKeyword').value='';await loadAlerts()}catch(e){toast(e.message,true)}}
async function loadNotifications(){const root=$('#notificationProfile');try{const d=await api('/api/notifications/profile');const p=d.profile||{},providers=d.providers||{};const card=(kind,label,value,verified,configured)=>`<div class="channel-card"><div class="channel-head"><div><h3>${label}</h3><p>${verified?'Verificado':'Não verificado'}${value?' • '+esc(value):''}</p></div><span class="badge">${configured?'Disponível':'Pendente no servidor'}</span></div><div class="channel-grid"><input id="notif-${kind}" value="${esc(value||'')}" placeholder="${kind==='email'?'email@empresa.com.br':'(11) 99999-9999'}"><button class="btn ghost compact" data-request-verify="${kind}" ${configured?'':'disabled'}>Verificar</button></div>${configured?'':`<div class="provider-note">O provedor externo deste canal ainda não está configurado.</div>`}<div class="channel-grid section-gap"><input id="code-${kind}" placeholder="Código"><button class="btn ghost compact" data-confirm-verify="${kind}" ${configured?'':'disabled'}>Confirmar</button></div>${kind==='email'&&verified&&configured?'<button class="btn ghost compact section-gap" data-test-notification="email">Enviar e-mail de teste</button>':''}</div>`;if(root)root.innerHTML=`<div class="channel-card"><div class="channel-head"><div><h3>Radar no site</h3><p>Notificações internas disponíveis.</p></div><span class="badge">Ativo</span></div></div>${card('email','E-mail',p.email,p.email_verified,providers.email?.configured)}${card('whatsapp','WhatsApp',p.whatsapp_e164,p.whatsapp_verified,providers.whatsapp?.verification_configured)}`}catch(e){if(root)root.innerHTML=`<div class="empty-state">${esc(e.message)}</div>`}}
async function requestVerify(kind){try{const d=await api('/api/notifications/verify/request',{method:'POST',body:JSON.stringify({channel:kind,destination:$('#notif-'+kind)?.value.trim()})});toast(d.message||'Código enviado.')}catch(e){toast(e.message,true)}}
async function confirmVerify(kind){try{await api('/api/notifications/verify/confirm',{method:'POST',body:JSON.stringify({channel:kind,code:$('#code-'+kind)?.value.trim()})});toast('Canal confirmado.');await loadNotifications()}catch(e){toast(e.message,true)}}
async function loadDocuments(){const root=$('#documentsList');try{const d=await api('/api/documents');const items=d.items||[];if(root)root.innerHTML=items.map(x=>`<div class="stack-item"><div class="stack-copy"><b>${esc(x.filename)}</b><span>${Math.round(Number(x.size_bytes||0)/1024)} KB • ${esc(when(x.created_at))}</span></div><div class="stack-actions"><a class="btn ghost compact" href="/api/documents/${x.id}/download">Baixar</a><button class="btn danger compact" data-delete-doc="${x.id}">Excluir</button></div></div>`).join('')||'<div class="empty-state">Nenhum documento salvo.</div>'}catch(e){if(root)root.innerHTML=`<div class="empty-state">${esc(e.message)}</div>`}}
async function uploadDoc(file){if(!file)return;if(file.size>3*1024*1024)return toast('O arquivo deve ter no máximo 3 MB.',true);const content=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]||'');r.onerror=reject;r.readAsDataURL(file)});try{await api('/api/documents',{method:'POST',body:JSON.stringify({filename:file.name,mime_type:file.type||'application/octet-stream',content_base64:content})});toast('Documento enviado.');await loadDocuments()}catch(e){toast(e.message,true)}}
async function loadAiStatus(){try{const d=await api('/api/ai-rlb/status');if($('#aiStatusText'))$('#aiStatusText').textContent=d.provider?`Modo ${d.provider}${d.model?' • '+d.model:''}`:'Fontes oficiais e fallback local disponíveis.'}catch(e){if($('#aiStatusText'))$('#aiStatusText').textContent=e.message}}
function aiMsg(role,text){const root=$('#aiMessages');root?.querySelector('.empty-state')?.remove();if(!root)return;const d=document.createElement('div');d.className='ai-msg '+role;d.textContent=text;root.appendChild(d);root.scrollTop=root.scrollHeight}
async function sendAi(){const text=$('#aiPrompt')?.value.trim();if(!text)return;if($('#aiPrompt'))$('#aiPrompt').value='';aiMsg('user',text);if($('#aiSend'))$('#aiSend').disabled=true;try{const d=await api('/api/ai-rlb/chat',{method:'POST',body:JSON.stringify({message:text,use_web:true}),timeoutMs:60000});aiMsg('assistant',String(d.answer||d.response||d.content||d.message||d.text||'Resposta recebida.'))}catch(e){aiMsg('assistant','Erro: '+e.message)}finally{if($('#aiSend'))$('#aiSend').disabled=false}}
async function loadAdmin(){if(state.user?.role!=='admin')return;try{const [s,u,a]=await Promise.all([api('/api/admin/stats'),api('/api/admin/users'),api('/api/admin/audit')]);const st=s.stats||{};if($('#adminUsers'))$('#adminUsers').textContent=st.users?.total??'—';if($('#adminActive'))$('#adminActive').textContent=st.users?.active??'—';if($('#adminAlerts'))$('#adminAlerts').textContent=st.alerts?.enabled??'—';if($('#adminDocs'))$('#adminDocs').textContent=st.documents?.count??'—';if($('#adminUsersList'))$('#adminUsersList').innerHTML=(u.items||[]).map(x=>`<div class="stack-item admin-row"><div class="stack-copy"><b>${esc(x.email)}</b><span>${esc(x.role)} • ${x.active?'ativo':'inativo'}</span></div><select data-role-user="${x.id}" ${x.id==state.user.id?'disabled':''}><option value="user" ${x.role==='user'?'selected':''}>Usuário</option><option value="admin" ${x.role==='admin'?'selected':''}>Admin</option></select><button class="btn ghost compact" data-active-user="${x.id}" data-active="${x.active}" ${x.id==state.user.id?'disabled':''}>${x.active?'Desativar':'Ativar'}</button></div>`).join('');if($('#adminAuditList'))$('#adminAuditList').innerHTML=(a.items||[]).slice(0,60).map(x=>`<div class="stack-item"><div class="stack-copy"><b>${esc(x.action)}</b><span>${esc(x.email||'sistema')} • ${esc(when(x.created_at))}</span></div></div>`).join('')||'<div class="empty-state">Sem eventos recentes.</div>'}catch(e){toast(e.message,true)}}
async function patchUser(id,p){try{await api('/api/admin/users/'+id,{method:'PATCH',body:JSON.stringify(p)});toast('Usuário atualizado.');await loadAdmin()}catch(e){toast(e.message,true)}}
function bind(){fillSelects();initTheme();bindRadarMenu();$('#tabLogin')?.addEventListener('click',()=>authMode('login'));$('#tabRegister')?.addEventListener('click',()=>authMode('register'));$('#authForm')?.addEventListener('submit',submitAuth);$('#logoutBtn')?.addEventListener('click',logout);document.addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b&&!b.classList.contains('hidden')&&b.dataset.view)show(b.dataset.view)});bindRadarDashboard();$('#refreshLive')?.addEventListener('click',refreshLive);$('#liveScope')?.addEventListener('change',renderLive);$('#createAlertBtn')?.addEventListener('click',createAlert);$('#alertsList')?.addEventListener('click',async e=>{const d=e.target.closest('[data-delete-alert]'),t=e.target.closest('[data-toggle-alert]');if(d&&confirm('Excluir este alerta?')){await api('/api/alerts/'+d.dataset.deleteAlert,{method:'DELETE',body:'{}'});loadAlerts()}if(t){await api('/api/alerts/'+t.dataset.toggleAlert,{method:'PATCH',body:JSON.stringify({enabled:t.dataset.enabled!=='true'})});loadAlerts()}});$('#notificationProfile')?.addEventListener('click',e=>{const r=e.target.closest('[data-request-verify]'),c=e.target.closest('[data-confirm-verify]');if(r)requestVerify(r.dataset.requestVerify);if(c)confirmVerify(c.dataset.confirmVerify);const t=e.target.closest('[data-test-notification]');if(t){t.disabled=true;api('/api/notifications/test',{method:'POST',body:JSON.stringify({channel:t.dataset.testNotification})}).then(()=>toast('E-mail de teste enviado. Confira sua caixa de entrada.')).catch(err=>toast(err.message,true)).finally(()=>t.disabled=false)}});$('#docInput')?.addEventListener('change',e=>uploadDoc(e.target.files?.[0]));$('#documentsList')?.addEventListener('click',async e=>{const b=e.target.closest('[data-delete-doc]');if(b&&confirm('Excluir este documento?')){await api('/api/documents/'+b.dataset.deleteDoc,{method:'DELETE',body:'{}'});loadDocuments()}});$('#aiSend')?.addEventListener('click',sendAi);$('#aiPrompt')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendAi()}});$('#adminUsersList')?.addEventListener('change',e=>{const s=e.target.closest('[data-role-user]');if(s)patchUser(s.dataset.roleUser,{role:s.value})});$('#adminUsersList')?.addEventListener('click',e=>{const b=e.target.closest('[data-active-user]');if(b)patchUser(b.dataset.activeUser,{active:b.dataset.active!=='true'})});window.addEventListener('focus',()=>state.user&&state.view==='radar'&&refreshLive());document.addEventListener('visibilitychange',()=>!document.hidden&&state.user&&state.view==='radar'&&refreshLive())}
async function boot(){try{bind();const m=$('#runtimeMessage');if(m){m.textContent='Interface carregada.';m.classList.add('ok')}await checkSession()}catch(e){console.error('RLB boot fatal:',e);const m=$('#runtimeMessage');if(m){m.textContent='Falha ao iniciar a interface. Atualize a página.';m.classList.remove('ok')}const a=$('#authMessage');if(a)a.textContent='Falha ao iniciar a interface.'}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

(()=>{
'use strict';
const CHECK_MS=5*60*1000;
const FIRST_CHECK_MS=5000;
const DISPLAY_MS=7000;
const MAX_SEEN=180;
let checking=false;
let interval=null;
let lastCheck=0;
const getText=(x)=>String(x??'').trim();
const modality=x=>getText(x?.modalidadeNome||x?._modalidadeConsultada||'Licitação pública');
const municipality=x=>getText(x?.unidadeOrgao?.municipioNome||x?.unidadeOrgao?.nomeMunicipio||x?.municipioNome||'Brasil');
const uf=x=>getText(x?.unidadeOrgao?.ufSigla||x?.ufSigla||'');
const organization=x=>getText(x?.orgaoEntidade?.razaoSocial||'Órgão público');
const objectText=x=>getText(x?.objetoCompra||'Nova oportunidade disponível no Radar de Licitações.');
function itemId(x){return getText(x?.numeroControlePNCP||x?._pncpId||[x?.orgaoEntidade?.cnpj,x?.anoCompra,x?.sequencialCompra,x?._modalidadeConsultada||x?.modalidadeId].filter(Boolean).join('-'))}
function pncpUrl(x){if(x?._pncpUrl)return x._pncpUrl;const c=String(x?.orgaoEntidade?.cnpj||'').replace(/\D/g,''),y=Number(x?.anoCompra),s=Number(x?.sequencialCompra);return c.length===14&&Number.isInteger(y)&&Number.isInteger(s)?`https://pncp.gov.br/app/editais/${c}/${y}/${s}`:''}
function isAvailable(x){const raw=x?.dataEncerramentoProposta||x?.dataFimRecebimentoProposta||x?._closesAt;if(!raw)return true;const d=new Date(raw);return Number.isNaN(d.getTime())||d.getTime()>=Date.now()}
function storageKey(userId){return `rlb-national-notifications-seen-v1:${userId}`}
function readSeen(userId){try{const a=JSON.parse(localStorage.getItem(storageKey(userId))||'[]');return new Set(Array.isArray(a)?a:[])}catch{return new Set()}}
function saveSeen(userId,seen){try{localStorage.setItem(storageKey(userId),JSON.stringify([...seen].slice(-MAX_SEEN)))}catch{}}
function host(){let h=document.getElementById('rlbNationalNoticeHost');if(h)return h;h=document.createElement('div');h.id='rlbNationalNoticeHost';h.setAttribute('aria-live','polite');Object.assign(h.style,{position:'fixed',right:innerWidth<600?'10px':'20px',bottom:innerWidth<600?'68px':'82px',zIndex:'145',width:innerWidth<600?'min(296px, calc(100vw - 20px))':'min(306px, calc(100vw - 28px))',display:'grid',gap:'8px',pointerEvents:'none'});document.body.appendChild(h);return h}
function reposition(){const h=document.getElementById('rlbNationalNoticeHost');if(!h)return;h.style.right=innerWidth<600?'10px':'20px';h.style.bottom=innerWidth<600?'68px':'82px';h.style.width=innerWidth<600?'min(296px, calc(100vw - 20px))':'min(306px, calc(100vw - 28px))'}
function closeCard(card){if(!card||card.dataset.closing==='1')return;card.dataset.closing='1';try{card.__cancelNotice?.()}catch{}try{const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;if(reduced){card.remove();return}const a=card.animate([{opacity:1,transform:'translateX(0) scale(1)'},{opacity:0,transform:'translateX(115%) scale(.97)'}],{duration:230,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'});a.onfinish=()=>card.remove()}catch{card.remove()}}
function showNotification(x){const url=pncpUrl(x);if(!url)return;const h=host();while(h.children.length>=1)h.firstElementChild?.remove();const card=document.createElement('article');card.setAttribute('role','status');Object.assign(card.style,{pointerEvents:'auto',position:'relative',padding:'9px 10px 10px',border:'1px solid var(--line)',borderRadius:'11px',background:'color-mix(in srgb, var(--surface) 96%, transparent)',color:'var(--text)',boxShadow:'0 10px 28px rgba(0,0,0,.19)',backdropFilter:'blur(16px)',WebkitBackdropFilter:'blur(16px)',cursor:'pointer',overflow:'hidden',transition:'box-shadow .18s ease,border-color .18s ease'});
const accent=document.createElement('span');Object.assign(accent.style,{position:'absolute',left:'0',top:'9px',bottom:'11px',width:'3px',borderRadius:'0 4px 4px 0',background:'linear-gradient(180deg,var(--emerald),var(--cyan))',boxShadow:'0 0 14px color-mix(in srgb,var(--emerald) 45%,transparent)'});card.appendChild(accent);
const top=document.createElement('div');Object.assign(top.style,{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',marginBottom:'4px'});
const label=document.createElement('div');label.textContent='● NOVA OPORTUNIDADE • RADAR';Object.assign(label.style,{fontSize:'9px',fontWeight:'950',letterSpacing:'.065em',color:'var(--emerald)'});
const close=document.createElement('button');close.type='button';close.setAttribute('aria-label','Fechar notificação');close.textContent='×';Object.assign(close.style,{width:'26px',height:'26px',borderRadius:'7px',border:'1px solid var(--line)',background:'var(--surface2)',color:'var(--muted)',fontSize:'15px',lineHeight:'1',padding:'0',cursor:'pointer',flex:'0 0 auto'});top.append(label,close);
const title=document.createElement('div');title.textContent=objectText(x);Object.assign(title.style,{fontSize:'12px',fontWeight:'850',lineHeight:'1.35',display:'-webkit-box',WebkitLineClamp:'2',WebkitBoxOrient:'vertical',overflow:'hidden',paddingLeft:'2px'});
const meta=document.createElement('div');meta.textContent=`${modality(x)} • ${municipality(x)}${uf(x)?' / '+uf(x):''}`;Object.assign(meta.style,{fontSize:'10px',color:'var(--muted)',marginTop:'5px',paddingLeft:'2px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'});
const org=document.createElement('div');org.textContent=organization(x);Object.assign(org.style,{fontSize:'9.5px',color:'var(--muted)',marginTop:'2px',paddingLeft:'2px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'});
const foot=document.createElement('div');Object.assign(foot.style,{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'8px',marginTop:'7px',paddingTop:'6px',paddingLeft:'2px',borderTop:'1px solid var(--line)'});
const source=document.createElement('span');source.textContent='PNCP • fonte oficial';Object.assign(source.style,{fontSize:'9px',color:'var(--muted)'});
const open=document.createElement('a');open.href=url;open.target='_blank';open.rel='noopener';open.textContent='Ver oportunidade ↗';Object.assign(open.style,{fontSize:'10.5px',fontWeight:'900',color:'var(--emerald)',textDecoration:'none'});foot.append(source,open);
const progressTrack=document.createElement('div');Object.assign(progressTrack.style,{position:'absolute',left:'0',right:'0',bottom:'0',height:'2px',background:'color-mix(in srgb,var(--muted) 14%,transparent)',overflow:'hidden'});
const progress=document.createElement('div');Object.assign(progress.style,{width:'100%',height:'100%',transform:'scaleX(1)',transformOrigin:'left center',background:'linear-gradient(90deg,var(--emerald),var(--cyan),var(--purple))',boxShadow:'0 0 10px color-mix(in srgb,var(--emerald) 35%,transparent)',willChange:'transform'});progressTrack.appendChild(progress);card.append(top,title,meta,org,foot,progressTrack);h.appendChild(card);
let remaining=DISPLAY_MS,paused=false,lastFrame=performance.now(),raf=0,stopped=false;
function stopClock(){stopped=true;if(raf)cancelAnimationFrame(raf)}
function frame(now){if(stopped||!card.isConnected)return;if(!paused){remaining-=Math.max(0,now-lastFrame);const ratio=Math.max(0,remaining/DISPLAY_MS);progress.style.transform=`scaleX(${ratio})`;if(remaining<=0){stopClock();closeCard(card);return}}lastFrame=now;raf=requestAnimationFrame(frame)}
card.__cancelNotice=stopClock;
close.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();closeCard(card)});open.addEventListener('click',e=>e.stopPropagation());card.addEventListener('click',()=>window.open(url,'_blank','noopener'));
card.addEventListener('mouseenter',()=>{paused=true;lastFrame=performance.now();card.style.boxShadow='0 13px 34px color-mix(in srgb,var(--emerald) 14%,rgba(0,0,0,.25)),0 0 0 1px color-mix(in srgb,var(--emerald) 30%,transparent)';card.style.borderColor='color-mix(in srgb,var(--emerald) 45%,var(--line))'});
card.addEventListener('mouseleave',()=>{paused=false;lastFrame=performance.now();card.style.boxShadow='0 16px 38px rgba(0,0,0,.20)';card.style.borderColor='var(--line)'});
try{if(!matchMedia('(prefers-reduced-motion: reduce)').matches){card.animate([{opacity:0,transform:'translateX(115%) scale(.98)'},{offset:.78,opacity:1,transform:'translateX(-7px) scale(1.01)'},{opacity:1,transform:'translateX(0) scale(1)'}],{duration:480,easing:'cubic-bezier(.16,1,.3,1)'});accent.animate([{opacity:.35},{opacity:1}],{duration:520,easing:'ease-out'})}}catch{}
raf=requestAnimationFrame(frame)
}
async function getUser(){const r=await fetch('/api/me',{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});if(!r.ok)return null;const d=await r.json().catch(()=>({}));return d.user||null}
async function check(){if(checking||document.hidden)return;checking=true;lastCheck=Date.now();try{const user=await getUser();if(!user)return;const r=await fetch('/api/live-feed?limit=100',{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});if(!r.ok)return;const d=await r.json().catch(()=>({}));const items=(d.items||[]).filter(x=>itemId(x)&&pncpUrl(x)&&isAvailable(x));if(!items.length)return;const seen=readSeen(user.id);const next=items.find(x=>!seen.has(itemId(x)));if(!next)return;seen.add(itemId(next));saveSeen(user.id,seen);showNotification(next)}catch(e){console.warn('RLB onsite notification check:',e?.message||e)}finally{checking=false}}
function schedule(){if(interval)clearInterval(interval);setTimeout(check,FIRST_CHECK_MS);interval=setInterval(check,CHECK_MS)}
function observeLogin(){const shell=document.getElementById('appShell');if(!shell)return;if(!shell.classList.contains('hidden'))setTimeout(check,1800);new MutationObserver(()=>{if(!shell.classList.contains('hidden'))setTimeout(check,1800)}).observe(shell,{attributes:true,attributeFilter:['class']})}
function boot(){schedule();observeLogin();addEventListener('resize',reposition,{passive:true});document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-lastCheck>=CHECK_MS)check()})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();