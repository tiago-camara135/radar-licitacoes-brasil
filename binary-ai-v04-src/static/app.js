const $ = (id) => document.getElementById(id);

const state = {
  session: null,
  sessionExpiresAt: 0,
  enabledBooks: [],
  broker: 'quotex',
  market: 'otc',
  symbol: '',
  tf: '1m',
  analysis: null,
  symbols: [],
  ws: null,
  settings: { score: 66, payout: 80 },
};

const brokerNames = {
  quotex: 'Quotex',
  pocket: 'Pocket Option',
  iqoption: 'IQ Option',
  bullex: 'Bullex',
};
const brokerBooks = { quotex: 'quotex', pocket: 'otc', iqoption: 'iq' };
const pageTitles = {
  dashboard: 'Central de Sinais',
  scanner: 'Scanner IA',
  history: 'Histórico Forward',
  calibration: 'Calibração Estatística',
  settings: 'Configurações',
};

class ApiError extends Error {
  constructor(message, status = 0, payload = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function fmtPct(value, digits = 1) {
  return value == null || Number.isNaN(Number(value)) ? '--' : `${Number(value).toFixed(digits)}%`;
}
function fmtPrice(value) {
  if (value == null || Number.isNaN(Number(value))) return '--';
  const n = Number(value);
  return n >= 1000
    ? n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
    : n.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}
function timeLocal(ts) {
  if (!ts) return '—';
  return new Date(Number(ts) * 1000).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}
function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}
function setDisabled(id, value) {
  const el = $(id);
  if (el) el.disabled = Boolean(value);
}
function showToast(message, kind = 'info') {
  const el = $('toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast ${kind}`;
  el.hidden = false;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => { el.hidden = true; }, 4200);
}
function connectionMessage(message, kind = '') {
  const el = $('connectResult');
  if (!el) return;
  el.textContent = message;
  el.className = `connection-result ${kind}`.trim();
}

async function api(url, opts = {}) {
  const options = { cache: 'no-store', ...opts };
  const response = await fetch(url, options);
  let data = {};
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) {
    const message = data.detail || data.error || data.message || `HTTP ${response.status}`;
    throw new ApiError(String(message), response.status, data);
  }
  return data;
}

function loadPrefs() {
  try {
    const prefs = JSON.parse(localStorage.getItem('binaryAiPrefs') || '{}');
    const score = Number(prefs.score);
    const payout = Number(prefs.payout);
    if (score >= 55 && score <= 95) state.settings.score = score;
    if (payout >= 0 && payout <= 99) state.settings.payout = payout;
  } catch {}
  setText('providerName', 'OTCharts • read-only');
  if ($('minScore')) $('minScore').value = state.settings.score;
  if ($('settingsScore')) $('settingsScore').value = state.settings.score;
  if ($('minPayout')) $('minPayout').value = state.settings.payout;
  if ($('settingsPayout')) $('settingsPayout').value = state.settings.payout;
}

function savePrefs() {
  const score = Math.min(95, Math.max(55, Number($('settingsScore')?.value || 66)));
  const payout = Math.min(99, Math.max(0, Number($('settingsPayout')?.value || 80)));
  state.settings = { score, payout };
  localStorage.setItem('binaryAiPrefs', JSON.stringify(state.settings));
  if ($('minScore')) $('minScore').value = score;
  if ($('minPayout')) $('minPayout').value = payout;
  showToast('Filtros salvos.', 'ok');
}

function switchView(name) {
  const target = $(`view-${name}`);
  if (!target) return;
  document.querySelectorAll('.view').forEach((view) => {
    const active = view === target;
    view.hidden = !active;
    view.classList.toggle('active', active);
    view.style.display = active ? 'block' : 'none';
  });
  document.querySelectorAll('.nav').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === name);
  });
  setText('pageTitle', pageTitles[name] || 'Binary AI');
  if (name === 'history') loadHistory();
  if (name === 'calibration') loadCalibration();
  if (name === 'settings') refreshDiagnostics();
}

