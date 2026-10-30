import http from 'node:http';
import { readFile, writeFile, mkdir, stat, rename, chmod } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual, createHash, createHmac, createCipheriv, createDecipheriv } from 'node:crypto';
import { promisify } from 'node:util';
import { Readable } from 'node:stream';

const scrypt = promisify(scryptCb);
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC_DIR = join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || join(__dirname, 'data');
const PORT = Number(process.env.PORT || 8080);
const PNCP_QUERY_BASE = process.env.PNCP_BASE_URL || 'https://pncp.gov.br/api/consulta';
const PNCP_SERVICE_BASE = process.env.PNCP_SERVICE_BASE_URL || 'https://pncp.gov.br/api/pncp';
const PCP_BASE = 'https://apipcp.portaldecompraspublicas.com.br';
const PCP_KEY = process.env.PCP_PUBLIC_KEY || '';
const IS_PROD = process.env.NODE_ENV === 'production';
const APP_ORIGIN = process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL || '';
const MFA_KEY = process.env.MFA_ENCRYPTION_KEY || '';
const SESSION_COOKIE = IS_PROD ? '__Host-rlb_session' : 'rlb_session';
const USER_SESSION_HOURS = Math.min(Math.max(Number(process.env.USER_SESSION_HOURS || 48), 1), 168);
const ADMIN_SESSION_HOURS = Math.min(Math.max(Number(process.env.ADMIN_SESSION_HOURS || 12), 1), 48);

const FILES = {
  users: join(DATA_DIR, 'users.json'),
  sessions: join(DATA_DIR, 'sessions.json'),
  alerts: join(DATA_DIR, 'alerts.json'),
  favorites: join(DATA_DIR, 'favorites.json'),
  notifications: join(DATA_DIR, 'notifications.json'),
  settings: join(DATA_DIR, 'settings.json'),
  audit: join(DATA_DIR, 'audit.json'),
  mfaChallenges: join(DATA_DIR, 'mfa-challenges.json')
};

await mkdir(DATA_DIR, { recursive: true });
try { await chmod(DATA_DIR, 0o700); } catch {}

const MODALITIES = {
  1: 'Leilão - Eletrônico', 2: 'Diálogo Competitivo', 3: 'Concurso',
  4: 'Concorrência - Eletrônica', 5: 'Concorrência - Presencial',
  6: 'Pregão - Eletrônico', 7: 'Pregão - Presencial', 8: 'Dispensa',
  9: 'Inexigibilidade', 10: 'Manifestação de Interesse', 11: 'Pré-qualificação',
  12: 'Credenciamento', 13: 'Leilão - Presencial', 14: 'Inaplicabilidade da licitação'
};

const DEFAULT_SETTINGS = {
  appName: 'Radar Licitações Brasil',
  registrationOpen: false,
  maintenanceMode: false,
  dailyAlertsEnabled: true,
  supportEmail: '',
  updatedAt: new Date().toISOString()
};

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return structuredClone(fallback); }
}
async function writeJson(path, value) {
  const tmp = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  await rename(tmp, path);
  try { await chmod(path, 0o600); } catch {}
}
async function ensureFile(path, fallback) { try { await stat(path); try { await chmod(path, 0o600); } catch {} } catch { await writeJson(path, fallback); } }

await Promise.all([
  ensureFile(FILES.users, []), ensureFile(FILES.sessions, []), ensureFile(FILES.alerts, []),
  ensureFile(FILES.favorites, []), ensureFile(FILES.notifications, []), ensureFile(FILES.settings, DEFAULT_SETTINGS),
  ensureFile(FILES.audit, []), ensureFile(FILES.mfaChallenges, [])
]);

