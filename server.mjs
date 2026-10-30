import http from 'node:http';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';

const PORT = Number(process.env.PORT || 10000);
const DATABASE_URL = process.env.DATABASE_URL || '';
const APP_ORIGIN = process.env.APP_ORIGIN || '';
const PNCP_BASE_URL = process.env.PNCP_BASE_URL || 'https://pncp.gov.br/api/consulta';
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '');
const IS_PROD = process.env.NODE_ENV === 'production';
const INDEX = readFileSync(new URL('./app.html', import.meta.url), 'utf8');

const rate = new Map();
const searchCache = new Map();
const mem = {
  users: [], sessions: new Map(), docs: [], alerts: [], audit: [],
  nextUser: 1, nextDoc: 1, nextAlert: 1, nextAudit: 1
};
let pool = null;

if (DATABASE_URL) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 8,
    idleTimeoutMillis: 30000
  });
}

function rateLimit(key, limit = 120, windowMs = 60_000) {
  const now = Date.now();
  const item = rate.get(key);
  if (!item || now - item.start > windowMs) {
    rate.set(key, { start: now, count: 1 });
    return true;
  }
  item.count += 1;
  return item.count <= limit;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rate) if (now - v.start > 120_000) rate.delete(k);
  for (const [k, v] of searchCache) if (now - v.at > 180_000) searchCache.delete(k);
}, 60_000).unref();