function resetAnalysis(message = 'Conecte o feed e carregue um ativo.') {
  state.analysis = null;
  setText('chartBroker', 'CORRETORA');
  setText('chartSymbol', 'Selecione um ativo');
  setText('lastPrice', '--');
  setText('feedAge', 'sem dados');
  setText('openStatus', '--');
  setText('payoutValue', '--');
  setText('breakevenValue', '--');
  setText('qualityBadge', 'AGUARDANDO');
  setText('signalDirection', 'AGUARDAR');
  setText('probability', '--%');
  setText('probabilityLabel', 'confiança técnica');
  setText('actionText', 'SEM ENTRADA');
  setText('explainText', message);
  setText('calibratedValue', 'Aguardando amostra');
  setText('edgeValue', '--');
  setText('evValue', '--');
  ['f1h', 's1h', 'f5m', 's5m', 'f1m', 's1m'].forEach((id) => setText(id, '--'));
  const badge = $('qualityBadge'); if (badge) badge.className = 'badge wait';
  const orb = $('signalOrb'); if (orb) orb.className = 'signal-orb wait';
  const empty = $('chartEmpty'); if (empty) empty.hidden = false;
  clearChart();
}

function updateConnectionUI(connected, detail = '') {
  $('feedDot')?.classList.toggle('live', connected);
  setText('feedState', connected ? 'Broker Feed conectado' : 'Broker Feed desconectado');
  setText('liveStatus', connected ? 'CONECTADO' : 'DESCONECTADO');
  setText('diagFeed', connected ? 'conectado' : 'desconectado');
  if ($('setupBanner')) $('setupBanner').hidden = connected;
  if (!connected) {
    setDisabled('symbolSelect', true);
    setDisabled('analyzeBtn', true);
    setDisabled('scanBtn', true);
    if ($('symbolSelect')) $('symbolSelect').innerHTML = '<option value="">Conecte o Broker Feed</option>';
    state.symbol = '';
    state.symbols = [];
    renderWatchlist();
  }
  if (detail && $('connectMeta')) $('connectMeta').textContent = detail;
}

function sessionExpired(message = 'A sessão do Broker Feed expirou. Conecte novamente.') {
  state.session = null;
  state.sessionExpiresAt = 0;
  state.enabledBooks = [];
  if (state.ws) { try { state.ws.close(); } catch {} state.ws = null; }
  updateConnectionUI(false);
  resetAnalysis(message);
  connectionMessage(message, 'error');
  showToast(message, 'error');
}

async function connectBroker() {
  const key = $('otKey')?.value.trim() || '';
  if (!key) {
    connectionMessage('Informe sua OTCharts API Key.', 'error');
    showToast('Informe a chave OTCharts.', 'error');
    $('otKey')?.focus();
    return;
  }
  setDisabled('connectBtn', true);
  connectionMessage('Validando a chave e os books disponíveis...');
  try {
    const data = await api('/api/broker/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key }),
    });
    state.session = data.session_id;
    state.sessionExpiresAt = Date.now() + Number(data.expires_in || 0) * 1000;
    state.enabledBooks = Array.isArray(data.enabled_books) ? data.enabled_books : [];
    updateConnectionUI(true);
    const books = state.enabledBooks.length ? state.enabledBooks.join(', ') : 'nenhum book habilitado';
    const quota = data.usage?.remaining ?? data.usage?.requestsRemaining ?? data.usage?.remainingRequests;
    const quotaText = quota != null ? ` • saldo/cota: ${quota}` : '';
    connectionMessage(`Chave válida. Books: ${books}${quotaText}.`, 'ok');
    if ($('connectMeta')) $('connectMeta').textContent = `Sessão temporária ativa por aproximadamente ${Math.round(Number(data.expires_in || 0) / 3600)}h. A chave não é colocada na URL.`;
    showToast('Broker Feed conectado.', 'ok');
    await loadSymbols();
  } catch (error) {
    sessionExpired(error.message || 'Falha ao conectar o Broker Feed.');
  } finally {
    setDisabled('connectBtn', false);
  }
}

