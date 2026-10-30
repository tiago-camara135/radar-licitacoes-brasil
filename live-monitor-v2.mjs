import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || '';
const PNCP_BASE_URL = process.env.PNCP_BASE_URL || 'https://pncp.gov.br/api/consulta';
const NORMAL_INTERVAL_MS = 60_000;
const BACKOFF_INTERVAL_MS = 180_000;
const PAGE_SIZE = 50;
const CONCURRENCY = 3;

const pool = DATABASE_URL ? new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
  idleTimeoutMillis: 30_000
}) : null;

const memory = new Map();
const subscribers = new Set();
let timer = null;
let running = false;
let ready = false;
let baselineCompleted = false;
let totalStored = 0;
let lastScanAt = null;
let lastSuccessAt = null;
let lastDetectedAt = null;
let lastNewCount = 0;
let consecutiveFailures = 0;
let lastError = null;

const digits = v => String(v ?? '').replace(/\D/g, '');
const clean = (v, n = 500) => String(v ?? '').trim().slice(0, n);
const ymd = d => d.toISOString().slice(0, 10).replaceAll('-', '');
const validDate = v => {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};
const municipalityOf = x => x?.unidadeOrgao?.municipioNome || x?.unidadeOrgao?.nomeMunicipio || x?.municipioNome || '';
const closingOf = x => x?.dataEncerramentoProposta || x?.dataFimRecebimentoProposta || null;