function normalizeEmail(v) { return String(v || '').trim().toLowerCase(); }
function cleanCnpj(v) { return String(v ?? '').replace(/\D/g, ''); }
function text(v) { return String(v ?? '').trim(); }
function number(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function first(...vals) { return vals.find(v => v !== undefined && v !== null && v !== '') ?? ''; }
function norm(s) { return text(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function sha(v) { return createHash('sha256').update(v).digest('hex'); }
function safeFileName(v) { return text(v || 'documento').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, ' ').slice(0, 140) || 'documento'; }
function isoDate(d) { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; }
function ymd(d) { return isoDate(d).replaceAll('-', ''); }

async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const derived = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return { salt, hash: Buffer.from(derived).toString('hex') };
}
async function verifyPassword(password, user) {
  const derived = Buffer.from(await scrypt(password, user.passwordSalt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }));
  const expected = Buffer.from(user.passwordHash, 'hex');
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
const COMMON_PASSWORDS = new Set(['password1234','123456789012','qwerty123456','admin12345678','senha12345678','1234567890aa']);
function validPassword(p) {
  if (typeof p !== 'string' || p.length < 12 || p.length > 128) return false;
  if (!/[A-Za-zÀ-ÿ]/.test(p) || !/\d/.test(p)) return false;
  return !COMMON_PASSWORDS.has(p.toLowerCase());
}
function uaHash(req) { return sha(String(req.headers['user-agent'] || 'unknown')); }
function base32Encode(buf) {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits=0, value=0, out='';
  for (const byte of buf) { value=(value<<8)|byte; bits+=8; while(bits>=5){ out+=alphabet[(value >>> (bits-5)) & 31]; bits-=5; } }
  if(bits>0) out+=alphabet[(value << (5-bits)) & 31]; return out;
}
function base32Decode(input) {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; const clean=String(input||'').toUpperCase().replace(/[^A-Z2-7]/g,'');
  let bits=0, value=0; const bytes=[];
  for (const ch of clean) { const idx=alphabet.indexOf(ch); if(idx<0) continue; value=(value<<5)|idx; bits+=5; if(bits>=8){ bytes.push((value >>> (bits-8)) & 255); bits-=8; } }
  return Buffer.from(bytes);
}
function hotp(secret, counter) {
  const b=Buffer.alloc(8); b.writeBigUInt64BE(BigInt(counter));
  const h=createHmac('sha1',base32Decode(secret)).update(b).digest(); const off=h[h.length-1]&15;
  const code=((h[off]&0x7f)<<24)|((h[off+1]&0xff)<<16)|((h[off+2]&0xff)<<8)|(h[off+3]&0xff);
  return String(code % 1_000_000).padStart(6,'0');
}
function verifyTotp(secret, code, drift=1) {
  const clean=String(code||'').replace(/\D/g,''); if(clean.length!==6) return false;
  const step=Math.floor(Date.now()/30000);
  for(let i=-drift;i<=drift;i++) if(timingSafeEqual(Buffer.from(hotp(secret,step+i)),Buffer.from(clean))) return true;
  return false;
}
function encryptionKey() {
  if (!MFA_KEY) return null;
  return createHash('sha256').update(MFA_KEY).digest();
}
function encryptSecret(value) {
  const key=encryptionKey(); if(!key) throw new Error('MFA_ENCRYPTION_KEY não configurada.');
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key,iv);
  const data=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]), tag=cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${data.toString('base64url')}`;
}
function decryptSecret(payload) {
  const key=encryptionKey(); if(!key) throw new Error('MFA_ENCRYPTION_KEY não configurada.');
  const [ivB,tagB,dataB]=String(payload||'').split('.'); if(!ivB||!tagB||!dataB) throw new Error('Segredo MFA inválido.');
  const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(ivB,'base64url')); decipher.setAuthTag(Buffer.from(tagB,'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataB,'base64url')),decipher.final()]).toString('utf8');
}
function recoveryCode() { return `${randomBytes(4).toString('hex')}-${randomBytes(4).toString('hex')}`.toUpperCase(); }
function normalizeRecovery(v) { return String(v||'').toUpperCase().replace(/[^A-F0-9]/g,''); }

async function appendAudit(event, userId = null, meta = {}) {
  const rows = await readJson(FILES.audit, []);
  rows.unshift({ id: randomUUID(), at: new Date().toISOString(), event, userId, meta });
  if (rows.length > 1000) rows.length = 1000;
  await writeJson(FILES.audit, rows);
}

async function bootstrapAdmin() {
  const users = await readJson(FILES.users, []);
  if (users.some(u => u.role === 'admin')) return;
  const email = normalizeEmail(process.env.ADMIN_EMAIL);
  const supplied = process.env.ADMIN_PASSWORD || '';
  if (IS_PROD && (!email || !validPassword(supplied) || !MFA_KEY)) {
    throw new Error('Segurança: configure ADMIN_EMAIL, ADMIN_PASSWORD (mín. 12 caracteres com letras e números) e MFA_ENCRYPTION_KEY antes de iniciar em produção.');
  }
  const generated = supplied || `Rlb-${randomBytes(9).toString('base64url')}A1`;
  const adminEmail = email || 'admin@radar.local';
  const { salt, hash } = await hashPassword(generated);
  users.push({ id: randomUUID(), name: 'Administrador', email: adminEmail, passwordSalt: salt, passwordHash: hash, role: 'admin', active: true, createdAt: new Date().toISOString(), lastLoginAt: null, failedLoginCount: 0, lockUntil: null, mfaEnabled: false, mfaSecretEncrypted: null, mfaPendingEncrypted: null, mfaRecoveryHashes: [] });
  await writeJson(FILES.users, users);
  if (!supplied) console.log(`\n[SETUP LOCAL] Admin: ${adminEmail}\n[SETUP LOCAL] Senha temporária: ${generated}\n`);
}
await bootstrapAdmin();

function securityHeaders(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Vary', 'Origin, Sec-Fetch-Site');
  const upgrade = IS_PROD ? '; upgrade-insecure-requests' : '';
  res.setHeader('Content-Security-Policy', `default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; media-src 'none'; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'${upgrade}`);
  if (IS_PROD) res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
}
function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}
async function bodyJson(req, max = 256_000) {
  let data = ''; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > max) throw new Error('Payload muito grande'); data += chunk; }
  return data ? JSON.parse(data) : {};
}
function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('='); if (i < 0) continue;
    out[decodeURIComponent(part.slice(0, i).trim())] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function clientIp(req) { return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(); }
function targetOrigin(req) {
  if (APP_ORIGIN) return APP_ORIGIN.replace(/\/$/,'');
  const proto = String(req.headers['x-forwarded-proto'] || (IS_PROD ? 'https' : 'http')).split(',')[0].trim();
  return `${proto}://${req.headers.host}`;
}
function sameOrigin(req) {
  if (!['POST','PUT','PATCH','DELETE'].includes(req.method)) return true;
  const fetchSite = String(req.headers['sec-fetch-site'] || '');
  if (fetchSite === 'cross-site') return false;
  const expected = targetOrigin(req);
  const origin = String(req.headers.origin || '');
  if (origin) return origin !== 'null' && origin.replace(/\/$/,'') === expected;
  const referer = String(req.headers.referer || '');
  if (referer) { try { return new URL(referer).origin === expected; } catch { return false; } }
  if (fetchSite === 'same-origin') return true;
  return !IS_PROD;
}

const rateMap = new Map();
function rateLimit(key, limit = 8, windowMs = 15 * 60_000) {
  const now = Date.now(); const x = rateMap.get(key) || { count: 0, reset: now + windowMs };
  if (now > x.reset) { x.count = 0; x.reset = now + windowMs; }
  x.count++; rateMap.set(key, x); return x.count <= limit;
}