function disconnect() {
  state.session = null;
  state.sessionExpiresAt = 0;
  state.enabledBooks = [];
  if (state.ws) { try { state.ws.close(); } catch {} state.ws = null; }
  if ($('otKey')) $('otKey').value = '';
  updateConnectionUI(false);
  resetAnalysis('Broker Feed desconectado.');
  connectionMessage('Desconectado. A chave foi removida da memória desta aba.');
  if ($('connectMeta')) $('connectMeta').textContent = '';
  showToast('Broker Feed desconectado.');
}

function brokerAvailable() {
  if (state.broker === 'bullex') return false;
  const book = brokerBooks[state.broker];
  return !book || state.enabledBooks.includes(book);
}

async function loadSymbols() {
  state.broker = $('brokerSelect')?.value || 'quotex';
  state.market = 'otc';
  resetAnalysis();

  if (state.broker === 'bullex') {
    if ($('symbolSelect')) $('symbolSelect').innerHTML = '<option value="">Bullex: conector pendente</option>';
    setDisabled('symbolSelect', true);
    setDisabled('analyzeBtn', true);
    setDisabled('scanBtn', true);
    if ($('scannerHint')) $('scannerHint').textContent = 'Bullex ainda não possui uma fonte de dados confiável integrada.';
    showToast('Bullex permanece pendente de uma fonte confiável.', 'warn');
    return;
  }

  if (!state.session) {
    updateConnectionUI(false);
    return;
  }

  if (!brokerAvailable()) {
    const name = brokerNames[state.broker] || state.broker;
    if ($('symbolSelect')) $('symbolSelect').innerHTML = `<option value="">Book ${escapeHtml(name)} não habilitado na chave</option>`;
    setDisabled('symbolSelect', true);
    setDisabled('analyzeBtn', true);
    setDisabled('scanBtn', true);
    connectionMessage(`Sua chave está conectada, mas não habilita o book ${name}.`, 'error');
    return;
  }

  setDisabled('symbolSelect', true);
  setDisabled('analyzeBtn', true);
  setDisabled('scanBtn', true);
  if ($('symbolSelect')) $('symbolSelect').innerHTML = '<option value="">Carregando ativos...</option>';
  try {
    const params = new URLSearchParams({ broker: state.broker, market: 'otc', session: state.session });
    const data = await api(`/api/broker/symbols?${params}`);
    state.symbols = Array.isArray(data.symbols) ? data.symbols : [];
    const open = state.symbols.filter((item) => item.open !== false);
    const rows = open.length ? open : state.symbols;
    if ($('symbolSelect')) {
      $('symbolSelect').innerHTML = rows.map((item) => {
        const payout = item.payout != null ? ` • ${Number(item.payout).toFixed(0)}%` : '';
        const closed = item.open === false ? ' • FECHADO' : '';
        return `<option value="${escapeHtml(item.symbol)}">${escapeHtml(item.name || item.symbol)}${payout}${closed}</option>`;
      }).join('') || '<option value="">Nenhum ativo disponível</option>';
    }
    state.symbol = $('symbolSelect')?.value || '';
    setDisabled('symbolSelect', !state.symbol);
    setDisabled('analyzeBtn', !state.symbol);
    renderWatchlist();
    setDisabled('scanBtn', !state.symbols.length);
    if ($('scannerHint')) $('scannerHint').textContent = state.symbols.length
      ? `${state.symbols.length} ativos recebidos do book ${brokerNames[state.broker]}. Selecione até 10 para o scanner.`
      : 'Nenhum ativo retornado pelo book atual.';
  } catch (error) {
    if (error.status === 401) return sessionExpired(error.message);
    if ($('symbolSelect')) $('symbolSelect').innerHTML = `<option value="">${escapeHtml(error.message)}</option>`;
    state.symbol = '';
    setDisabled('symbolSelect', true);
    setDisabled('analyzeBtn', true);
    setDisabled('scanBtn', true);
    showToast(error.message, 'error');
  }
}