function keyOf(x) {
  const id = clean(x?.numeroControlePNCP, 180);
  if (id) return id;
  return [digits(x?.orgaoEntidade?.cnpj), x?.anoCompra || '', x?.sequencialCompra || '', x?._modalidadeConsultada || ''].join('-');
}
function pncpUrl(x) {
  const cnpj = digits(x?.orgaoEntidade?.cnpj);
  const year = Number(x?.anoCompra);
  const seq = Number(x?.sequencialCompra);
  if (cnpj.length !== 14 || !Number.isInteger(year) || year < 2000 || !Number.isInteger(seq) || seq < 1) return '';
  return `https://pncp.gov.br/app/editais/${cnpj}/${year}/${seq}`;
}
function originUrl(x) {
  const raw = x?.linkSistemaOrigem || x?.linkProcessoEletronico || '';
  try { const u = new URL(raw); return ['http:', 'https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; }
}
function decorate(x, detectedAt = null) {
  return { ...x, _detectedAt: detectedAt || x?._detectedAt || null, _pncpUrl: pncpUrl(x), _originUrl: originUrl(x), _liveMonitor: true };
}

async function initStorage() {
  if (ready) return;
  if (pool) {
    await pool.query(`CREATE TABLE IF NOT EXISTS monitored_procurements(
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
    await pool.query('CREATE INDEX IF NOT EXISTS idx_monitored_detected ON monitored_procurements(detected_at DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_monitored_published ON monitored_procurements(published_at DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_monitored_location ON monitored_procurements(uf, municipality)');
    const r = await pool.query('SELECT COUNT(*)::int AS count FROM monitored_procurements');
    totalStored = Number(r.rows[0]?.count || 0);
    baselineCompleted = totalStored > 0;
  }
  ready = true;
  console.log(`live monitor storage ready: ${pool ? 'postgresql' : 'memory'} (${totalStored} stored)`);
}

async function fetchPage(code, date, page) {
  const params = new URLSearchParams({
    dataInicial: ymd(date),
    dataFinal: ymd(date),
    codigoModalidadeContratacao: String(code),
    pagina: String(page),
    tamanhoPagina: String(PAGE_SIZE)
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const r = await fetch(PNCP_BASE_URL + '/v1/contratacoes/publicacao?' + params.toString(), {
      headers: { accept: 'application/json', 'user-agent': 'RadarLicitacoesBrasil/2.0' },
      signal: controller.signal
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const body = await r.json();
    const data = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
    const totalPages = Math.max(1, Number(body?.totalPaginas || body?.totalPages || body?.totalDePaginas || 1) || 1);
    return { items: data.map(x => ({ ...x, _modalidadeConsultada: code })), totalPages };
  } catch (e) {
    throw new Error(`modalidade ${code}: ${e?.name === 'AbortError' ? 'timeout' : (e?.message || 'erro')}`);
  } finally { clearTimeout(timeout); }
}

async function fetchModality(code, date) {
  const first = await fetchPage(code, date, 1);
  if (first.totalPages === 1) return first.items;
  const pages = [first.totalPages];
  if (first.totalPages > 2) pages.push(first.totalPages - 1);
  const extra = [];
  for (const p of pages) {
    try { extra.push(...(await fetchPage(code, date, p)).items); }
    catch (e) { console.warn('live monitor partial:', e.message); }
  }
  return [...first.items, ...extra];
}

async function mapLimit(values, limit, worker) {
  const output = new Array(values.length);
  let cursor = 0;
  async function runner() {
    while (true) {
      const index = cursor++;
      if (index >= values.length) return;
      try { output[index] = { ok: true, value: await worker(values[index]) }; }
      catch (error) { output[index] = { ok: false, error }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, () => runner()));
  return output;
}

async function fetchRecent() {
  const today = new Date();
  const codes = Array.from({ length: 14 }, (_, i) => i + 1);
  const results = await mapLimit(codes, CONCURRENCY, code => fetchModality(code, today));
  const errors = results.filter(x => !x.ok).map(x => x.error?.message || 'erro');
  const flattened = results.flatMap(x => x.ok ? x.value : []);
  const seen = new Set();
  const items = flattened.filter(x => {
    const k = keyOf(x);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return !!x?.numeroControlePNCP && !!x?.objetoCompra && !!x?.orgaoEntidade?.razaoSocial;
  });
  items.sort((a, b) => (Date.parse(b.dataPublicacaoPncp || b.dataAtualizacao || 0) || 0) - (Date.parse(a.dataPublicacaoPncp || a.dataAtualizacao || 0) || 0));
  return { items, errors };
}

function dbValues(x) {
  const estimated = Number(x?.valorTotalEstimado);
  return [
    keyOf(x), digits(x?.orgaoEntidade?.cnpj).slice(0, 14) || null,
    Number.isInteger(Number(x?.anoCompra)) ? Number(x.anoCompra) : null,
    Number.isInteger(Number(x?.sequencialCompra)) ? Number(x.sequencialCompra) : null,
    Number.isInteger(Number(x?._modalidadeConsultada)) ? Number(x._modalidadeConsultada) : null,
    clean(x?.modalidadeNome, 180) || null, clean(x?.objetoCompra, 4000) || null,
    clean(x?.orgaoEntidade?.razaoSocial, 500) || null, clean(x?.unidadeOrgao?.nomeUnidade, 500) || null,
    clean(municipalityOf(x), 180) || null, clean(x?.unidadeOrgao?.ufSigla || x?.ufSigla, 2).toUpperCase() || null,
    clean(x?.orgaoEntidade?.poderId, 20) || null, clean(x?.orgaoEntidade?.esferaId, 20) || null,
    Number.isFinite(estimated) ? estimated : null, validDate(x?.dataPublicacaoPncp), validDate(closingOf(x)),
    pncpUrl(x) || null, originUrl(x) || null, JSON.stringify(x)
  ];
}

async function persist(items) {
  if (!items.length) return [];
  if (!pool) {
    const fresh = [];
    for (const x of items) if (!memory.has(keyOf(x))) {
      const t = new Date().toISOString(); memory.set(keyOf(x), decorate(x, t)); fresh.push(decorate(x, t));
    }
    totalStored = memory.size;
    return fresh;
  }
  const ids = items.map(keyOf);
  const knownResult = await pool.query('SELECT pncp_id FROM monitored_procurements WHERE pncp_id = ANY($1::text[])', [ids]);
  const known = new Set(knownResult.rows.map(r => r.pncp_id));
  const candidates = items.filter(x => !known.has(keyOf(x)));
  const fresh = [];
  for (const x of candidates) {
    const v = dbValues(x);
    const r = await pool.query(`INSERT INTO monitored_procurements(
      pncp_id,org_cnpj,year,sequence,modality_code,modality_name,object_text,org_name,unit_name,municipality,uf,power_id,sphere_id,estimated_value,published_at,closes_at,pncp_url,origin_url,raw
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
    ON CONFLICT(pncp_id) DO NOTHING RETURNING detected_at`, v);
    if (r.rows[0]) fresh.push(decorate(x, new Date(r.rows[0].detected_at).toISOString()));
  }
  totalStored += fresh.length;
  return fresh;
}

async function latest(limit = 40) {
  const n = Math.min(Math.max(Number(limit) || 40, 1), 100);
  if (!pool) return [...memory.values()].sort((a,b)=>Date.parse(b._detectedAt||0)-Date.parse(a._detectedAt||0)).slice(0,n);
  const r = await pool.query('SELECT raw,detected_at,pncp_url,origin_url FROM monitored_procurements ORDER BY detected_at DESC LIMIT $1',[n]);
  return r.rows.map(row => ({ ...(row.raw || {}), _detectedAt:new Date(row.detected_at).toISOString(), _pncpUrl:row.pncp_url || pncpUrl(row.raw||{}), _originUrl:row.origin_url || originUrl(row.raw||{}), _liveMonitor:true }));
}

function status() {
  return { enabled:true, storage:pool?'postgresql':'temporary-memory', interval_seconds:Math.round((consecutiveFailures?BACKOFF_INTERVAL_MS:NORMAL_INTERVAL_MS)/1000), running, baseline_completed:baselineCompleted, last_scan_at:lastScanAt, last_success_at:lastSuccessAt, last_detected_at:lastDetectedAt, last_new_count:lastNewCount, total_stored:totalStored, subscribers:subscribers.size, consecutive_failures:consecutiveFailures, last_error:lastError };
}
function broadcast(event,data){const packet=`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;for(const res of [...subscribers]){try{res.write(packet)}catch{subscribers.delete(res)}}}

async function scan() {
  if (running) return;
  running = true; lastScanAt = new Date().toISOString();
  try {
    await initStorage();
    const wasBaseline = !baselineCompleted;
    const result = await fetchRecent();
    if (result.errors.length === 14) throw new Error(`PNCP falhou em todas as modalidades: ${result.errors.slice(0,3).join(' | ')}`);
    const fresh = await persist(result.items);
    lastSuccessAt = new Date().toISOString(); consecutiveFailures = 0; lastError = null; lastNewCount = fresh.length;
    if (wasBaseline) {
      baselineCompleted = true; lastNewCount = 0;
      console.log(`live monitor baseline ready: ${result.items.length} scanned, ${totalStored} stored, ${result.errors.length} modality errors`);
    } else if (fresh.length) {
      lastDetectedAt = new Date().toISOString();
      console.log(`live monitor detected ${fresh.length} new procurement(s)`);
      broadcast('procurement',{items:fresh.slice(0,50),detected_at:lastDetectedAt});
    }
    broadcast('status',status());
  } catch (e) {
    consecutiveFailures += 1; lastError = clean(e?.message || 'falha no monitor', 500);
    console.error('live monitor error:', lastError); broadcast('status',status());
  } finally { running = false; schedule(); }
}
function schedule(){if(timer)clearTimeout(timer);timer=setTimeout(scan,consecutiveFailures?BACKOFF_INTERVAL_MS:NORMAL_INTERVAL_MS);timer.unref?.()}

export async function initLiveMonitor(){await initStorage();if(!timer&&!running){timer=setTimeout(scan,7000);timer.unref?.()}}

function common(res,type='application/json; charset=utf-8'){res.setHeader('Content-Type',type);res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin')}
export async function handleLiveRoute(req,res,url){
  if(req.method==='GET'&&url.pathname==='/api/live-feed'){common(res);res.statusCode=200;res.end(JSON.stringify({source:'PNCP-live-monitor-v2',items:await latest(url.searchParams.get('limit')||40),status:status(),fetched_at:new Date().toISOString()}));return true}
  if(req.method==='GET'&&url.pathname==='/api/live-status'){common(res);res.statusCode=200;res.end(JSON.stringify({status:status()}));return true}
  if(req.method==='GET'&&url.pathname==='/api/live-events'){
    common(res,'text/event-stream; charset=utf-8');res.setHeader('Connection','keep-alive');res.setHeader('X-Accel-Buffering','no');res.statusCode=200;res.flushHeaders?.();subscribers.add(res);res.write(`retry: 5000\nevent: status\ndata: ${JSON.stringify(status())}\n\n`);
    const hb=setInterval(()=>{try{res.write(`: heartbeat ${Date.now()}\n\n`)}catch{clearInterval(hb);subscribers.delete(res)}},20000);hb.unref?.();req.on('close',()=>{clearInterval(hb);subscribers.delete(res)});return true
  }
  return false;
}