async function createSession(res, user, req, { mfaVerified = false } = {}) {
  const raw = randomBytes(32).toString('base64url');
  const sessions = await readJson(FILES.sessions, []);
  const ttlHours = user.role === 'admin' ? ADMIN_SESSION_HOURS : USER_SESSION_HOURS;
  sessions.push({
    id: randomUUID(), tokenHash: sha(raw), userId: user.id, createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + ttlHours * 3600000).toISOString(),
    ipHash: sha(clientIp(req)), uaHash: uaHash(req), mfaAt: mfaVerified ? new Date().toISOString() : null
  });
  await writeJson(FILES.sessions, sessions.filter(s => new Date(s.expiresAt).getTime() > Date.now()));
  const secure = IS_PROD ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(raw)}; HttpOnly; Path=/; Max-Age=${ttlHours * 3600}; SameSite=Strict${secure}`);
}
async function destroySession(req, res) {
  const raw = cookies(req)[SESSION_COOKIE];
  if (raw) { const sessions = await readJson(FILES.sessions, []); await writeJson(FILES.sessions, sessions.filter(s => s.tokenHash !== sha(raw))); }
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict${IS_PROD ? '; Secure' : ''}`);
}
async function currentSession(req) {
  const raw = cookies(req)[SESSION_COOKIE]; if (!raw) return null;
  const sessions = await readJson(FILES.sessions, []);
  const tokenHash = sha(raw);
  const sess = sessions.find(x => x.tokenHash === tokenHash && new Date(x.expiresAt).getTime() > Date.now());
  if (!sess || sess.uaHash !== uaHash(req)) return null;
  const users = await readJson(FILES.users, []);
  const u = users.find(x => x.id === sess.userId && x.active);
  if (!u) return null;
  return { session: sess, user: u, tokenHash };
}
async function currentUser(req) {
  const ctx = await currentSession(req); if (!ctx) return null;
  const u = ctx.user;
  return { id: u.id, name: u.name, email: u.email, role: u.role, active: u.active, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt, mfaEnabled: Boolean(u.mfaEnabled), mfaVerified: Boolean(ctx.session.mfaAt) };
}
async function requireUser(req, res, role = null) {
  const u = await currentUser(req);
  if (!u) { json(res, 401, { error: 'Faça login para continuar.' }); return null; }
  if (role && u.role !== role) { json(res, 403, { error: 'Acesso exclusivo do administrador.' }); return null; }
  return u;
}
async function requireAdmin(req, res) {
  const u = await requireUser(req, res, 'admin'); if (!u) return null;
  if (!u.mfaEnabled) { json(res, 428, { error: 'Ative a autenticação em dois fatores antes de usar a administração.', code: 'MFA_SETUP_REQUIRED' }); return null; }
  if (!u.mfaVerified) { json(res, 403, { error: 'Confirme o segundo fator para acessar a administração.', code: 'MFA_REQUIRED' }); return null; }
  return u;
}
async function invalidateUserSessions(userId, exceptTokenHash = null) {
  const sessions = await readJson(FILES.sessions, []);
  await writeJson(FILES.sessions, sessions.filter(s => s.userId !== userId || (exceptTokenHash && s.tokenHash === exceptTokenHash)));
}
async function markCurrentSessionMfa(req) {
  const raw = cookies(req)[SESSION_COOKIE]; if (!raw) return;
  const h = sha(raw), sessions = await readJson(FILES.sessions, []), sess = sessions.find(x => x.tokenHash === h);
  if (sess) { sess.mfaAt = new Date().toISOString(); await writeJson(FILES.sessions, sessions); }
}