async function analyze() {
  state.symbol = $('symbolSelect')?.value || '';
  state.broker = $('brokerSelect')?.value || state.broker;
  if (!state.session) {
    showToast('Conecte o Broker Feed antes de analisar.', 'warn');
    switchView('settings');
    $('otKey')?.focus();
    return;
  }
  if (!state.symbol) {
    showToast('Selecione um ativo.', 'warn');
    return;
  }
  setDisabled('analyzeBtn', true);
  setText('analyzeBtn', 'Analisando...');
  try {
    const params = new URLSearchParams({
      broker: state.broker,
      market: 'otc',
      symbol: state.symbol,
      session: state.session,
      min_score: String(Number($('minScore')?.value || state.settings.score)),
      min_payout: String(Number($('minPayout')?.value || state.settings.payout)),
    });
    const data = await api(`/api/broker/analysis?${params}`);
    state.analysis = data;
    renderAnalysis(data);
    await loadHistory();
    connectStream();
  } catch (error) {
    if (error.status === 401) return sessionExpired(error.message);
    renderError(error.message || 'Falha na análise.');
    showToast(error.message || 'Falha na análise.', 'error');
  } finally {
    setText('analyzeBtn', 'Analisar agora');
    setDisabled('analyzeBtn', !state.session || !state.symbol);
  }
}

function renderError(message) {
  setText('qualityBadge', 'SEM DADOS');
  setText('actionText', 'SEM ENTRADA');
  setText('explainText', message);
  setText('signalDirection', 'AGUARDAR');
  setText('probability', '--%');
  const badge = $('qualityBadge'); if (badge) badge.className = 'badge wait';
  const orb = $('signalOrb'); if (orb) orb.className = 'signal-orb wait';
}

function renderAnalysis(data) {
  const action = data.action || 'WAIT';
  const cls = action === 'CALL' ? 'call' : action === 'PUT' ? 'put' : 'wait';
  setText('chartBroker', `${data.broker_name || brokerNames[state.broker] || state.broker} • OTC`);
  setText('chartSymbol', data.symbol || state.symbol);
  setText('lastPrice', fmtPrice(data.price));
  setText('feedAge', data.feed_age_seconds == null ? 'feed sem idade' : `feed: ${data.feed_age_seconds}s`);
  setText('chartSource', data.provider || 'OTCharts read-only');
  setText('payoutValue', data.payout == null ? 'N/D' : `${Number(data.payout).toFixed(0)}%`);
  setText('breakevenValue', fmtPct(data.breakeven_probability, 2));
  setText('openStatus', data.market_open === false ? 'FECHADO' : data.market_open === true ? 'ABERTO' : 'N/D');
  setText('qualityBadge', data.quality || 'SEM ENTRADA');
  setText('signalDirection', action === 'CALL' ? 'ALTA / CALL' : action === 'PUT' ? 'BAIXA / PUT' : 'AGUARDAR');
  setText('probability', fmtPct(data.calibrated_probability ?? data.confidence_score));
  setText('probabilityLabel', data.calibrated_probability != null ? 'probabilidade calibrada' : 'confiança técnica');
  const cal = data.calibration || {};
  setText('calibratedValue', data.calibrated_probability != null
    ? `${fmtPct(data.calibrated_probability)} • n=${cal.samples ?? 0}`
    : `coletando • n=${cal.samples ?? 0}/${cal.min_samples ?? 50}`);
  setText('edgeValue', data.edge_pp == null ? '--' : `${Number(data.edge_pp) >= 0 ? '+' : ''}${Number(data.edge_pp).toFixed(2)} p.p.`);
  setText('evValue', data.expected_value_pct == null ? '--' : `${Number(data.expected_value_pct) >= 0 ? '+' : ''}${Number(data.expected_value_pct).toFixed(2)}%`);
  setText('actionText', action === 'CALL' ? 'ENTRADA DE ALTA' : action === 'PUT' ? 'ENTRADA DE BAIXA' : 'SEM ENTRADA');
  setText('explainText', (data.notes || []).slice(0, 4).join(' • ') || 'Condições técnicas processadas.');
  const badge = $('qualityBadge'); if (badge) badge.className = `badge ${cls}`;
  const orb = $('signalOrb'); if (orb) orb.className = `signal-orb ${cls}`;

  [['f1h', 's1h', '1h'], ['f5m', 's5m', '5m'], ['f1m', 's1m', '1m']].forEach(([trendId, scoreId, key]) => {
    const frame = data.frames?.[key];
    setText(trendId, frame?.trend || '--');
    setText(scoreId, frame ? `${Math.round(Number(frame.score || 0))} • ADX ${Number(frame.adx || 0).toFixed(0)}` : '--');
  });

  renderFilters(data);
  drawChart(data.candles?.[state.tf] || data.candles?.['1m'] || []);
  if ($('chartEmpty')) $('chartEmpty').hidden = Boolean(data.candles?.[state.tf]?.length || data.candles?.['1m']?.length);
}

