import { Pool } from 'pg';
import { initAiTables, aiStatus, listAiConversations, listAiMessages, deleteAiConversation, runAiChat } from './ai-rlb-core.mjs';
import { initHybridTables, hybridStatus, hybridAdminStatus, configureHybridProvider, removeHybridProvider } from './ai-rlb-hybrid.mjs';
import { runForcedGeminiChat } from './ai-rlb-gemini-force.mjs';

const PORT = Number(process.env.PORT || 10000);
const DATABASE_URL = process.env.DATABASE_URL || '';
const APP_ORIGIN = process.env.APP_ORIGIN || '';
const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, idleTimeoutMillis: 30000 }) : null;
const rate = new Map();

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.end(JSON.stringify(data));
}
async function readJson(req, max = 120000) {
  let size = 0; const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > max) throw Object.assign(new Error('Payload muito grande.'), { status: 413 });
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('JSON inválido.'), { status: 400 }); }
}
function allow(key, limit = 12, windowMs = 300000) {
  const now = Date.now(); const old = rate.get(key);
  if (!old || now - old.at > windowMs) { rate.set(key, { at: now, count: 1 }); return true; }
  old.count += 1; return old.count <= limit;
}
async function authenticatedUser(req) {
  const r = await fetch(`http://127.0.0.1:${PORT}/api/me`, {
    headers: { cookie: String(req.headers.cookie || '') },
    signal: AbortSignal.timeout(5000)
  });
  if (!r.ok) return null;
  const data = await r.json().catch(() => ({}));
  return data.user || null;
}
async function ownedDocument(userId, id) {
  if (!id) return null;
  const r = await pool.query('SELECT id,filename,mime_type,content,size_bytes FROM documents WHERE id=$1 AND user_id=$2 LIMIT 1', [id, userId]);
  return r.rows[0] || null;
}
async function audit(userId, action, metadata, ip) {
  try { await pool.query('INSERT INTO audit_logs(user_id,action,metadata,ip) VALUES($1,$2,$3,$4)', [userId, action, metadata || {}, ip || null]); } catch {}
}

export async function initAiRlb() {
  if (!pool) { console.log('IA RLB router ready: no database'); return; }
  await initAiTables(pool);
  await initHybridTables(pool);
}

export async function handleAiRlbRoute(req, res, url) {
  if (!url.pathname.startsWith('/api/ai-rlb')) return false;
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  try {
    if (!pool) { send(res, 503, { error: 'IA RLB requer PostgreSQL.', code: 'database_unavailable' }); return true; }
    if (['POST','PATCH','DELETE'].includes(req.method) && APP_ORIGIN && req.headers.origin && req.headers.origin !== APP_ORIGIN) { send(res, 403, { error: 'Origem não autorizada.', code: 'origin_denied' }); return true; }
    const user = await authenticatedUser(req);
    if (!user) { send(res, 401, { error: 'Faça login para usar a IA RLB.', code: 'authentication_required' }); return true; }

    if (req.method === 'GET' && url.pathname === '/api/ai-rlb/status') {
      send(res, 200, await hybridStatus(pool, await aiStatus(pool, user.id))); return true;
    }
    if (url.pathname === '/api/ai-rlb/admin/config') {
      if (user.role !== 'admin') { send(res, 403, { error: 'Apenas administradores podem configurar a IA RLB.', code: 'admin_required' }); return true; }
      if (req.method === 'GET') { send(res, 200, await hybridAdminStatus(pool)); return true; }
      if (req.method === 'POST') {
        if (!allow(`ai-config:${user.id}`, 5, 600000)) { send(res, 429, { error: 'Muitas tentativas de configuração. Aguarde alguns minutos.', code: 'config_rate_limited' }); return true; }
        const body = await readJson(req, 10000);
        const result = await configureHybridProvider(pool, user.id, body);
        await audit(user.id, 'ai_rlb.configure_free_provider', { provider: result.provider, model: result.model, operational: result.operational }, ip);
        send(res, 200, result); return true;
      }
      if (req.method === 'DELETE') {
        const result = await removeHybridProvider(pool);
        await audit(user.id, 'ai_rlb.remove_free_provider', {}, ip);
        send(res, 200, result); return true;
      }
    }
    if (req.method === 'GET' && url.pathname === '/api/ai-rlb/conversations') {
      send(res, 200, { items: await listAiConversations(pool, user.id) }); return true;
    }
    let m = url.pathname.match(/^\/api\/ai-rlb\/conversations\/(\d+)\/messages$/);
    if (m && req.method === 'GET') {
      send(res, 200, await listAiMessages(pool, user.id, m[1])); return true;
    }
    m = url.pathname.match(/^\/api\/ai-rlb\/conversations\/(\d+)$/);
    if (m && req.method === 'DELETE') {
      await deleteAiConversation(pool, user.id, m[1]);
      send(res, 200, { ok: true }); return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/ai-rlb/chat') {
      if (!allow(`u:${user.id}`)) { send(res, 429, { error: 'Muitas mensagens em pouco tempo. Aguarde alguns instantes.', code: 'local_rate_limited' }); return true; }
      const body = await readJson(req);
      const document = body.document_id ? await ownedDocument(user.id, Number(body.document_id)) : null;
      if (body.document_id && !document) { send(res, 404, { error: 'Documento não encontrado ou sem acesso.', code: 'document_not_found' }); return true; }
      const result = await runForcedGeminiChat({ pool, userId: user.id, body, document, fallback: runAiChat });
      await audit(user.id, 'ai_rlb.chat', { conversation_id: result.conversation_id, document_id: document?.id || null, web_search: body.use_web !== false, provider: result.provider || 'local', model: result.model || null }, ip);
      send(res, 200, result); return true;
    }
    send(res, 404, { error: 'Rota da IA RLB não encontrada.', code: 'route_not_found' }); return true;
  } catch (e) {
    const status = e?.status || 500;
    const code = e?.publicCode || 'internal_error';
    console.error('IA RLB route error:', JSON.stringify({ status, code, message: e?.message || 'unknown' }));
    send(res, status, { error: e?.status ? e.message : 'Erro interno da IA RLB.', code }); return true;
  }
}
