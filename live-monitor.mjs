import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || '';
const PNCP_BASE_URL = process.env.PNCP_BASE_URL || 'https://pncp.gov.br/api/consulta';
const NORMAL_INTERVAL_MS = 60_000;
const BACKOFF_INTERVAL_MS = 180_000;
const PAGE_SIZE = 50;

const livePool = DATABASE_URL ? new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
  idleTimeoutMillis: 30_000
}) : null;

const memoryItems = new Map();
const subscribers = new Set();
let timer = null;
let running = false;
let initialized = false;
let baselineCompleted = false;
let lastScanAt = null;
let lastSuccessAt = null;
let lastDetectedAt = null;
let lastNewCount = 0;
let totalStored = 0;
let consecutiveFailures = 0;
let lastError = null;

const digits = v => String(v ?? '').replace(/\D/g, '');
const clean = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const ymd = d => d.toISOString().slice(0, 10).replaceAll('-', '');

function municipalityOf(x) {
  return x?.unidadeOrgao?.municipioNome || x?.unidadeOrgao?.nomeMunicipio || x?.municipioNome || '';
}
function closingOf(x) {
  return x?.dataEncerramentoProposta || x?.dataFimRecebimentoProposta || null;
}
function officialPncpUrl(x) {
  const cnpj = digits(x?.orgaoEntidade?.cnpj);
  const year = Number(x?.anoCompra);
  const seq = Number(x?.sequencialCompra);
  if (cnpj.length !== 14 || !Number.isInteger(year) || year < 2000 || !Number.isInteger(seq) || seq < 1) return '';
  return `https://pncp.gov.br/app/editais/${cnpj}/${year}/${seq}`;
}
function keyOf(x) {
  const id = clean(x?.numeroControlePNCP, 180);
  if (id) return id;
  const cnpj = digits(x?.orgaoEntidade?.cnpj);
  const year = Number(x?.anoCompra) || '';
  const seq = Number(x?.sequencialCompra) || '';
  const mod = Number(x?._modalidadeConsultada) || '';
  return [cnpj, year, seq, mod].join('-');
}
function sourceUrlOf(x) {
  const raw = x?.linkSistemaOrigem || x?.linkProcessoEletronico || '';
  try {
    const u = new URL(raw);
    return ['http:', 'https:'].includes(u.protocol) ? u.href : '';
  } catch { return ''; }
}
function publicItem(x, detectedAt = null) {
  return {
    ...x,
    _detectedAt: detectedAt || x?._detectedAt || null,
    _pncpUrl: officialPncpUrl(x),
    _originUrl: sourceUrlOf(x),
    _liveMonitor: true
  };
}