function renderFilters(data) {
  const sr = data.support_resistance || {};
  const ageOk = data.feed_age_seconds != null && data.feed_age_seconds <= 150;
  const payoutOk = data.payout == null || Number(data.payout) >= Number($('minPayout')?.value || 80);
  const rows = [
    ['Feed recente', data.feed_age_seconds == null ? 'N/D' : `${ageOk ? 'OK' : 'ATRASADO'} • ${data.feed_age_seconds}s`, ageOk ? 'ok' : 'bad'],
    ['Mercado aberto', data.market_open === false ? 'NÃO' : data.market_open === true ? 'SIM' : 'N/D', data.market_open === false ? 'bad' : 'ok'],
    ['Payout', data.payout == null ? 'N/D' : `${Number(data.payout).toFixed(0)}%`, payoutOk ? 'ok' : 'bad'],
    ['Confluência H1 / 5M / 1M', data.aligned ? 'ALINHADA' : 'PARCIAL', data.aligned ? 'ok' : 'warn'],
    ['Distância do suporte', sr.support_distance_pct == null ? '--' : `${sr.support_distance_pct}%`, 'ok'],
    ['Distância da resistência', sr.resistance_distance_pct == null ? '--' : `${sr.resistance_distance_pct}%`, 'ok'],
    ['Calibração', data.calibration?.ready ? `PRONTA • n=${data.calibration.samples}` : `COLETANDO • n=${data.calibration?.samples ?? 0}`, data.calibration?.ready ? 'ok' : 'warn'],
  ];
  if ($('filterRows')) $('filterRows').innerHTML = rows.map(([label, value, cls]) =>
    `<div class="filter-row"><span>${escapeHtml(label)}</span><b class="${cls}">${escapeHtml(value)}</b></div>`
  ).join('');
}

function connectStream() {
  if (state.ws) { try { state.ws.close(); } catch {} state.ws = null; }
  if (!state.session || !state.symbol || state.broker === 'bullex') return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${proto}://${location.host}/ws/broker/${encodeURIComponent(state.broker)}/${encodeURIComponent(state.symbol)}?session=${encodeURIComponent(state.session)}`;
  const ws = new WebSocket(url);
  state.ws = ws;
  ws.onopen = () => setText('liveStatus', 'STREAM');
  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.event === 'error') {
        if (Number(message.data?.status) === 401) sessionExpired(message.data?.message || 'Sessão expirada.');
        else {
          setText('liveStatus', 'REST');
          setText('feedAge', message.data?.message || 'stream indisponível');
        }
        return;
      }
      const payload = message.data || message;
      const price = payload.price ?? payload.close ?? payload.c;
      if (price != null) {
        setText('lastPrice', fmtPrice(price));
        setText('feedAge', 'tick ao vivo');
        setText('liveStatus', 'AO VIVO');
      }
    } catch {}
  };
  ws.onerror = () => setText('liveStatus', 'REST');
  ws.onclose = () => {
    if (state.session && $('liveStatus')?.textContent === 'AO VIVO') setText('liveStatus', 'REST');
  };
}