function headers(res, type = 'application/json; charset=utf-8') {
  res.setHeader('Content-Type', type);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cache-Control', 'no-store');
  if (IS_PROD) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
}
function sendJson(res, status, data) { headers(res); res.statusCode = status; res.end(JSON.stringify(data)); }
function sendText(res, status, body, type = 'text/html; charset=utf-8') { headers(res, type); res.statusCode = status; res.end(body); }
function parseCookies(req) {
  const out = {};
  for (const p of String(req.headers.cookie || '').split(';')) {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  }
  return out;
}
async function readJson(req, max = 2_000_000) {
  let size = 0; const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > max) throw Object.assign(new Error('Payload muito grande'), { status: 413 });
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('JSON inválido'), { status: 400 }); }
}
function emailOf(v) {
  const e = String(v || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254 ? e : null;
}
function validPassword(v) { return typeof v === 'string' && v.length >= 10 && v.length <= 200; }
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
function verifyPassword(password, stored) {
  try {
    const [kind, saltHex, hashHex] = String(stored).split('$');
    if (kind !== 'scrypt') return false;
    const a = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
    const b = Buffer.from(hashHex, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}
const tokenHash = t => crypto.createHash('sha256').update(t).digest('hex');
const clean = (v, max = 180) => String(v ?? '').trim().slice(0, max);
const digits = v => String(v ?? '').replace(/\D/g, '');
const textNorm = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const asMoney = v => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const asInt = v => {
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
};

async function initDb() {
  if (!pool) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS users(
    id BIGSERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK(role IN('admin','user')),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS sessions(
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS alert_preferences(
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    uf TEXT,
    keyword TEXT,
    modality_code INTEGER,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS saved_alerts(
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    keyword TEXT,
    uf TEXT,
    municipality TEXT,
    municipality_ibge TEXT,
    modality_code INTEGER,
    org_name TEXT,
    org_cnpj TEXT,
    min_value NUMERIC(18,2),
    max_value NUMERIC(18,2),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS documents(
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    content BYTEA NOT NULL,
    size_bytes INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS audit_logs(
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_saved_alerts_user ON saved_alerts(user_id, enabled)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC)');
  await pool.query('DELETE FROM sessions WHERE expires_at < NOW()');
}

async function audit(userId, action, metadata = {}, ip = null) {
  try {
    if (pool) {
      await pool.query('INSERT INTO audit_logs(user_id,action,metadata,ip) VALUES($1,$2,$3,$4)', [userId || null, action, metadata, ip]);
    } else {
      mem.audit.unshift({ id: mem.nextAudit++, user_id: userId || null, action, metadata, ip, created_at: new Date().toISOString() });
      mem.audit = mem.audit.slice(0, 500);
    }
  } catch (e) { console.error('audit error', e.message); }
}

async function registerUser(email, password) {
  const role = ADMIN_EMAIL && email === ADMIN_EMAIL ? 'admin' : 'user';
  if (pool) {
    const r = await pool.query('INSERT INTO users(email,password_hash,role) VALUES($1,$2,$3) RETURNING id,email,role,active,created_at', [email, hashPassword(password), role]);
    return r.rows[0];
  }
  if (mem.users.some(u => u.email === email)) throw Object.assign(new Error('Este e-mail já está cadastrado.'), { status: 409 });
  const user = { id: mem.nextUser++, email, password_hash: hashPassword(password), role, active: true, created_at: new Date().toISOString() };
  mem.users.push(user);
  return publicUser(user);
}
async function findLogin(email) {
  if (pool) {
    const r = await pool.query('SELECT * FROM users WHERE email=$1 AND active=TRUE LIMIT 1', [email]);
    return r.rows[0] || null;
  }
  return mem.users.find(u => u.email === email && u.active) || null;
}
async function ensureAdminUser(email, password) {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) return null;
  if (pool) {
    const r = await pool.query(`INSERT INTO users(email,password_hash,role,active)
      VALUES($1,$2,'admin',TRUE)
      ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash,role='admin',active=TRUE
      RETURNING *`, [ADMIN_EMAIL, hashPassword(ADMIN_PASSWORD)]);
    return r.rows[0];
  }
  let u = mem.users.find(x => x.email === ADMIN_EMAIL);
  if (!u) {
    u = { id: mem.nextUser++, email: ADMIN_EMAIL, password_hash: hashPassword(ADMIN_PASSWORD), role: 'admin', active: true, created_at: new Date().toISOString() };
    mem.users.push(u);
  } else {
    u.password_hash = hashPassword(ADMIN_PASSWORD); u.role = 'admin'; u.active = true;
  }
  return u;
}
function publicUser(u) { return { id: u.id, email: u.email, role: u.role, active: u.active, created_at: u.created_at }; }
async function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const hash = tokenHash(token);
  const expires = new Date(Date.now() + 48 * 3600_000);
  if (pool) await pool.query('INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,$3)', [userId, hash, expires]);
  else mem.sessions.set(hash, { userId, expires });
  res.setHeader('Set-Cookie', 'radar_session=' + encodeURIComponent(token) + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=172800' + (IS_PROD ? '; Secure' : ''));
}
async function currentUser(req) {
  const token = parseCookies(req).radar_session;
  if (!token) return null;
  const hash = tokenHash(token);
  if (pool) {
    const r = await pool.query(`SELECT u.id,u.email,u.role,u.active,u.created_at
      FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.active=TRUE LIMIT 1`, [hash]);
    return r.rows[0] || null;
  }
  const s = mem.sessions.get(hash);
  if (!s || s.expires < Date.now()) { mem.sessions.delete(hash); return null; }
  const u = mem.users.find(x => x.id === s.userId && x.active);
  return u ? publicUser(u) : null;
}
async function logout(req) {
  const token = parseCookies(req).radar_session;
  if (!token) return;
  const h = tokenHash(token);
  if (pool) await pool.query('DELETE FROM sessions WHERE token_hash=$1', [h]);
  else mem.sessions.delete(h);
}

function ymd(d) { return d.toISOString().slice(0, 10).replaceAll('-', ''); }
function municipalityOf(x) {
  return x?.unidadeOrgao?.municipioNome || x?.unidadeOrgao?.nomeMunicipio || x?.municipioNome || '';
}
function orgOf(x) { return x?.orgaoEntidade?.razaoSocial || ''; }
function closingOf(x) { return x?.dataEncerramentoProposta || x?.dataFimRecebimentoProposta || null; }
function resultKey(x) { return x.numeroControlePNCP || `${x.orgaoEntidade?.cnpj || ''}-${x.anoCompra || ''}-${x.sequencialCompra || ''}-${x._modalidadeConsultada || ''}`; }

async function pncpSearch(filters = {}) {
  const normalized = {
    keyword: clean(filters.keyword, 180),
    uf: clean(filters.uf, 2).toUpperCase(),
    municipality: clean(filters.municipality, 120),
    municipalityIbge: digits(filters.municipalityIbge).slice(0, 7),
    modality: asInt(filters.modality),
    org: clean(filters.org, 180),
    cnpj: digits(filters.cnpj).slice(0, 14),
    minValue: asMoney(filters.minValue),
    maxValue: asMoney(filters.maxValue),
    openOnly: filters.openOnly === true || String(filters.openOnly) === 'true',
    days: Math.min(Math.max(Number(filters.days) || 7, 1), 30),
    order: ['newest', 'value_desc', 'value_asc', 'deadline'].includes(filters.order) ? filters.order : 'newest'
  };
  if (normalized.uf && !/^[A-Z]{2}$/.test(normalized.uf)) normalized.uf = '';
  if (normalized.cnpj.length !== 14) normalized.cnpj = '';
  if (normalized.municipalityIbge && normalized.municipalityIbge.length !== 7) normalized.municipalityIbge = '';
  if (normalized.modality && (normalized.modality < 1 || normalized.modality > 14)) normalized.modality = null;

  const cacheKey = JSON.stringify(normalized);
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 120_000) return cached.items;

  const end = new Date();
  const start = new Date(end.getTime() - normalized.days * 86400000);
  const codes = normalized.modality ? [normalized.modality] : Array.from({ length: 14 }, (_, i) => i + 1);
  const groups = await Promise.all(codes.map(async code => {
    const p = new URLSearchParams({
      dataInicial: ymd(start), dataFinal: ymd(end), codigoModalidadeContratacao: String(code), pagina: '1', tamanhoPagina: '50'
    });
    if (normalized.uf) p.set('uf', normalized.uf);
    if (normalized.municipalityIbge) p.set('codigoMunicipioIbge', normalized.municipalityIbge);
    if (normalized.cnpj) p.set('cnpj', normalized.cnpj);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    try {
      const r = await fetch(PNCP_BASE_URL + '/v1/contratacoes/publicacao?' + p, {
        headers: { accept: 'application/json', 'user-agent': 'RadarLicitacoesBrasil/2.0' }, signal: controller.signal
      });
      if (!r.ok) return [];
      const d = await r.json();
      const items = Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : [];
      return items.map(x => ({ ...x, _modalidadeConsultada: code }));
    } catch { return []; }
    finally { clearTimeout(timer); }
  }));

  const q = textNorm(normalized.keyword);
  const oq = textNorm(normalized.org);
  const mq = textNorm(normalized.municipality);
  const now = Date.now();
  let all = groups.flat();
  if (q) all = all.filter(x => textNorm([x.objetoCompra, x.informacaoComplementar, orgOf(x), x.unidadeOrgao?.nomeUnidade].filter(Boolean).join(' ')).includes(q));
  if (oq) all = all.filter(x => textNorm([orgOf(x), x.unidadeOrgao?.nomeUnidade].filter(Boolean).join(' ')).includes(oq));
  if (mq) all = all.filter(x => textNorm(municipalityOf(x)).includes(mq));
  if (normalized.minValue !== null) all = all.filter(x => Number(x.valorTotalEstimado) >= normalized.minValue);
  if (normalized.maxValue !== null) all = all.filter(x => Number(x.valorTotalEstimado) <= normalized.maxValue);
  if (normalized.openOnly) all = all.filter(x => {
    const c = closingOf(x); if (!c) return false;
    const t = Date.parse(c); return Number.isFinite(t) && t >= now;
  });

  const seen = new Set();
  all = all.filter(x => { const k = resultKey(x); if (seen.has(k)) return false; seen.add(k); return true; });
  const pubTs = x => Date.parse(x.dataPublicacaoPncp || x.dataAtualizacao || 0) || 0;
  if (normalized.order === 'value_desc') all.sort((a, b) => Number(b.valorTotalEstimado || 0) - Number(a.valorTotalEstimado || 0));
  else if (normalized.order === 'value_asc') all.sort((a, b) => Number(a.valorTotalEstimado || 0) - Number(b.valorTotalEstimado || 0));
  else if (normalized.order === 'deadline') all.sort((a, b) => (Date.parse(closingOf(a)) || Infinity) - (Date.parse(closingOf(b)) || Infinity));
  else all.sort((a, b) => pubTs(b) - pubTs(a));
  all = all.slice(0, 300);
  searchCache.set(cacheKey, { at: Date.now(), items: all });
  return all;
}

function normalizeAlertBody(b) {
  const uf = clean(b.uf, 2).toUpperCase();
  const modality = b.modality_code === '' || b.modality_code === null || b.modality_code === undefined ? null : asInt(b.modality_code);
  const cnpj = digits(b.org_cnpj).slice(0, 14);
  const ibge = digits(b.municipality_ibge).slice(0, 7);
  if (uf && !/^[A-Z]{2}$/.test(uf)) throw Object.assign(new Error('UF inválida.'), { status: 400 });
  if (modality !== null && (modality < 1 || modality > 14)) throw Object.assign(new Error('Modalidade inválida.'), { status: 400 });
  if (cnpj && cnpj.length !== 14) throw Object.assign(new Error('CNPJ deve ter 14 dígitos.'), { status: 400 });
  if (ibge && ibge.length !== 7) throw Object.assign(new Error('Código IBGE deve ter 7 dígitos.'), { status: 400 });
  const min = asMoney(b.min_value), max = asMoney(b.max_value);
  if (min !== null && max !== null && min > max) throw Object.assign(new Error('Valor mínimo não pode ser maior que o máximo.'), { status: 400 });
  return {
    name: clean(b.name, 80) || 'Meu alerta', keyword: clean(b.keyword, 180) || null,
    uf: uf || null, municipality: clean(b.municipality, 120) || null, municipality_ibge: ibge || null,
    modality_code: modality, org_name: clean(b.org_name, 180) || null, org_cnpj: cnpj || null,
    min_value: min, max_value: max, enabled: b.enabled !== false
  };
}
async function listAlerts(userId) {
  if (pool) {
    const r = await pool.query('SELECT * FROM saved_alerts WHERE user_id=$1 ORDER BY id DESC', [userId]);
    return r.rows;
  }
  return mem.alerts.filter(a => a.user_id === Number(userId)).sort((a, b) => b.id - a.id);
}
async function createAlert(userId, b) {
  const a = normalizeAlertBody(b);
  const existing = await listAlerts(userId);
  if (existing.length >= 20) throw Object.assign(new Error('Limite de 20 alertas por usuário.'), { status: 400 });
  if (pool) {
    const r = await pool.query(`INSERT INTO saved_alerts(user_id,name,keyword,uf,municipality,municipality_ibge,modality_code,org_name,org_cnpj,min_value,max_value,enabled)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [userId, a.name, a.keyword, a.uf, a.municipality, a.municipality_ibge, a.modality_code, a.org_name, a.org_cnpj, a.min_value, a.max_value, a.enabled]);
    return r.rows[0];
  }
  const row = { id: mem.nextAlert++, user_id: Number(userId), ...a, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  mem.alerts.push(row); return row;
}
async function patchAlert(userId, id, b) {
  const current = (await listAlerts(userId)).find(a => Number(a.id) === Number(id));
  if (!current) throw Object.assign(new Error('Alerta não encontrado.'), { status: 404 });
  const merged = normalizeAlertBody({ ...current, ...b });
  if (pool) {
    const r = await pool.query(`UPDATE saved_alerts SET name=$3,keyword=$4,uf=$5,municipality=$6,municipality_ibge=$7,modality_code=$8,org_name=$9,org_cnpj=$10,min_value=$11,max_value=$12,enabled=$13,updated_at=NOW()
      WHERE id=$1 AND user_id=$2 RETURNING *`, [id, userId, merged.name, merged.keyword, merged.uf, merged.municipality, merged.municipality_ibge, merged.modality_code, merged.org_name, merged.org_cnpj, merged.min_value, merged.max_value, merged.enabled]);
    return r.rows[0];
  }
  Object.assign(current, merged, { updated_at: new Date().toISOString() }); return current;
}
async function deleteAlert(userId, id) {
  if (pool) await pool.query('DELETE FROM saved_alerts WHERE id=$1 AND user_id=$2', [id, userId]);
  else mem.alerts = mem.alerts.filter(a => !(Number(a.id) === Number(id) && a.user_id === Number(userId)));
}
async function alertFeed(userId) {
  const alerts = (await listAlerts(userId)).filter(a => a.enabled).slice(0, 12);
  const matches = [];
  for (const a of alerts) {
    const items = await pncpSearch({
      keyword: a.keyword || '', uf: a.uf || '', municipality: a.municipality || '', municipalityIbge: a.municipality_ibge || '',
      modality: a.modality_code || '', org: a.org_name || '', cnpj: a.org_cnpj || '', minValue: a.min_value, maxValue: a.max_value,
      days: 7, openOnly: false, order: 'newest'
    });
    for (const item of items.slice(0, 40)) matches.push({ alert: { id: a.id, name: a.name }, item });
  }
  const seen = new Set();
  return matches.filter(m => {
    const k = `${m.alert.id}:${resultKey(m.item)}`;
    if (seen.has(k)) return false; seen.add(k); return true;
  }).sort((a, b) => (Date.parse(b.item.dataPublicacaoPncp || 0) || 0) - (Date.parse(a.item.dataPublicacaoPncp || 0) || 0)).slice(0, 120);
}

async function listDocs(userId) {
  if (pool) {
    const r = await pool.query('SELECT id,filename,mime_type,size_bytes,created_at FROM documents WHERE user_id=$1 ORDER BY id DESC LIMIT 100', [userId]);
    return r.rows;
  }
  return mem.docs.filter(d => d.user_id === Number(userId)).sort((a, b) => b.id - a.id).map(({ content, ...x }) => x);
}
async function addDoc(userId, filename, mime, content) {
  if (pool) {
    const r = await pool.query('INSERT INTO documents(user_id,filename,mime_type,content,size_bytes) VALUES($1,$2,$3,$4,$5) RETURNING id', [userId, filename, mime, content, content.length]);
    return r.rows[0].id;
  }
  const d = { id: mem.nextDoc++, user_id: Number(userId), filename, mime_type: mime, content, size_bytes: content.length, created_at: new Date().toISOString() };
  mem.docs.push(d); return d.id;
}
async function getDoc(userId, id) {
  if (pool) {
    const r = await pool.query('SELECT filename,mime_type,content FROM documents WHERE id=$1 AND user_id=$2', [id, userId]);
    return r.rows[0] || null;
  }
  return mem.docs.find(d => d.id === Number(id) && d.user_id === Number(userId)) || null;
}
async function delDoc(userId, id) {
  if (pool) await pool.query('DELETE FROM documents WHERE id=$1 AND user_id=$2', [id, userId]);
  else mem.docs = mem.docs.filter(d => !(d.id === Number(id) && d.user_id === Number(userId)));
}

async function listUsers() {
  if (pool) {
    const r = await pool.query('SELECT id,email,role,active,created_at FROM users ORDER BY id DESC LIMIT 500');
    return r.rows;
  }
  return mem.users.map(publicUser).sort((a, b) => b.id - a.id);
}
async function adminStats() {
  if (pool) {
    const [u, d, a, l] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int total, COUNT(*) FILTER(WHERE active)::int active, COUNT(*) FILTER(WHERE role='admin')::int admins FROM users`),
      pool.query('SELECT COUNT(*)::int count, COALESCE(SUM(size_bytes),0)::bigint bytes FROM documents'),
      pool.query('SELECT COUNT(*)::int total, COUNT(*) FILTER(WHERE enabled)::int enabled FROM saved_alerts'),
      pool.query('SELECT COUNT(*)::int count FROM audit_logs WHERE created_at > NOW() - INTERVAL \'24 hours\'')
    ]);
    return { users: u.rows[0], documents: d.rows[0], alerts: a.rows[0], audit24h: l.rows[0].count, storage: 'postgresql' };
  }
  return {
    users: { total: mem.users.length, active: mem.users.filter(x => x.active).length, admins: mem.users.filter(x => x.role === 'admin').length },
    documents: { count: mem.docs.length, bytes: mem.docs.reduce((s, x) => s + x.size_bytes, 0) },
    alerts: { total: mem.alerts.length, enabled: mem.alerts.filter(x => x.enabled).length },
    audit24h: mem.audit.filter(x => Date.now() - Date.parse(x.created_at) < 86400000).length,
    storage: 'temporary-memory'
  };
}
async function updateUser(adminId, targetId, body) {
  if (Number(adminId) === Number(targetId) && (body.active === false || (body.role && body.role !== 'admin'))) {
    throw Object.assign(new Error('Você não pode remover seu próprio acesso de administrador.'), { status: 400 });
  }
  const role = body.role === undefined ? undefined : String(body.role);
  if (role !== undefined && !['admin', 'user'].includes(role)) throw Object.assign(new Error('Perfil inválido.'), { status: 400 });
  const active = body.active === undefined ? undefined : Boolean(body.active);
  if (pool) {
    const current = await pool.query('SELECT id,email,role,active,created_at FROM users WHERE id=$1', [targetId]);
    if (!current.rows[0]) throw Object.assign(new Error('Usuário não encontrado.'), { status: 404 });
    const nextRole = role ?? current.rows[0].role;
    const nextActive = active ?? current.rows[0].active;
    const r = await pool.query('UPDATE users SET role=$2,active=$3 WHERE id=$1 RETURNING id,email,role,active,created_at', [targetId, nextRole, nextActive]);
    return r.rows[0];
  }
  const u = mem.users.find(x => x.id === Number(targetId));
  if (!u) throw Object.assign(new Error('Usuário não encontrado.'), { status: 404 });
  if (role !== undefined) u.role = role; if (active !== undefined) u.active = active;
  return publicUser(u);
}
async function listAudit() {
  if (pool) {
    const r = await pool.query(`SELECT a.id,a.action,a.metadata,a.ip,a.created_at,u.email
      FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 120`);
    return r.rows;
  }
  return mem.audit.slice(0, 120).map(a => ({ ...a, email: mem.users.find(u => u.id === a.user_id)?.email || null }));
}

async function route(req, res) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (!rateLimit(ip)) return sendJson(res, 429, { error: 'Muitas requisições. Tente novamente em instantes.' });
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && APP_ORIGIN && req.headers.origin && req.headers.origin !== APP_ORIGIN) {
    return sendJson(res, 403, { error: 'Origem não autorizada.' });
  }
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/') return sendText(res, 200, INDEX);
  if (req.method === 'GET' && url.pathname === '/api/health') return sendJson(res, 200, { ok: true, storage: pool ? 'postgresql' : 'temporary-memory', pncp: true, version: '2.0' });

  if (req.method === 'POST' && url.pathname === '/api/auth/register') {
    const b = await readJson(req), email = emailOf(b.email);
    if (!email || !validPassword(b.password)) return sendJson(res, 400, { error: 'Informe e-mail válido e senha com pelo menos 10 caracteres.' });
    try {
      const u = await registerUser(email, b.password);
      await createSession(res, u.id); await audit(u.id, 'user.register', {}, ip);
      return sendJson(res, 201, { user: publicUser(u) });
    } catch (e) {
      if (e.code === '23505' || e.status === 409) return sendJson(res, 409, { error: 'Este e-mail já está cadastrado.' });
      throw e;
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    if (!rateLimit('login:' + ip, 15, 600000)) return sendJson(res, 429, { error: 'Muitas tentativas de login.' });
    const b = await readJson(req), email = emailOf(b.email), password = String(b.password || '');
    let u = email ? await findLogin(email) : null;
    if ((!u || !verifyPassword(password, u.password_hash)) && email) u = await ensureAdminUser(email, password);
    if (!u || !verifyPassword(password, u.password_hash)) return sendJson(res, 401, { error: 'E-mail ou senha inválidos.' });
    await createSession(res, u.id); await audit(u.id, 'user.login', {}, ip);
    return sendJson(res, 200, { user: publicUser(u) });
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    const u = await currentUser(req); await logout(req); if (u) await audit(u.id, 'user.logout', {}, ip);
    res.setHeader('Set-Cookie', 'radar_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    return sendJson(res, 200, { ok: true });
  }

  const user = await currentUser(req);
  if (url.pathname.startsWith('/api/') && !user) return sendJson(res, 401, { error: 'Faça login para continuar.' });
  if (req.method === 'GET' && url.pathname === '/api/me') return sendJson(res, 200, { user });

  if (req.method === 'GET' && url.pathname === '/api/licitacoes') {
    const items = await pncpSearch({
      keyword: url.searchParams.get('keyword') || '', uf: url.searchParams.get('uf') || '', municipality: url.searchParams.get('municipality') || '',
      municipalityIbge: url.searchParams.get('municipalityIbge') || '', modality: url.searchParams.get('modalidade') || '', org: url.searchParams.get('org') || '',
      cnpj: url.searchParams.get('cnpj') || '', minValue: url.searchParams.get('minValue'), maxValue: url.searchParams.get('maxValue'),
      openOnly: url.searchParams.get('openOnly') === 'true', days: url.searchParams.get('days') || '7', order: url.searchParams.get('order') || 'newest'
    });
    return sendJson(res, 200, { source: 'PNCP', items, fetched_at: new Date().toISOString() });
  }

  if (req.method === 'GET' && url.pathname === '/api/alerts') return sendJson(res, 200, { items: await listAlerts(user.id) });
  if (req.method === 'POST' && url.pathname === '/api/alerts') {
    const item = await createAlert(user.id, await readJson(req));
    await audit(user.id, 'alert.create', { alert_id: item.id, name: item.name }, ip);
    return sendJson(res, 201, { item });
  }
  if (req.method === 'GET' && url.pathname === '/api/alerts/feed') {
    const items = await alertFeed(user.id);
    return sendJson(res, 200, { items, fetched_at: new Date().toISOString() });
  }
  let m = url.pathname.match(/^\/api\/alerts\/(\d+)$/);
  if (m && req.method === 'PATCH') {
    const item = await patchAlert(user.id, m[1], await readJson(req));
    await audit(user.id, 'alert.update', { alert_id: item.id, enabled: item.enabled }, ip);
    return sendJson(res, 200, { item });
  }
  if (m && req.method === 'DELETE') {
    await deleteAlert(user.id, m[1]); await audit(user.id, 'alert.delete', { alert_id: Number(m[1]) }, ip);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'GET' && url.pathname === '/api/documents') return sendJson(res, 200, { items: await listDocs(user.id) });
  if (req.method === 'POST' && url.pathname === '/api/documents') {
    const b = await readJson(req, 4_500_000);
    const filename = String(b.filename || '').replace(/[\\/\0]/g, '_').slice(0, 180);
    const mime = String(b.mime_type || 'application/octet-stream').slice(0, 120);
    if (!filename || typeof b.content_base64 !== 'string') return sendJson(res, 400, { error: 'Arquivo inválido.' });
    const content = Buffer.from(b.content_base64, 'base64');
    if (!content.length || content.length > 3 * 1024 * 1024) return sendJson(res, 400, { error: 'Arquivo vazio ou maior que 3 MB.' });
    const id = await addDoc(user.id, filename, mime, content);
    await audit(user.id, 'document.upload', { document_id: id, filename, size: content.length }, ip);
    return sendJson(res, 201, { id });
  }
  m = url.pathname.match(/^\/api\/documents\/(\d+)\/download$/);
  if (m && req.method === 'GET') {
    const d = await getDoc(user.id, m[1]);
    if (!d) return sendJson(res, 404, { error: 'Documento não encontrado.' });
    headers(res, d.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent(d.filename));
    res.statusCode = 200; return res.end(d.content);
  }
  m = url.pathname.match(/^\/api\/documents\/(\d+)$/);
  if (m && req.method === 'DELETE') {
    await delDoc(user.id, m[1]); await audit(user.id, 'document.delete', { document_id: Number(m[1]) }, ip);
    return sendJson(res, 200, { ok: true });
  }

  if (url.pathname.startsWith('/api/admin/')) {
    if (user.role !== 'admin') return sendJson(res, 403, { error: 'Acesso restrito ao administrador.' });
    if (req.method === 'GET' && url.pathname === '/api/admin/users') return sendJson(res, 200, { items: await listUsers() });
    if (req.method === 'GET' && url.pathname === '/api/admin/stats') return sendJson(res, 200, { stats: await adminStats() });
    if (req.method === 'GET' && url.pathname === '/api/admin/audit') return sendJson(res, 200, { items: await listAudit() });
    m = url.pathname.match(/^\/api\/admin\/users\/(\d+)$/);
    if (m && req.method === 'PATCH') {
      const item = await updateUser(user.id, m[1], await readJson(req));
      await audit(user.id, 'admin.user_update', { target_id: Number(m[1]), role: item.role, active: item.active }, ip);
      return sendJson(res, 200, { item });
    }
  }

  return sendJson(res, 404, { error: 'Rota não encontrada.' });
}

await initDb();
const server = http.createServer((req, res) => route(req, res).catch(err => {
  console.error(err);
  sendJson(res, err.status || 500, { error: err.status ? err.message : 'Erro interno do servidor.' });
}));
server.listen(PORT, '0.0.0.0', () => console.log('Radar listening on ' + PORT + ' using ' + (pool ? 'PostgreSQL' : 'temporary memory')));