function normalizePncp(x) {
  const org = x.orgaoEntidade || x.orgao || {};
  const unit = x.unidadeOrgao || x.unidade || {};
  const cnpj = cleanCnpj(first(org.cnpj, x.cnpjOrgao, x.cnpj));
  const year = Number(first(x.anoCompra, x.anoContratacao, x.ano));
  const seq = Number(first(x.sequencialCompra, x.sequencialContratacao, x.sequencial));
  const control = first(x.numeroControlePNCP, x.numeroControlePncp, x.idContratacaoPNCP, x.idContratacaoPncp);
  return {
    id: text(control || `${cnpj}-${year}-${seq}`), source: text(first(x.usuarioNome, x.fonte, x.sistemaOrigem, 'PNCP')), sourceType: 'PNCP',
    title: text(first(x.numeroCompra, x.numeroInstrumentoConvocatorio, control, 'Contratação pública')), object: text(first(x.objetoCompra, x.objeto, x.descricaoObjeto)),
    agency: text(first(org.razaoSocial, org.nome, x.nomeOrgao, x.orgaoEntidadeRazaoSocial)), unit: text(first(unit.nomeUnidade, unit.nome, x.nomeUnidade)),
    city: text(first(unit.municipioNome, unit.municipio, x.municipioNome, x.municipio)), uf: text(first(unit.ufSigla, unit.uf, x.ufSigla, x.uf)).toUpperCase(),
    modality: text(first(x.modalidadeNome, x.modalidadeContratacaoNome, MODALITIES[x.modalidadeId], MODALITIES[x.codigoModalidadeContratacao])), modalityCode: Number(first(x.modalidadeId, x.codigoModalidadeContratacao)) || null,
    estimatedValue: number(first(x.valorTotalEstimado, x.valorEstimado, x.valorTotal)), proposalStart: text(first(x.dataAberturaProposta, x.dataInicioRecebimentoPropostas, x.dataInicioProposta)),
    proposalEnd: text(first(x.dataEncerramentoProposta, x.dataFimRecebimentoPropostas, x.dataFimProposta)), publicationDate: text(first(x.dataPublicacaoPncp, x.dataPublicacaoPNCP, x.dataPublicacao)),
    status: text(first(x.situacaoCompraNome, x.situacaoNome, x.status, 'Divulgada')), srp: Boolean(first(x.srp, x.sistemaRegistroPrecos, false)),
    cnpj, year, sequence: seq, documentsAvailable: Boolean(cnpj && year && seq),
    detailUrl: cnpj && year && seq ? `https://pncp.gov.br/app/editais/${cnpj}/${year}/${seq}` : 'https://pncp.gov.br/app/editais'
  };
}
function normalizePcp(x) {
  const id = first(x.idLicitacao, x.id, x.codigo, x.numeroProcesso);
  return { id: `pcp-${id}`, pcpId: Number(id) || id, source: 'Portal de Compras Públicas', sourceType: 'PCP', title: text(first(x.numeroProcesso, x.numeroLicitacao, x.numero, `Processo ${id}`)), object: text(first(x.objeto, x.descricaoObjeto, x.objetoLicitacao, x.descricao)), agency: text(first(x.nomeOrgao, x.orgao, x.entidade, x.comprador)), unit: text(first(x.unidadeCompradora, x.unidade, '')), city: text(first(x.municipio, x.cidade, x.nomeMunicipio, '')), uf: text(first(x.uf, x.estado, '')).toUpperCase(), modality: text(first(x.modalidade, x.descricaoModalidade, '')), modalityCode: null, estimatedValue: number(first(x.valorEstimado, x.valorTotalEstimado, x.valorReferencia)), proposalStart: text(first(x.dataInicioProposta, x.dataInicio, x.dataAbertura)), proposalEnd: text(first(x.dataFimProposta, x.dataFim, x.dataEncerramento)), publicationDate: text(first(x.dataPublicacao, x.dataPublicacaoProcesso)), status: text(first(x.situacao, x.descricaoSituacao, 'Aberto')), srp: /registro de preços|srp/i.test(text(first(x.objeto, x.descricaoObjeto, ''))), detailUrl: id ? `https://www.portaldecompraspublicas.com.br/processos/${id}` : 'https://www.portaldecompraspublicas.com.br/', documentsAvailable: Boolean(PCP_KEY && id) };
}
async function fetchJson(url, timeoutMs = 20000) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { const r = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'RadarLicitacoesBrasil/3.0' }, signal: controller.signal }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json(); }
  finally { clearTimeout(timer); }
}
async function pncpQuery({ status, modality, uf, from, to, pages = 1 }) {
  const mods = modality ? [Number(modality)] : Object.keys(MODALITIES).map(Number), out = [], errors = [];
  const endpoint = status === 'published' ? 'publicacao' : 'proposta'; const today = new Date();
  const start = from || isoDate(new Date(today.getTime() - 14 * 86400000)); const end = to || isoDate(new Date(today.getTime() + (status === 'published' ? 0 : 120) * 86400000));
  const jobs = [];
  for (const m of mods) for (let p = 1; p <= Math.min(Math.max(Number(pages) || 1, 1), 5); p++) jobs.push((async () => {
    const qs = new URLSearchParams(); if (endpoint === 'publicacao') qs.set('dataInicial', ymd(start)); qs.set('dataFinal', ymd(end)); qs.set('codigoModalidadeContratacao', String(m)); qs.set('pagina', String(p)); qs.set('tamanhoPagina', '50'); if (uf) qs.set('uf', uf);
    try { const body = await fetchJson(`${PNCP_QUERY_BASE}/v1/contratacoes/${endpoint}?${qs}`); const arr = Array.isArray(body) ? body : (body.data || body.dados || body.resultado || []); if (Array.isArray(arr)) out.push(...arr.map(normalizePncp)); }
    catch (e) { errors.push({ source: 'PNCP', modality: m, page: p, error: e.message }); }
  })());
  for (let i = 0; i < jobs.length; i += 8) await Promise.all(jobs.slice(i, i + 8));
  return { items: out, errors };
}
async function pcpQuery({ uf, pages = 1 }) {
  if (!PCP_KEY) return { items: [], errors: [], disabled: true };
  const items = [], errors = [];
  for (let p = 1; p <= Math.min(Math.max(Number(pages) || 1, 1), 3); p++) {
    const qs = new URLSearchParams({ publicKey: PCP_KEY, pagina: String(p) }); if (uf) qs.set('uf', uf);
    try { const body = await fetchJson(`${PCP_BASE}/publico/processosAbertos/?${qs}`); const arr = body?.dadosLicitacoes || body?.dados || body?.data || []; if (Array.isArray(arr)) items.push(...arr.map(normalizePcp)); }
    catch (e) { errors.push({ source: 'PCP', page: p, error: e.message }); }
  }
  return { items, errors, disabled: false };
}
function filterItems(items, q) {
  const keyword = norm(q.keyword), city = norm(q.city), agency = norm(q.agency), source = norm(q.source), minValue = q.minValue ? Number(q.minValue) : null, maxValue = q.maxValue ? Number(q.maxValue) : null;
  return items.filter(x => { const hay = norm(`${x.title} ${x.object} ${x.agency} ${x.unit} ${x.city} ${x.uf} ${x.modality} ${x.source}`); if (keyword && !keyword.split(/\s+/).every(w => hay.includes(w))) return false; if (city && !norm(x.city).includes(city)) return false; if (agency && !norm(x.agency).includes(agency)) return false; if (source && !norm(x.source).includes(source)) return false; if (minValue != null && (x.estimatedValue == null || x.estimatedValue < minValue)) return false; if (maxValue != null && (x.estimatedValue == null || x.estimatedValue > maxValue)) return false; return true; });
}
function dedupe(items) { const seen = new Set(); return items.filter(x => { const k = x.id || norm(`${x.agency}|${x.object}|${x.proposalEnd}`); if (seen.has(k)) return false; seen.add(k); return true; }); }
export async function searchOpportunities(params = {}) {
  const status = params.status || 'open', pages = Math.min(Math.max(Number(params.pages) || 1, 1), 5);
  const [pncp, pcp] = await Promise.all([pncpQuery({ status, modality: params.modality, uf: params.uf, from: params.from, to: params.to, pages }), status === 'open' ? pcpQuery({ uf: params.uf, pages: Math.min(pages, 2) }) : Promise.resolve({ items: [], errors: [], disabled: !PCP_KEY })]);
  let items = dedupe([...pncp.items, ...pcp.items]); items = filterItems(items, params);
  items.sort((a, b) => (new Date(a.proposalEnd || '2999-01-01') - new Date(b.proposalEnd || '2999-01-01')));
  return { items: items.slice(0, 1000), meta: { queriedAt: new Date().toISOString(), pncpFetched: pncp.items.length, pcpFetched: pcp.items.length, pcpEnabled: !pcp.disabled, errors: [...pncp.errors, ...pcp.errors] } };
}

export async function listPncpDocuments(cnpj, year, sequence) {
  const body = await fetchJson(`${PNCP_SERVICE_BASE}/v1/orgaos/${cleanCnpj(cnpj)}/compras/${Number(year)}/${Number(sequence)}/arquivos`);
  const docs = Array.isArray(body) ? body : (body.documentos || body.data || []);
  return Array.isArray(docs) ? docs.map(d => ({ sequence: Number(first(d.sequencialDocumento, d.sequencial)), title: text(first(d.titulo, d.tituloDocumento, `Documento ${d.sequencialDocumento || ''}`)), typeId: Number(d.tipoDocumentoId) || null, typeName: text(first(d.tipoDocumentoNome, 'Documento')), publishedAt: text(d.dataPublicacaoPncp), sourceUrl: text(first(d.url, d.uri)), downloadPath: `/api/opportunities/${cleanCnpj(cnpj)}/${Number(year)}/${Number(sequence)}/documents/${Number(first(d.sequencialDocumento, d.sequencial))}/download` })) : [];
}