async function loadHistory() {
  try {
    const broker = state.broker || $('brokerSelect')?.value || '';
    const params = new URLSearchParams({ limit: '100' });
    if (broker) params.set('broker', broker);
    const data = await api(`/api/history?${params}`);
    setText('resolved', data.resolved ?? 0);
    setText('wins', data.wins ?? 0);
    setText('losses', data.losses ?? 0);
    setText('accuracy', data.accuracy == null ? '--' : `${data.accuracy}%`);
    const recent = Array.isArray(data.recent) ? data.recent : [];
    if ($('recentMini')) $('recentMini').innerHTML = recent.slice(0, 5).map((row) =>
      `<div class="mini-row"><span>${escapeHtml(row.symbol)} • ${escapeHtml(row.action)}</span><span>${Math.round(Number(row.technical_score || 0))}%</span><b class="${String(row.status || '').toLowerCase()}">${escapeHtml(row.status)}</b></div>`
    ).join('') || '<div class="empty-state">Nenhum sinal registrado ainda.</div>';
    if ($('historyTable')) $('historyTable').innerHTML = recent.map((row) =>
      `<tr><td>${timeLocal(row.target_open_time)}</td><td>${escapeHtml(brokerNames[row.broker] || row.broker)}</td><td>${escapeHtml(String(row.market || '').toUpperCase())}</td><td>${escapeHtml(row.symbol)}</td><td class="action-${String(row.action || '').toLowerCase()}">${escapeHtml(row.action)}</td><td>${Number(row.technical_score || 0).toFixed(1)}%</td><td>${row.calibrated_probability == null ? '—' : Number(row.calibrated_probability).toFixed(1) + '%'}</td><td>${row.payout == null ? '—' : Number(row.payout).toFixed(0) + '%'}</td><td class="${String(row.status || '').toLowerCase()}">${escapeHtml(row.status)}</td></tr>`
    ).join('') || '<tr><td colspan="9">Ainda não há sinais registrados para esta corretora.</td></tr>';
    window.__history = recent;
  } catch (error) {
    if ($('historyTable')) $('historyTable').innerHTML = `<tr><td colspan="9">${escapeHtml(error.message)}</td></tr>`;
  }
}

async function loadCalibration() {
  try {
    const data = await api('/api/calibration');
    const rows = Array.isArray(data.rows) ? data.rows : [];
    if ($('calibrationTable')) $('calibrationTable').innerHTML = rows.map((row) =>
      `<tr><td>${escapeHtml(brokerNames[row.broker] || row.broker)}</td><td>${escapeHtml(String(row.market || '').toUpperCase())}</td><td>${escapeHtml(row.band)}</td><td>${row.samples}</td><td>${row.observed_rate == null ? '—' : row.observed_rate + '%'}</td><td>${row.posterior_probability == null ? '—' : row.posterior_probability + '%'}</td><td>${row.ci95_low == null ? '—' : `${row.ci95_low}%–${row.ci95_high}%`}</td><td class="${row.ready ? 'win' : 'pending'}">${row.ready ? 'CALIBRADA' : 'COLETANDO'}</td></tr>`
    ).join('') || '<tr><td colspan="8">Ainda não há amostra resolvida suficiente.</td></tr>';
  } catch (error) {
    if ($('calibrationTable')) $('calibrationTable').innerHTML = `<tr><td colspan="8">${escapeHtml(error.message)}</td></tr>`;
  }
}