async function initStorage() {
  if (initialized) return;
  if (livePool) {
    await livePool.query(`CREATE TABLE IF NOT EXISTS monitored_procurements(
      pncp_id TEXT PRIMARY KEY,
      org_cnpj TEXT,
      year INTEGER,
      sequence INTEGER,
      modality_code INTEGER,
      modality_name TEXT,
      object_text TEXT,
      org_name TEXT,
      unit_name TEXT,
      municipality TEXT,
      uf TEXT,
      power_id TEXT,
      sphere_id TEXT,
      estimated_value NUMERIC(18,2),
      published_at TIMESTAMPTZ,
      closes_at TIMESTAMPTZ,
      pncp_url TEXT,
      origin_url TEXT,
      raw JSONB NOT NULL,
      detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await livePool.query('CREATE INDEX IF NOT EXISTS idx_monitored_detected ON monitored_procurements(detected_at DESC)');
    await livePool.query('CREATE INDEX IF NOT EXISTS idx_monitored_published ON monitored_procurements(published_at DESC)');
    await livePool.query('CREATE INDEX IF NOT EXISTS idx_monitored_location ON monitored_procurements(uf, municipality)');
    const r = await livePool.query('SELECT COUNT(*)::int AS count FROM monitored_procurements');
    totalStored = Number(r.rows[0]?.count || 0);
    baselineCompleted = totalStored > 0;
  }
  initialized = true;
}

async function fetchPage(code, start, end, page) {
  const p = new URLSearchParams({
    dataInicial: ymd(start),
    dataFinal: ymd(end),
    codigoModalidadeContratacao: String(code),
    pagina: String(page),
    tamanhoPagina: String(PAGE_SIZE)
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const r = await fetch(PNCP_BASE_URL + '/v1/contratacoes/publicacao?' + p, {
      headers: { accept: 'application/json', 'user-agent': 'RadarLicitacoesBrasil-Live/1.0' },
      signal: controller.signal
    });
    if (!r.ok) throw new Error(`PNCP ${r.status} modalidade ${code}`);
    const d = await r.json();
    const items = Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : [];
    const totalPages = Number(d?.totalPaginas || d?.totalPages || d?.totalDePaginas || 1) || 1;
    return { items: items.map(x => ({ ...x, _modalidadeConsultada: code })), totalPages };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchModality(code, start, end) {
  const first = await fetchPage(code, start, end, 1);
  if (first.totalPages <= 1) return first.items;
  const pages = new Set([1, first.totalPages]);
  if (first.totalPages > 2) pages.add(first.totalPages - 1);
  const extra = await Promise.all([...pages].filter(p => p !== 1).map(p => fetchPage(code, start, end, p).catch(() => ({ items: [] }))));
  return [first.items, ...extra.map(x => x.items)].flat();
}

async function fetchRecentPncp() {
  const end = new Date();
  const start = new Date(end.getTime() - 26 * 60 * 60 * 1000);
  const codes = Array.from({ length: 14 }, (_, i) => i + 1);
  const settled = await Promise.allSettled(codes.map(code => fetchModality(code, start, end)));
  const failures = settled.filter(x => x.status === 'rejected').length;
  const items = settled.flatMap(x => x.status === 'fulfilled' ? x.value : []);
  const seen = new Set();
  const unique = items.filter(x => {
    const k = keyOf(x);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return !!x?.numeroControlePNCP && !!x?.objetoCompra && !!x?.orgaoEntidade?.razaoSocial;
  });
  unique.sort((a, b) => (Date.parse(b.dataPublicacaoPncp || b.dataAtualizacao || 0) || 0) - (Date.parse(a.dataPublicacaoPncp || a.dataAtualizacao || 0) || 0));
  return { items: unique, failures, totalModalities: codes.length };
}

function insertValues(x) {
  const cnpj = digits(x?.orgaoEntidade?.cnpj).slice(0, 14) || null;
  const year = Number.isInteger(Number(x?.anoCompra)) ? Number(x.anoCompra) : null;
  const sequence = Number.isInteger(Number(x?.sequencialCompra)) ? Number(x.sequencialCompra) : null;
  const modalityCode = Number.isInteger(Number(x?._modalidadeConsultada)) ? Number(x._modalidadeConsultada) : null;
  const estimated = Number(x?.valorTotalEstimado);
  return [
    keyOf(x), cnpj, year, sequence, modalityCode,
    clean(x?.modalidadeNome, 180) || null,
    clean(x?.objetoCompra, 4000) || null,
    clean(x?.orgaoEntidade?.razaoSocial, 500) || null,
    clean(x?.unidadeOrgao?.nomeUnidade, 500) || null,
    clean(municipalityOf(x), 180) || null,
    clean(x?.unidadeOrgao?.ufSigla || x?.ufSigla, 2).toUpperCase() || null,
    clean(x?.orgaoEntidade?.poderId, 20) || null,
    clean(x?.orgaoEntidade?.esferaId, 20) || null,
    Number.isFinite(estimated) ? estimated : null,
    x?.dataPublicacaoPncp || null,
    closingOf(x),
    officialPncpUrl(x) || null,
    sourceUrlOf(x) || null,
    JSON.stringify(x)
  ];
}

async function persist(items) {
  if (!items.length) return [];
  if (!livePool) {
    const fresh = [];
    for (const x of items) {
      const k = keyOf(x);
      if (!memoryItems.has(k)) {
        const detectedAt = new Date().toISOString();
        memoryItems.set(k, publicItem(x, detectedAt));
        fresh.push(publicItem(x, detectedAt));
      }
    }
    totalStored = memoryItems.size;
    return fresh;
  }

  const ids = items.map(keyOf).filter(Boolean);
  const knownRows = await livePool.query('SELECT pncp_id FROM monitored_procurements WHERE pncp_id = ANY($1::text[])', [ids]);
  const known = new Set(knownRows.rows.map(r => r.pncp_id));
  const freshSource = items.filter(x => !known.has(keyOf(x)));
  if (!freshSource.length) return [];

  const fresh = [];
  for (let i = 0; i < freshSource.length; i += 30) {
    const chunk = freshSource.slice(i, i + 30);
    const params = [];
    const rows = chunk.map((x, rowIndex) => {
      const vals = insertValues(x);
      params.push(...vals);
      const base = rowIndex * vals.length;
      const marks = vals.map((_, j) => `$${base + j + 1}`);
      return `(${marks.join(',')})`;
    });
    const q = `INSERT INTO monitored_procurements(
      pncp_id,org_cnpj,year,sequence,modality_code,modality_name,object_text,org_name,unit_name,municipality,uf,power_id,sphere_id,estimated_value,published_at,closes_at,pncp_url,origin_url,raw
    ) VALUES ${rows.join(',')} ON CONFLICT(pncp_id) DO NOTHING RETURNING pncp_id,detected_at`;
    const inserted = await livePool.query(q, params);
    const detected = new Map(inserted.rows.map(r => [r.pncp_id, r.detected_at]));
    for (const x of chunk) {
      const d = detected.get(keyOf(x));
      if (d) fresh.push(publicItem(x, new Date(d).toISOString()));
    }
  }
  totalStored += fresh.length;
  return fresh;
}

async function listLatest(limit = 40) {
  const safeLimit = Math.min(Math.max(Number(limit) || 40, 1), 100);
  if (!livePool) {
    return [...memoryItems.values()].sort((a, b) => Date.parse(b._detectedAt || 0) - Date.parse(a._detectedAt || 0)).slice(0, safeLimit);
  }
  const r = await livePool.query(`SELECT raw,detected_at,pncp_url,origin_url FROM monitored_procurements ORDER BY detected_at DESC LIMIT $1`, [safeLimit]);
  return r.rows.map(row => ({
    ...(row.raw || {}),
    _detectedAt: new Date(row.detected_at).toISOString(),
    _pncpUrl: row.pncp_url || officialPncpUrl(row.raw || {}),
    _originUrl: row.origin_url || sourceUrlOf(row.raw || {}),
    _liveMonitor: true
  }));
}

function statusPayload() {
  return {
    enabled: true,
    storage: livePool ? 'postgresql' : 'temporary-memory',
    interval_seconds: Math.round((consecutiveFailures ? BACKOFF_INTERVAL_MS : NORMAL_INTERVAL_MS) / 1000),
    running,
    baseline_completed: baselineCompleted,
    last_scan_at: lastScanAt,
    last_success_at: lastSuccessAt,
    last_detected_at: lastDetectedAt,
    last_new_count: lastNewCount,
    total_stored: totalStored,
    subscribers: subscribers.size,
    consecutive_failures: consecutiveFailures,
    last_error: lastError
  };
}

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of [...subscribers]) {
    try { res.write(payload); }
    catch { subscribers.delete(res); }
  }
}

async function scan() {
  if (running) return;
  running = true;
  lastScanAt = new Date().toISOString();
  try {
    await initStorage();
    const baselineBeforeScan = !baselineCompleted;
    const result = await fetchRecentPncp();
    if (result.failures >= Math.ceil(result.totalModalities * 0.6)) throw new Error(`PNCP indisponível em ${result.failures}/${result.totalModalities} modalidades`);
    const fresh = await persist(result.items);
    lastSuccessAt = new Date().toISOString();
    lastNewCount = fresh.length;
    lastError = null;
    consecutiveFailures = 0;

    if (baselineBeforeScan) {
      baselineCompleted = true;
      lastNewCount = 0;
    } else if (fresh.length) {
      lastDetectedAt = new Date().toISOString();
      broadcast('procurement', { items: fresh.slice(0, 50), detected_at: lastDetectedAt });
    }
    broadcast('status', statusPayload());
  } catch (e) {
    consecutiveFailures += 1;
    lastError = clean(e?.message || 'Falha no monitor', 300);
    broadcast('status', statusPayload());
    console.error('live monitor error:', lastError);
  } finally {
    running = false;
    scheduleNext();
  }
}

function scheduleNext() {
  if (timer) clearTimeout(timer);
  const delay = consecutiveFailures ? BACKOFF_INTERVAL_MS : NORMAL_INTERVAL_MS;
  timer = setTimeout(scan, delay);
  timer.unref?.();
}

export async function initLiveMonitor() {
  await initStorage();
  if (!timer && !running) {
    timer = setTimeout(scan, 8_000);
    timer.unref?.();
  }
}

function setCommonHeaders(res, type = 'application/json; charset=utf-8') {
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

export async function handleLiveRoute(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/live-feed') {
    setCommonHeaders(res);
    const items = await listLatest(url.searchParams.get('limit') || 40);
    res.statusCode = 200;
    res.end(JSON.stringify({ source: 'PNCP-live-monitor', items, status: statusPayload(), fetched_at: new Date().toISOString() }));
    return true;
  }
  if (req.method === 'GET' && url.pathname === '/api/live-status') {
    setCommonHeaders(res);
    res.statusCode = 200;
    res.end(JSON.stringify({ status: statusPayload() }));
    return true;
  }
  if (req.method === 'GET' && url.pathname === '/api/live-events') {
    setCommonHeaders(res, 'text/event-stream; charset=utf-8');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.statusCode = 200;
    res.flushHeaders?.();
    subscribers.add(res);
    res.write(`retry: 5000\nevent: status\ndata: ${JSON.stringify(statusPayload())}\n\n`);
    const heartbeat = setInterval(() => {
      try { res.write(`: heartbeat ${Date.now()}\n\n`); }
      catch { clearInterval(heartbeat); subscribers.delete(res); }
    }, 20_000);
    heartbeat.unref?.();
    req.on('close', () => {
      clearInterval(heartbeat);
      subscribers.delete(res);
    });
    return true;
  }
  return false;
}