async function listPcpDocuments(id) {
  if (!PCP_KEY) throw new Error('Conector do Portal de Compras Públicas não configurado.');
  const qs = new URLSearchParams({ publicKey: PCP_KEY, idLicitacao: String(id) });
  const body = await fetchJson(`${PCP_BASE}/publico/obteranexoslicitacao/?${qs}`);
  const source = [...(Array.isArray(body?.documentosFs) ? body.documentosFs : []), ...(Array.isArray(body?.Anexos) ? body.Anexos : (Array.isArray(body?.anexos) ? body.anexos : []))];
  return source.map((d, i) => ({ sequence: Number(first(d.idArquivo, i + 1)), title: text(first(d.nome, d.titulo, d.evento, `Documento ${i + 1}`)), typeName: text(first(d.siglaDocumento, d.evento, 'Documento')), publishedAt: text(first(d.dataEnvio, '')), sourceUrl: text(d.url), downloadPath: `/api/opportunities/pcp/${encodeURIComponent(id)}/documents/${Number(first(d.idArquivo, i + 1))}/download` }));
}

async function api(req, res, url) {
  if (url.pathname === '/api/internal/run-alerts' && req.method === 'POST') {
    const secret = process.env.CRON_SECRET || ''; const auth = String(req.headers.authorization || '');
    if (!secret || auth.length < 32 || auth !== `Bearer ${secret}`) return json(res, 403, { error: 'Não autorizado.' });
    const { runDailyAlerts } = await import('./alert-worker.mjs');
    const result = await runDailyAlerts(); return json(res, 200, result);
  }
  if (!sameOrigin(req)) return json(res, 403, { error: 'Origem da requisição não autorizada.' });

  if (url.pathname === '/api/health' && req.method === 'GET') return json(res, 200, { ok: true, version: '3.1.0-secure', pncp: true, pcpEnabled: Boolean(PCP_KEY), auth: true, documents: true, mfa: true });
  if (url.pathname === '/api/public/config' && req.method === 'GET') { const s = await readJson(FILES.settings, DEFAULT_SETTINGS); return json(res, 200, { appName: s.appName, registrationOpen: s.registrationOpen, maintenanceMode: s.maintenanceMode }); }

  if (url.pathname === '/api/auth/register' && req.method === 'POST') {
    if (!rateLimit(`reg:${clientIp(req)}`, 5)) return json(res, 429, { error: 'Muitas tentativas. Aguarde alguns minutos.' });
    const settings = await readJson(FILES.settings, DEFAULT_SETTINGS); if (!settings.registrationOpen) return json(res, 403, { error: 'Novos cadastros estão temporariamente fechados.' });
    try {
      const b = await bodyJson(req); const name = text(b.name).slice(0, 120), email = normalizeEmail(b.email), password = String(b.password || '');
      if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email)) return json(res, 400, { error: 'Nome e e-mail válidos são obrigatórios.' });
      if (!validPassword(password)) return json(res, 400, { error: 'Use uma senha ou frase-senha de 12 a 128 caracteres, com letras e números, que não seja comum.' });
      const users = await readJson(FILES.users, []); if (users.some(u => u.email === email)) return json(res, 409, { error: 'Este e-mail já está cadastrado.' });
      const { salt, hash } = await hashPassword(password); const user = { id: randomUUID(), name, email, passwordSalt: salt, passwordHash: hash, role: 'user', active: true, createdAt: new Date().toISOString(), lastLoginAt: new Date().toISOString(), failedLoginCount: 0, lockUntil: null, mfaEnabled: false, mfaSecretEncrypted: null, mfaPendingEncrypted: null, mfaRecoveryHashes: [] };
      users.push(user); await writeJson(FILES.users, users); await createSession(res, user, req); await appendAudit('user.register', user.id, { email });
      return json(res, 201, { user: { id: user.id, name, email, role: 'user' } });
    } catch (e) { return json(res, 400, { error: 'Não foi possível concluir o cadastro.' }); }
  }
  if (url.pathname === '/api/auth/login' && req.method === 'POST') {
    if (!rateLimit(`login-ip:${clientIp(req)}`, 20)) return json(res, 429, { error: 'Muitas tentativas. Aguarde alguns minutos.' });
    try {
      const b = await bodyJson(req), email = normalizeEmail(b.email), password = String(b.password || '');
      if (!rateLimit(`login-account:${sha(email)}`, 10)) return json(res, 429, { error: 'Muitas tentativas. Aguarde alguns minutos.' });
      const users = await readJson(FILES.users, []); const u = users.find(x => x.email === email);
      const now = Date.now();
      if (u?.lockUntil && new Date(u.lockUntil).getTime() > now) return json(res, 429, { error: 'Conta temporariamente bloqueada por segurança. Tente novamente mais tarde.' });
      let ok = false;
      if (u?.active) ok = await verifyPassword(password, u);
      else {
        const dummy = { passwordSalt: '11223344556677889900aabbccddeeff', passwordHash: '0'.repeat(128) };
        try { await verifyPassword(password || 'x', dummy); } catch {}
      }
      if (!u || !u.active || !ok) {
        if (u) {
          u.failedLoginCount = Number(u.failedLoginCount || 0) + 1;
          if (u.failedLoginCount >= 5) { u.lockUntil = new Date(now + 15 * 60_000).toISOString(); u.failedLoginCount = 0; }
          await writeJson(FILES.users, users);
        }
        await appendAudit('auth.failed', u?.id || null, { account: sha(email), ip: sha(clientIp(req)), ua: uaHash(req) });
        return json(res, 401, { error: 'E-mail ou senha inválidos.' });
      }
      u.failedLoginCount = 0; u.lockUntil = null; u.lastLoginAt = new Date().toISOString(); await writeJson(FILES.users, users);
      if (u.mfaEnabled) {
        const challenges = (await readJson(FILES.mfaChallenges, [])).filter(c => new Date(c.expiresAt).getTime() > now);
        const challenge = { id: randomUUID(), userId: u.id, createdAt: new Date().toISOString(), expiresAt: new Date(now + 5 * 60_000).toISOString(), ipHash: sha(clientIp(req)), uaHash: uaHash(req) };
        challenges.push(challenge); await writeJson(FILES.mfaChallenges, challenges);
        await appendAudit('auth.password_ok_mfa_required', u.id);
        return json(res, 200, { mfaRequired: true, challengeId: challenge.id });
      }
      await createSession(res, u, req, { mfaVerified: false }); await appendAudit('auth.login', u.id);
      return json(res, 200, { user: { id: u.id, name: u.name, email: u.email, role: u.role, mfaEnabled: false }, mfaSetupRequired: u.role === 'admin' });
    } catch { return json(res, 400, { error: 'Não foi possível entrar.' }); }
  }
  if (url.pathname === '/api/auth/mfa/verify' && req.method === 'POST') {
    if (!rateLimit(`mfa:${clientIp(req)}`, 12, 10 * 60_000)) return json(res, 429, { error: 'Muitas tentativas de segundo fator.' });
    try {
      const b = await bodyJson(req), challengeId = String(b.challengeId || ''), code = String(b.code || '');
      const challenges = await readJson(FILES.mfaChallenges, []), ch = challenges.find(c => c.id === challengeId && new Date(c.expiresAt).getTime() > Date.now());
      if (!ch || ch.ipHash !== sha(clientIp(req)) || ch.uaHash !== uaHash(req)) return json(res, 401, { error: 'Desafio expirado ou inválido. Faça login novamente.' });
      const users = await readJson(FILES.users, []), u = users.find(x => x.id === ch.userId && x.active && x.mfaEnabled);
      if (!u) return json(res, 401, { error: 'Desafio inválido.' });
      const secret = decryptSecret(u.mfaSecretEncrypted);
      let valid = verifyTotp(secret, code);
      if (!valid) {
        const normalized = normalizeRecovery(code), h = sha(normalized);
        const ridx = (u.mfaRecoveryHashes || []).indexOf(h);
        if (normalized.length >= 12 && ridx >= 0) { valid = true; u.mfaRecoveryHashes.splice(ridx, 1); await writeJson(FILES.users, users); }
      }
      if (!valid) { await appendAudit('auth.mfa_failed', u.id, { ip: sha(clientIp(req)) }); return json(res, 401, { error: 'Código de autenticação inválido.' }); }
      await writeJson(FILES.mfaChallenges, challenges.filter(c => c.id !== challengeId));
      await createSession(res, u, req, { mfaVerified: true }); await appendAudit('auth.login_mfa', u.id);
      return json(res, 200, { user: { id: u.id, name: u.name, email: u.email, role: u.role, mfaEnabled: true } });
    } catch { return json(res, 400, { error: 'Não foi possível validar o segundo fator.' }); }
  }
  if (url.pathname === '/api/auth/logout' && req.method === 'POST') { const u = await currentUser(req); await destroySession(req, res); if (u) await appendAudit('auth.logout', u.id); return json(res, 200, { ok: true }); }
  if (url.pathname === '/api/auth/me' && req.method === 'GET') { const u = await currentUser(req); return json(res, u ? 200 : 401, u ? { user: u } : { error: 'Não autenticado' }); }
  if (url.pathname === '/api/auth/profile' && req.method === 'PATCH') {
    const me = await requireUser(req, res); if (!me) return;
    const b = await bodyJson(req), name = text(b.name).slice(0, 120); if (name.length < 2) return json(res, 400, { error: 'Informe um nome válido.' });
    const users = await readJson(FILES.users, []), u = users.find(x => x.id === me.id); u.name = name; await writeJson(FILES.users, users); await appendAudit('profile.update', me.id); return json(res, 200, { ok: true, name });
  }
  if (url.pathname === '/api/auth/password' && req.method === 'PATCH') {
    const me = await requireUser(req, res); if (!me) return; const b = await bodyJson(req), current = String(b.currentPassword || ''), next = String(b.newPassword || '');
    if (!validPassword(next)) return json(res, 400, { error: 'Use uma senha ou frase-senha de 12 a 128 caracteres, com letras e números, que não seja comum.' });
    const users = await readJson(FILES.users, []), u = users.find(x => x.id === me.id); if (!(await verifyPassword(current, u))) return json(res, 401, { error: 'Senha atual incorreta.' });
    const { salt, hash } = await hashPassword(next); u.passwordSalt = salt; u.passwordHash = hash; await writeJson(FILES.users, users);
    const ctx = await currentSession(req); await invalidateUserSessions(me.id, ctx?.tokenHash || null); await appendAudit('password.update', me.id);
    return json(res, 200, { ok: true });
  }

  if (url.pathname === '/api/auth/mfa/status' && req.method === 'GET') {
    const me = await requireUser(req, res); if (!me) return;
    return json(res, 200, { enabled: Boolean(me.mfaEnabled), required: me.role === 'admin', verified: Boolean(me.mfaVerified) });
  }
  if (url.pathname === '/api/auth/mfa/setup' && req.method === 'POST') {
    const me = await requireUser(req, res); if (!me) return;
    if (!MFA_KEY) return json(res, 503, { error: 'MFA ainda não está configurado no servidor.' });
    const b = await bodyJson(req), currentPassword = String(b.currentPassword || '');
    const users = await readJson(FILES.users, []), u = users.find(x => x.id === me.id);
    if (!u || !(await verifyPassword(currentPassword, u))) return json(res, 401, { error: 'Confirme sua senha atual para ativar o 2FA.' });
    const secret = base32Encode(randomBytes(20)), issuer = encodeURIComponent('Radar Licitações Brasil'), label = encodeURIComponent(u.email);
    u.mfaPendingEncrypted = encryptSecret(secret); u.mfaPendingExpiresAt = new Date(Date.now()+10*60_000).toISOString(); await writeJson(FILES.users, users);
    await appendAudit('mfa.setup_started', me.id);
    return json(res, 200, { secret: secret.match(/.{1,4}/g).join(' '), otpauthUri: `otpauth://totp/${issuer}:${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30` });
  }
  if (url.pathname === '/api/auth/mfa/confirm' && req.method === 'POST') {
    const me = await requireUser(req, res); if (!me) return;
    const b = await bodyJson(req), code = String(b.code || '');
    const users = await readJson(FILES.users, []), u = users.find(x => x.id === me.id);
    if (!u?.mfaPendingEncrypted || new Date(u.mfaPendingExpiresAt || 0).getTime() < Date.now()) return json(res, 400, { error: 'A configuração expirou. Inicie novamente.' });
    const secret = decryptSecret(u.mfaPendingEncrypted); if (!verifyTotp(secret, code)) return json(res, 400, { error: 'Código inválido. Verifique o aplicativo autenticador.' });
    const recoveryCodes = Array.from({length:8}, recoveryCode);
    u.mfaEnabled = true; u.mfaSecretEncrypted = u.mfaPendingEncrypted; u.mfaPendingEncrypted = null; u.mfaPendingExpiresAt = null; u.mfaRecoveryHashes = recoveryCodes.map(c => sha(normalizeRecovery(c)));
    await writeJson(FILES.users, users); await markCurrentSessionMfa(req); await appendAudit('mfa.enabled', me.id);
    return json(res, 200, { ok: true, recoveryCodes });
  }

  const me = await requireUser(req, res); if (!me) return;

  if (url.pathname === '/api/search' && req.method === 'GET') {
    if (!rateLimit(`search:${me.id}:${clientIp(req)}`, 60, 60_000)) return json(res, 429, { error: 'Limite de buscas excedido. Aguarde um minuto.' });
    const params = Object.fromEntries(url.searchParams.entries());
    try { return json(res, 200, await searchOpportunities(params)); } catch (e) { return json(res, 502, { error: 'Falha ao consultar fontes externas.' }); }
  }

  const docList = url.pathname.match(/^\/api\/opportunities\/(\d{14})\/(\d{4})\/(\d+)\/documents$/);
  if (docList && req.method === 'GET') { try { const items = await listPncpDocuments(docList[1], docList[2], docList[3]); return json(res, 200, { items }); } catch (e) { return json(res, 502, { error: 'Não foi possível consultar os documentos oficiais desta contratação.', detail: e.message }); } }
  const docDownload = url.pathname.match(/^\/api\/opportunities\/(\d{14})\/(\d{4})\/(\d+)\/documents\/(\d+)\/download$/);
  if (docDownload && req.method === 'GET') {
    const [, cnpj, year, seq, docSeq] = docDownload;
    try {
      let title = `documento-${docSeq}`; try { const docs = await listPncpDocuments(cnpj, year, seq); title = docs.find(d => d.sequence === Number(docSeq))?.title || title; } catch {}
      const upstream = await fetch(`${PNCP_SERVICE_BASE}/v1/orgaos/${cnpj}/compras/${year}/${seq}/arquivos/${docSeq}`, { headers: { accept: '*/*', 'user-agent': 'RadarLicitacoesBrasil/3.0' } });
      if (!upstream.ok || !upstream.body) return json(res, 502, { error: `PNCP retornou HTTP ${upstream.status} para este arquivo.` });
      const ct = upstream.headers.get('content-type') || 'application/octet-stream'; const ext = ct.includes('pdf') ? '.pdf' : ct.includes('zip') ? '.zip' : ct.includes('word') ? '.docx' : '';
      res.writeHead(200, { 'content-type': ct, 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safeFileName(title) + ext)}`, 'cache-control': 'private, no-store' });
      Readable.fromWeb(upstream.body).pipe(res); return;
    } catch (e) { return json(res, 502, { error: 'Falha ao baixar o documento oficial.', detail: e.message }); }
  }

  const pcpDocList = url.pathname.match(/^\/api\/opportunities\/pcp\/(\d+)\/documents$/);
  if (pcpDocList && req.method === 'GET') { try { return json(res, 200, { items: await listPcpDocuments(pcpDocList[1]) }); } catch (e) { return json(res, 502, { error: 'Não foi possível consultar os anexos do Portal de Compras Públicas.', detail: e.message }); } }
  const pcpDocDownload = url.pathname.match(/^\/api\/opportunities\/pcp\/(\d+)\/documents\/(\d+)\/download$/);
  if (pcpDocDownload && req.method === 'GET') {
    try { const docs = await listPcpDocuments(pcpDocDownload[1]); const d = docs.find(x => x.sequence === Number(pcpDocDownload[2])); if (!d?.sourceUrl) return json(res, 404, { error: 'Arquivo não localizado na fonte.' }); const target = new URL(d.sourceUrl); if (target.protocol !== 'https:' || !(target.hostname === 'portaldecompraspublicas.com.br' || target.hostname.endsWith('.portaldecompraspublicas.com.br'))) return json(res, 400, { error: 'Origem do arquivo não autorizada.' }); res.writeHead(302, { location: target.href, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }); return res.end(); } catch (e) { return json(res, 502, { error: 'Falha ao abrir o arquivo do Portal de Compras Públicas.', detail: e.message }); }
  }

  if (url.pathname === '/api/alerts' && req.method === 'GET') { const all = await readJson(FILES.alerts, []); return json(res, 200, { items: all.filter(a => a.userId === me.id) }); }
  if (url.pathname === '/api/alerts' && req.method === 'POST') {
    const b = await bodyJson(req); const name = text(b.name).slice(0, 100); if (!name) return json(res, 400, { error: 'Informe o nome do alerta.' });
    const all = await readJson(FILES.alerts, []); const item = { id: randomUUID(), userId: me.id, name, enabled: b.enabled !== false, cadence: 'daily', filters: b.filters || {}, createdAt: new Date().toISOString(), lastRun: null, seenIds: [] }; all.push(item); await writeJson(FILES.alerts, all); await appendAudit('alert.create', me.id, { alertId: item.id }); return json(res, 201, item);
  }
  const alertId = url.pathname.match(/^\/api\/alerts\/([a-f0-9-]+)$/i)?.[1];
  if (alertId && req.method === 'PATCH') { const b = await bodyJson(req), all = await readJson(FILES.alerts, []), a = all.find(x => x.id === alertId && x.userId === me.id); if (!a) return json(res, 404, { error: 'Alerta não encontrado.' }); if (b.name !== undefined) a.name = text(b.name).slice(0, 100); if (b.enabled !== undefined) a.enabled = Boolean(b.enabled); if (b.filters) a.filters = b.filters; await writeJson(FILES.alerts, all); return json(res, 200, a); }
  if (alertId && req.method === 'DELETE') { const all = await readJson(FILES.alerts, []); await writeJson(FILES.alerts, all.filter(a => !(a.id === alertId && a.userId === me.id))); await appendAudit('alert.delete', me.id, { alertId }); return json(res, 200, { ok: true }); }

  if (url.pathname === '/api/favorites' && req.method === 'GET') { const all = await readJson(FILES.favorites, []); return json(res, 200, { items: all.filter(f => f.userId === me.id).map(f => f.item) }); }
  if (url.pathname === '/api/favorites' && req.method === 'POST') { const b = await bodyJson(req); if (!b.item?.id) return json(res, 400, { error: 'Oportunidade inválida.' }); const all = await readJson(FILES.favorites, []); if (!all.some(f => f.userId === me.id && f.item?.id === b.item.id)) all.push({ id: randomUUID(), userId: me.id, createdAt: new Date().toISOString(), item: b.item }); await writeJson(FILES.favorites, all); return json(res, 201, { ok: true }); }
  const favId = url.pathname.match(/^\/api\/favorites\/(.+)$/)?.[1];
  if (favId && req.method === 'DELETE') { const all = await readJson(FILES.favorites, []); await writeJson(FILES.favorites, all.filter(f => !(f.userId === me.id && f.item?.id === decodeURIComponent(favId)))); return json(res, 200, { ok: true }); }

  if (url.pathname === '/api/notifications' && req.method === 'GET') { const all = await readJson(FILES.notifications, []); return json(res, 200, { items: all.filter(n => n.userId === me.id).slice(0, 100) }); }
  if (url.pathname === '/api/notifications/read-all' && req.method === 'POST') { const all = await readJson(FILES.notifications, []); for (const n of all) if (n.userId === me.id) n.read = true; await writeJson(FILES.notifications, all); return json(res, 200, { ok: true }); }

  if (url.pathname.startsWith('/api/admin/')) {
    const admin = await requireAdmin(req, res); if (!admin) return;
    if (url.pathname === '/api/admin/users' && req.method === 'GET') { const users = await readJson(FILES.users, []); return json(res, 200, { items: users.map(({ passwordHash, passwordSalt, ...u }) => u) }); }
    const userId = url.pathname.match(/^\/api\/admin\/users\/([a-f0-9-]+)$/i)?.[1];
    if (userId && req.method === 'PATCH') { const b = await bodyJson(req), users = await readJson(FILES.users, []), u = users.find(x => x.id === userId); if (!u) return json(res, 404, { error: 'Usuário não encontrado.' }); if (u.role === 'admin' && b.active === false) return json(res, 400, { error: 'O administrador principal não pode ser desativado por esta tela.' }); if (b.active !== undefined) u.active = Boolean(b.active); await writeJson(FILES.users, users); await appendAudit('admin.user.update', admin.id, { target: userId, active: u.active }); return json(res, 200, { ok: true }); }
    if (url.pathname === '/api/admin/settings' && req.method === 'GET') return json(res, 200, await readJson(FILES.settings, DEFAULT_SETTINGS));
    if (url.pathname === '/api/admin/settings' && req.method === 'PATCH') { const b = await bodyJson(req), s = await readJson(FILES.settings, DEFAULT_SETTINGS); if (b.registrationOpen !== undefined) s.registrationOpen = Boolean(b.registrationOpen); if (b.dailyAlertsEnabled !== undefined) s.dailyAlertsEnabled = Boolean(b.dailyAlertsEnabled); if (b.maintenanceMode !== undefined) s.maintenanceMode = Boolean(b.maintenanceMode); if (b.appName !== undefined) s.appName = text(b.appName).slice(0, 80) || s.appName; if (b.supportEmail !== undefined) s.supportEmail = normalizeEmail(b.supportEmail); s.updatedAt = new Date().toISOString(); await writeJson(FILES.settings, s); await appendAudit('admin.settings.update', admin.id); return json(res, 200, s); }
    if (url.pathname === '/api/admin/audit' && req.method === 'GET') return json(res, 200, { items: (await readJson(FILES.audit, [])).slice(0, 200) });
  }

  return json(res, 404, { error: 'Rota não encontrada.' });
}

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml' };
async function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname); rel = normalize(rel).replace(/^(\.\.[/\\])+/, ''); const path = join(PUBLIC_DIR, rel);
  if (!path.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  try { const s = await stat(path); if (!s.isFile()) throw 0; const b = await readFile(path); res.writeHead(200, { 'content-type': mime[extname(path)] || 'application/octet-stream', 'cache-control': extname(path) === '.html' ? 'no-cache' : 'public, max-age=300' }); res.end(b); }
  catch { if (!extname(path)) { try { const b = await readFile(join(PUBLIC_DIR, 'index.html')); res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' }); return res.end(b); } catch {} } res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Não encontrado'); }
}

export function startServer(port = PORT) {
  const server = http.createServer(async (req, res) => {
    securityHeaders(req, res);
    if (String(req.url || '').length > 8192) { res.writeHead(414); return res.end('URI Too Long'); }
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    try { if (url.pathname.startsWith('/api/')) return await api(req, res, url); return await serveStatic(req, res, url); }
    catch (e) { console.error(e); if (!res.headersSent) json(res, 500, { error: 'Erro interno do servidor.' }); else res.end(); }
  });
  server.headersTimeout = 15_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 80;
  server.listen(port, () => console.log(`Radar Licitações Brasil V3.1 Secure em http://localhost:${port}`)); return server;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) startServer();