function exportCSV() {
  const rows = window.__history || [];
  if (!rows.length) return showToast('Não há histórico para exportar.', 'warn');
  const head = ['target_open_time', 'broker', 'market', 'symbol', 'action', 'technical_score', 'calibrated_probability', 'payout', 'status', 'candle_open', 'candle_close'];
  const csv = [head.join(','), ...rows.map((row) => head.map((key) => JSON.stringify(row[key] ?? '')).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `binary-ai-lab-sinais-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderWatchlist() {
  const target = $('watchlist');
  if (!target) return;
  const open = state.symbols.filter((item) => item.open !== false).slice(0, 10);
  target.innerHTML = open.map((item, index) =>
    `<label class="watch-pill"><input type="checkbox" value="${escapeHtml(item.symbol)}" ${index < 5 ? 'checked' : ''}><span>${escapeHtml(item.name || item.symbol)}</span>${item.payout != null ? `<small>${Number(item.payout).toFixed(0)}%</small>` : ''}</label>`
  ).join('') || '<div class="empty-state">Nenhum ativo disponível no feed atual.</div>';
}

async function runScanner() {
  if (!state.session) {
    showToast('Conecte o Broker Feed antes de executar o scanner.', 'warn');
    switchView('settings');
    return;
  }
  const selected = [...$('watchlist').querySelectorAll('input:checked')].map((input) => input.value).slice(0, 10);
  if (!selected.length) return showToast('Selecione pelo menos um ativo.', 'warn');
  setDisabled('scanBtn', true);
  setText('scanBtn', 'Escaneando...');
  try {
    const params = new URLSearchParams({
      broker: state.broker,
      market: 'otc',
      session: state.session,
      symbols: selected.join(','),
      min_score: String(Number($('minScore')?.value || state.settings.score)),
      min_payout: String(Number($('minPayout')?.value || state.settings.payout)),
    });
    const data = await api(`/api/broker/scanner?${params}`);
    const rows = Array.isArray(data.rows) ? data.rows : [];
    if ($('scannerRows')) $('scannerRows').innerHTML = rows.map((row) => {
      const cls = row.action === 'CALL' ? 'call' : row.action === 'PUT' ? 'put' : 'wait';
      const score = row.calibrated_probability != null ? `${row.calibrated_probability}% calibrada` : `${row.confidence_score ?? '—'} score`;
      return `<div class="scanner-row"><b>${escapeHtml(row.symbol)}</b><span>${row.payout == null ? 'Payout N/D' : `Payout ${row.payout}%`}</span><span>${escapeHtml(score)}</span><span>${row.edge_pp == null ? 'Edge —' : `${row.edge_pp >= 0 ? '+' : ''}${row.edge_pp} p.p.`}</span><b class="${cls}">${escapeHtml(row.action || 'WAIT')}</b><span>${escapeHtml(row.error || row.quality || '')}</span></div>`;
    }).join('') || '<div class="empty-state">O scanner não retornou resultados.</div>';
  } catch (error) {
    if (error.status === 401) return sessionExpired(error.message);
    if ($('scannerRows')) $('scannerRows').innerHTML = `<div class="connection-result error">${escapeHtml(error.message)}</div>`;
  } finally {
    setText('scanBtn', 'Executar scanner');
    setDisabled('scanBtn', !state.session || !state.symbols.length);
  }
}

function clearChart() {
  const canvas = $('chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, canvas.clientWidth || 600);
  const height = 390;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#07121a';
  ctx.fillRect(0, 0, width, height);
}

function drawChart(candles) {
  const canvas = $('chart');
  if (!canvas) return;
  clearChart();
  if (!Array.isArray(candles) || !candles.length) return;
  const ctx = canvas.getContext('2d');
  const width = Math.max(1, canvas.clientWidth || 600);
  const height = 390;
  const rows = candles.slice(-90);
  const highs = rows.map((c) => Number(c.high));
  const lows = rows.map((c) => Number(c.low));
  const hi = Math.max(...highs);
  const lo = Math.min(...lows);
  const pad = (hi - lo) * 0.08 || Math.max(Math.abs(hi) * 0.001, 1e-6);
  const max = hi + pad;
  const min = lo - pad;
  const y = (price) => height - 24 - ((Number(price) - min) / (max - min)) * (height - 48);
  ctx.strokeStyle = '#17303e';
  ctx.lineWidth = 1;
  for (let i = 1; i < 6; i += 1) {
    const yy = i * height / 6;
    ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(width, yy); ctx.stroke();
  }
  const step = width / rows.length;
  const body = Math.max(2, Math.min(10, step * 0.58));
  rows.forEach((candle, index) => {
    const x = index * step + step / 2;
    const up = Number(candle.close) >= Number(candle.open);
    const color = up ? '#37dca7' : '#ff5f7a';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(x, y(candle.high)); ctx.lineTo(x, y(candle.low)); ctx.stroke();
    const top = Math.min(y(candle.open), y(candle.close));
    const h = Math.max(1, Math.abs(y(candle.open) - y(candle.close)));
    ctx.fillRect(x - body / 2, top, body, h);
  });
}

async function refreshDiagnostics() {
  try {
    const data = await api('/api/health');
    setText('diagVersion', data.version || '--');
    setText('diagDatabase', data.database || '--');
    setText('diagServer', data.ok ? 'online' : 'erro');
  } catch (error) {
    setText('diagServer', 'indisponível');
    setText('diagVersion', '--');
    setText('diagDatabase', '--');
  }
  setText('diagFeed', state.session ? 'conectado' : 'desconectado');
}

async function publicTest() {
  setDisabled('publicTestBtn', true);
  setText('publicTestBtn', 'Testando...');
  const result = $('publicTestResult');
  if (result) result.textContent = 'Consultando candles públicos e executando o motor 1H → 5M → 1M...';
  try {
    const data = await api('/api/public/analysis?symbol=BTC%2FUSD');
    if (result) {
      result.className = 'connection-result ok';
      result.textContent = `Motor OK • ${data.provider} • BTC/USD ${fmtPrice(data.price)} • ${data.action} • direção ${data.direction} • score ${data.confidence_score}%`;
    }
  } catch (error) {
    if (result) {
      result.className = 'connection-result error';
      result.textContent = `Teste público falhou: ${error.message}`;
    }
  } finally {
    setDisabled('publicTestBtn', false);
    setText('publicTestBtn', 'Testar motor com BTC/USD público');
  }
}

function updateCountdown() {
  const seconds = 60 - (Math.floor(Date.now() / 1000) % 60);
  setText('countdown', `00:${String(seconds % 60).padStart(2, '0')}`);
  setText('clock', new Date().toLocaleTimeString('pt-BR'));
  if (state.sessionExpiresAt && Date.now() > state.sessionExpiresAt) sessionExpired();
}

async function clearLegacyCache() {
  if ('serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister()));
    } catch {}
  }
  if ('caches' in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith('binary-ai-lab-')).map((key) => caches.delete(key)));
    } catch {}
  }
}

function bind() {
  document.querySelectorAll('.nav').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.view)));
  $('setupConnectBtn')?.addEventListener('click', () => switchView('settings'));
  $('connectBtn')?.addEventListener('click', connectBroker);
  $('disconnectBtn')?.addEventListener('click', disconnect);
  $('saveSettings')?.addEventListener('click', savePrefs);
  $('analyzeBtn')?.addEventListener('click', analyze);
  $('scanBtn')?.addEventListener('click', runScanner);
  $('exportBtn')?.addEventListener('click', exportCSV);
  $('publicTestBtn')?.addEventListener('click', publicTest);
  $('brokerSelect')?.addEventListener('change', loadSymbols);
  $('marketSelect')?.addEventListener('change', () => { state.market = 'otc'; });
  $('symbolSelect')?.addEventListener('change', () => { state.symbol = $('symbolSelect').value; setDisabled('analyzeBtn', !state.symbol); });
  $('minScore')?.addEventListener('change', () => { if ($('settingsScore')) $('settingsScore').value = $('minScore').value; });
  $('minPayout')?.addEventListener('change', () => { if ($('settingsPayout')) $('settingsPayout').value = $('minPayout').value; });
  document.querySelectorAll('.timeframes button').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.timeframes button').forEach((x) => x.classList.remove('active'));
    button.classList.add('active');
    state.tf = button.dataset.tf;
    if (state.analysis) {
      drawChart(state.analysis.candles?.[state.tf] || []);
      if ($('chartEmpty')) $('chartEmpty').hidden = Boolean(state.analysis.candles?.[state.tf]?.length);
    }
  }));
  $('notifyBtn')?.addEventListener('click', async () => {
    if (!('Notification' in window)) return showToast('Seu navegador não suporta notificações.', 'warn');
    const permission = await Notification.requestPermission();
    showToast(permission === 'granted' ? 'Alertas do navegador autorizados.' : 'Permissão de alertas não concedida.', permission === 'granted' ? 'ok' : 'warn');
  });
}

async function init() {
  loadPrefs();
  bind();
  switchView('dashboard');
  updateConnectionUI(false);
  resetAnalysis();
  await clearLegacyCache();
  await Promise.allSettled([refreshDiagnostics(), loadHistory(), loadCalibration()]);
  updateCountdown();
}

setInterval(updateCountdown, 1000);
window.addEventListener('resize', () => {
  if (state.analysis) drawChart(state.analysis.candles?.[state.tf] || []);
  else clearChart();
});
window.addEventListener('beforeunload', () => { if (state.ws) try { state.ws.close(); } catch {} });

document.addEventListener('DOMContentLoaded', init);
