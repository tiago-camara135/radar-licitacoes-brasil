import http from 'node:http';
import crypto from 'node:crypto';
import { Pool } from 'pg';

const PORT = Number(process.env.PORT || 10000);
const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const APP_ORIGIN = process.env.APP_ORIGIN || '';
const PNCP_BASE_URL = process.env.PNCP_BASE_URL || 'https://pncp.gov.br/api/consulta';
const IS_PROD = process.env.NODE_ENV === 'production';

if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 8,
  idleTimeoutMillis: 30000,
});

const rate = new Map();
function rateLimit(ip, limit = 120, windowMs = 60_000) {
  const now = Date.now();
  const item = rate.get(ip);
  if (!item || now - item.start > windowMs) {
    rate.set(ip, { start: now, count: 1 });
    return true;
  }
  item.count += 1;
  return item.count <= limit;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rate) if (now - v.start > 120_000) rate.delete(k);
}, 60_000).unref();

function securityHeaders(res, contentType = 'application/json; charset=utf-8') {
  res.setHeader('Content-Type', contentType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (IS_PROD) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
}

function json(res, status, data) {
  securityHeaders(res);
  res.statusCode = status;
  res.end(JSON.stringify(data));
}

function text(res, status, body, type = 'text/html; charset=utf-8') {
  securityHeaders(res, type);
  res.statusCode = status;
  res.end(body);
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

async function readJson(req, maxBytes = 3_000_000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('Payload muito grande'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('JSON inválido'), { status: 400 }); }
}

function cleanEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return null;
  return email;
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 10 && password.length <= 200;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  try {
    const [kind, saltHex, hashHex] = String(stored).split('$');
    if (kind !== 'scrypt') return false;
    const candidate = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
    const expected = Buffer.from(hashHex, 'hex');
    return expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
  } catch { return false; }
}

function tokenHash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }

async function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const hours = 48;
  await pool.query('INSERT INTO sessions(user_id, token_hash, expires_at) VALUES ($1,$2,NOW()+($3 || \' hours\')::interval)', [userId, tokenHash(token), String(hours)]);
  const secure = IS_PROD ? '; Secure' : '';
  res.setHeader('Set-Cookie', `radar_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${hours * 3600}${secure}`);
}

async function currentUser(req) {
  const token = parseCookies(req).radar_session;
  if (!token) return null;
  const { rows } = await pool.query(`
    SELECT u.id,u.email,u.role,u.active,u.created_at
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.active=TRUE
    LIMIT 1`, [tokenHash(token)]);
  return rows[0] || null;
}

function requireOrigin(req) {
  if (!['POST','PUT','PATCH','DELETE'].includes(req.method)) return true;
  const origin = req.headers.origin;
  if (!origin || !APP_ORIGIN) return true;
  return origin === APP_ORIGIN;
}

async function initDb() {
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS sessions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS alert_preferences (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    uf TEXT,
    keyword TEXT,
    modality_code INTEGER,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS documents (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    content BYTEA NOT NULL,
    size_bytes INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)');
  if (ADMIN_EMAIL && ADMIN_PASSWORD && validatePassword(ADMIN_PASSWORD)) {
    const existing = await pool.query('SELECT id FROM users WHERE email=$1', [ADMIN_EMAIL]);
    if (!existing.rowCount) {
      await pool.query('INSERT INTO users(email,password_hash,role) VALUES ($1,$2,\'admin\')', [ADMIN_EMAIL, hashPassword(ADMIN_PASSWORD)]);
      console.log('Admin bootstrap created');
    } else {
      await pool.query('UPDATE users SET role=\'admin\', active=TRUE WHERE email=$1', [ADMIN_EMAIL]);
    }
  }
}

function ymd(date) {
  return date.toISOString().slice(0,10).replaceAll('-','');
}

async function pncpSearch({ keyword = '', uf = '', modality = '', days = 7 }) {
  const end = new Date();
  const start = new Date(end.getTime() - Math.min(Math.max(Number(days) || 7, 1), 30) * 86400000);
  const codes = modality ? [Number(modality)] : Array.from({ length: 14 }, (_, i) => i + 1);
  const tasks = codes.map(async code => {
    const params = new URLSearchParams({
      dataInicial: ymd(start),
      dataFinal: ymd(end),
      codigoModalidadeContratacao: String(code),
      pagina: '1',
      tamanhoPagina: '50',
    });
    if (uf && /^[A-Z]{2}$/.test(uf)) params.set('uf', uf);
    const url = `${PNCP_BASE_URL}/v1/contratacoes/publicacao?${params}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'RadarLicitacoesBrasil/1.0' }, signal: controller.signal });
      if (!response.ok) return [];
      const data = await response.json();
      const items = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      return items.map(x => ({ ...x, _modalidadeConsultada: code }));
    } catch { return []; }
    finally { clearTimeout(timer); }
  });
  const groups = await Promise.all(tasks);
  const all = groups.flat();
  const q = String(keyword || '').trim().toLocaleLowerCase('pt-BR');
  const filtered = q ? all.filter(x => [x.objetoCompra, x.informacaoComplementar, x.orgaoEntidade?.razaoSocial, x.unidadeOrgao?.nomeUnidade].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR').includes(q)) : all;
  const seen = new Set();
  return filtered.filter(x => {
    const key = x.numeroControlePNCP || `${x.orgaoEntidade?.cnpj}-${x.anoCompra}-${x.sequencialCompra}-${x._modalidadeConsultada}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 250);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

const INDEX = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Radar de Licitações Brasil</title>
<style>
:root{--bg:#08111f;--panel:#0d1b2d;--panel2:#10233b;--text:#edf6ff;--muted:#99afc7;--blue:#35a7ff;--cyan:#35e0d0;--green:#35d07f;--red:#ff6b78;--line:#203853;--shadow:0 18px 55px #0007}*{box-sizing:border-box}body{margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;background:radial-gradient(circle at 15% 0,#123760 0,transparent 38%),radial-gradient(circle at 90% 10%,#083d3b 0,transparent 28%),var(--bg);color:var(--text);min-height:100vh}button,input,select{font:inherit}.shell{max-width:1260px;margin:auto;padding:24px}.top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:22px}.brand{font-weight:900;font-size:24px;letter-spacing:-.5px}.brand span{color:var(--cyan)}.sub{color:var(--muted);font-size:13px}.card{background:linear-gradient(180deg,#10243bde,#0a1829ef);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow);padding:20px}.auth{max-width:500px;margin:8vh auto}.tabs{display:flex;gap:8px;margin-bottom:16px}.tabs button,.btn{border:0;border-radius:11px;padding:11px 15px;cursor:pointer;font-weight:750}.tabs button{background:#172c44;color:var(--muted)}.tabs button.active,.btn.primary{background:linear-gradient(135deg,var(--blue),var(--cyan));color:#03111c}.btn.ghost{background:#172c44;color:var(--text);border:1px solid var(--line)}.btn.danger{background:#3c1720;color:#ffadb5;border:1px solid #6a2632}.grid{display:grid;gap:14px}.grid2{grid-template-columns:repeat(2,minmax(0,1fr))}.grid4{grid-template-columns:repeat(4,minmax(0,1fr))}label{font-size:12px;color:var(--muted);display:block;margin-bottom:6px}input,select{width:100%;background:#081525;border:1px solid #29445f;color:var(--text);padding:11px 12px;border-radius:10px;outline:none}input:focus,select:focus{border-color:var(--cyan)}.nav{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}.nav button{background:#10243b;color:var(--muted);border:1px solid var(--line);padding:10px 13px;border-radius:10px;cursor:pointer}.nav button.active{color:#06131d;background:var(--cyan);border-color:var(--cyan)}.stat{padding:16px;border-radius:14px;background:#0b1a2c;border:1px solid var(--line)}.stat b{display:block;font-size:27px;margin-top:5px}.results{display:grid;gap:12px;margin-top:16px}.lic{padding:16px;border:1px solid var(--line);border-radius:14px;background:#0a1829}.lic h3{font-size:16px;margin:0 0 8px}.meta{display:flex;flex-wrap:wrap;gap:8px;color:var(--muted);font-size:12px}.pill{padding:4px 8px;border-radius:999px;background:#142d47;border:1px solid #284b68}.money{color:var(--green);font-weight:800}.toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.hidden{display:none!important}.notice{padding:10px 12px;border-radius:10px;margin:10px 0;font-size:13px}.ok{background:#0d3327;color:#8bf0c0}.err{background:#3c1720;color:#ffadb5}.table{width:100%;border-collapse:collapse;font-size:13px}.table th,.table td{text-align:left;padding:10px;border-bottom:1px solid var(--line)}.doc{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)}@media(max-width:800px){.grid2,.grid4{grid-template-columns:1fr}.shell{padding:14px}.top{align-items:flex-start;flex-direction:column}.card{padding:15px}}
</style></head><body><div class="shell"><div class="top"><div><div class="brand">Radar de <span>Licitações Brasil</span></div><div class="sub">Monitoramento público com dados do PNCP • acesso protegido</div></div><div id="who" class="sub"></div></div>
<div id="auth" class="card auth"><div class="tabs"><button id="tabLogin" class="active">Entrar</button><button id="tabRegister">Criar conta</button></div><div id="authMsg"></div><div class="grid"><div><label>E-mail</label><input id="email" type="email" autocomplete="email"></div><div><label>Senha (mínimo 10 caracteres)</label><input id="password" type="password" autocomplete="current-password"></div><button id="authBtn" class="btn primary">Entrar</button></div></div>
<div id="app" class="hidden"><div class="nav"><button data-view="radar" class="active">Radar PNCP</button><button data-view="alerts">Meus alertas</button><button data-view="docs">Documentos</button><button id="adminTab" data-view="admin" class="hidden">Administração</button><button id="logout">Sair</button></div>
<section id="view-radar"><div class="grid grid4"><div class="stat"><span class="sub">Fonte</span><b>PNCP</b></div><div class="stat"><span class="sub">Modalidades</span><b>14</b></div><div class="stat"><span class="sub">Janela máxima</span><b>30 dias</b></div><div class="stat"><span class="sub">Resultados</span><b id="count">—</b></div></div><div class="card" style="margin-top:14px"><div class="grid grid4"><div><label>Palavra-chave</label><input id="q" placeholder="ex.: pneus, combustível, software"></div><div><label>UF</label><select id="uf"><option value="">Brasil inteiro</option>${['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(u=>`<option>${u}</option>`).join('')}</select></div><div><label>Modalidade</label><select id="modal"><option value="">Todas</option><option value="4">Concorrência eletrônica</option><option value="5">Concorrência presencial</option><option value="6">Pregão eletrônico</option><option value="7">Pregão presencial</option><option value="8">Dispensa</option><option value="9">Inexigibilidade</option><option value="12">Credenciamento</option></select></div><div><label>Período</label><select id="days"><option value="1">Hoje</option><option value="7" selected>7 dias</option><option value="15">15 dias</option><option value="30">30 dias</option></select></div></div><div style="margin-top:14px"><button id="search" class="btn primary">Buscar licitações reais</button></div><div id="searchMsg"></div><div id="results" class="results"></div></div></section>
<section id="view-alerts" class="hidden"><div class="card"><h2>Preferências do Radar</h2><p class="sub">Salve os filtros que deseja acompanhar no sistema.</p><div class="grid grid2"><div><label>UF</label><input id="prefUf" maxlength="2" placeholder="RN"></div><div><label>Palavra-chave</label><input id="prefKeyword" placeholder="ex.: combustível"></div><div><label>Código da modalidade (opcional)</label><input id="prefModal" type="number" min="1" max="99"></div><div><label>Ativo</label><select id="prefEnabled"><option value="true">Sim</option><option value="false">Não</option></select></div></div><button id="savePref" class="btn primary" style="margin-top:14px">Salvar alerta</button><div id="prefMsg"></div></div></section>
<section id="view-docs" class="hidden"><div class="card"><h2>Documentos</h2><p class="sub">Arquivos de até 2 MB são armazenados de forma persistente no banco do Radar.</p><input id="file" type="file"><button id="upload" class="btn primary" style="margin-top:10px">Enviar arquivo</button><div id="docMsg"></div><div id="docsList" style="margin-top:12px"></div></div></section>
<section id="view-admin" class="hidden"><div class="card"><div class="toolbar"><div><h2 style="margin:0">Administração</h2><div class="sub">Usuários cadastrados no Radar</div></div><button id="refreshUsers" class="btn ghost">Atualizar</button></div><div style="overflow:auto"><table class="table"><thead><tr><th>ID</th><th>E-mail</th><th>Perfil</th><th>Ativo</th><th>Criado</th></tr></thead><tbody id="users"></tbody></table></div></div></section></div></div>
<script>
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];let me=null,mode='login';
async function api(path,opt={}){const r=await fetch(path,{headers:{'content-type':'application/json',...(opt.headers||{})},...opt});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||'Erro na operação');return d}
function msg(el,t,ok=true){el.innerHTML=t?`<div class="notice ${ok?'ok':'err'}">${t}</div>`:''}
function showApp(){ $('#auth').classList.add('hidden');$('#app').classList.remove('hidden');$('#who').textContent=me.email+(me.role==='admin'?' • ADMIN':'');$('#adminTab').classList.toggle('hidden',me.role!=='admin');loadPref();loadDocs() }
async function boot(){try{const d=await api('/api/me');me=d.user;showApp()}catch{}}
$('#tabLogin').onclick=()=>{mode='login';$('#tabLogin').classList.add('active');$('#tabRegister').classList.remove('active');$('#authBtn').textContent='Entrar'};$('#tabRegister').onclick=()=>{mode='register';$('#tabRegister').classList.add('active');$('#tabLogin').classList.remove('active');$('#authBtn').textContent='Criar conta'};
$('#authBtn').onclick=async()=>{try{const d=await api('/api/auth/'+mode,{method:'POST',body:JSON.stringify({email:$('#email').value,password:$('#password').value})});me=d.user;msg($('#authMsg'),'Acesso realizado.');showApp()}catch(e){msg($('#authMsg'),e.message,false)}};
$('#logout').onclick=async()=>{await api('/api/auth/logout',{method:'POST',body:'{}'}).catch(()=>{});location.reload()};
$$('.nav [data-view]').forEach(b=>b.onclick=()=>{$$('.nav [data-view]').forEach(x=>x.classList.remove('active'));b.classList.add('active');$$('section[id^="view-"]').forEach(s=>s.classList.add('hidden'));$('#view-'+b.dataset.view).classList.remove('hidden');if(b.dataset.view==='admin')loadUsers();if(b.dataset.view==='docs')loadDocs()});
function brl(v){const n=Number(v);return Number.isFinite(n)?n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'—'}
$('#search').onclick=async()=>{msg($('#searchMsg'),'Consultando o PNCP...');$('#results').innerHTML='';try{const p=new URLSearchParams({keyword:$('#q').value,uf:$('#uf').value,modalidade:$('#modal').value,days:$('#days').value});const d=await api('/api/licitacoes?'+p);$('#count').textContent=d.items.length;msg($('#searchMsg'),d.items.length+' resultado(s) encontrado(s).');$('#results').innerHTML=d.items.map(x=>`<div class="lic"><h3>${escapeHtml(x.objetoCompra||'Objeto não informado')}</h3><div class="meta"><span class="pill">${escapeHtml(x.modalidadeNome||('Modalidade '+(x._modalidadeConsultada||'')))}</span><span class="pill">${escapeHtml(x.unidadeOrgao?.ufSigla||x.unidadeOrgao?.municipioNome||'')}</span><span>${escapeHtml(x.orgaoEntidade?.razaoSocial||'Órgão não informado')}</span><span>Publicação: ${escapeHtml(x.dataPublicacaoPncp||'—')}</span></div><p class="money">${brl(x.valorTotalEstimado)}</p>${x.linkSistemaOrigem?`<a target="_blank" rel="noopener" href="${safeUrl(x.linkSistemaOrigem)}" style="color:#35e0d0">Abrir origem</a>`:''}</div>`).join('')||'<div class="sub">Nenhum resultado para os filtros informados.</div>'}catch(e){msg($('#searchMsg'),e.message,false)}};
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function safeUrl(s){try{const u=new URL(s);return ['http:','https:'].includes(u.protocol)?u.href:'#'}catch{return '#'}}
async function loadPref(){try{const d=await api('/api/preferences');const p=d.preference||{};$('#prefUf').value=p.uf||'';$('#prefKeyword').value=p.keyword||'';$('#prefModal').value=p.modality_code||'';$('#prefEnabled').value=String(p.enabled??true)}catch{}}
$('#savePref').onclick=async()=>{try{await api('/api/preferences',{method:'PUT',body:JSON.stringify({uf:$('#prefUf').value,keyword:$('#prefKeyword').value,modality_code:$('#prefModal').value||null,enabled:$('#prefEnabled').value==='true'})});msg($('#prefMsg'),'Alerta salvo com sucesso.')}catch(e){msg($('#prefMsg'),e.message,false)}};
async function loadDocs(){if(!me)return;try{const d=await api('/api/documents');$('#docsList').innerHTML=d.items.map(x=>`<div class="doc"><div><b>${escapeHtml(x.filename)}</b><div class="sub">${Math.round(x.size_bytes/1024)} KB • ${new Date(x.created_at).toLocaleString('pt-BR')}</div></div><div><a class="btn ghost" href="/api/documents/${x.id}/download">Baixar</a> <button class="btn danger" onclick="delDoc(${x.id})">Excluir</button></div></div>`).join('')||'<div class="sub">Nenhum documento armazenado.</div>'}catch{}}
$('#upload').onclick=async()=>{const f=$('#file').files[0];if(!f)return msg($('#docMsg'),'Selecione um arquivo.',false);if(f.size>2*1024*1024)return msg($('#docMsg'),'O limite é 2 MB por arquivo.',false);const b64=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]);r.onerror=no;r.readAsDataURL(f)});try{await api('/api/documents',{method:'POST',body:JSON.stringify({filename:f.name,mime_type:f.type||'application/octet-stream',content_base64:b64})});msg($('#docMsg'),'Arquivo enviado.');$('#file').value='';loadDocs()}catch(e){msg($('#docMsg'),e.message,false)}};
window.delDoc=async id=>{if(!confirm('Excluir este documento?'))return;try{await api('/api/documents/'+id,{method:'DELETE',body:'{}'});loadDocs()}catch(e){msg($('#docMsg'),e.message,false)}};
async function loadUsers(){if(me?.role!=='admin')return;try{const d=await api('/api/admin/users');$('#users').innerHTML=d.items.map(u=>`<tr><td>${u.id}</td><td>${escapeHtml(u.email)}</td><td>${escapeHtml(u.role)}</td><td>${u.active?'Sim':'Não'}</td><td>${new Date(u.created_at).toLocaleString('pt-BR')}</td></tr>`).join('')}catch(e){}}
$('#refreshUsers').onclick=loadUsers;boot();
</script></body></html>`;

async function route(req, res) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (!rateLimit(ip)) return json(res, 429, { error: 'Muitas requisições. Tente novamente em instantes.' });
  if (!requireOrigin(req)) return json(res, 403, { error: 'Origem não autorizada.' });
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/') return text(res, 200, INDEX);
  if (req.method === 'GET' && url.pathname === '/api/health') {
    const r = await pool.query('SELECT NOW() AS now');
    return json(res, 200, { ok: true, database: true, time: r.rows[0].now });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/register') {
    const body = await readJson(req);
    const email = cleanEmail(body.email);
    if (!email || !validatePassword(body.password)) return json(res, 400, { error: 'Informe e-mail válido e senha com pelo menos 10 caracteres.' });
    try {
      const r = await pool.query('INSERT INTO users(email,password_hash) VALUES ($1,$2) RETURNING id,email,role,active,created_at', [email, hashPassword(body.password)]);
      await createSession(res, r.rows[0].id);
      return json(res, 201, { user: r.rows[0] });
    } catch (e) {
      if (e.code === '23505') return json(res, 409, { error: 'Este e-mail já está cadastrado.' });
      throw e;
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    if (!rateLimit(`login:${ip}`, 15, 10 * 60_000)) return json(res, 429, { error: 'Muitas tentativas de login. Aguarde alguns minutos.' });
    const body = await readJson(req);
    const email = cleanEmail(body.email);
    const r = email ? await pool.query('SELECT * FROM users WHERE email=$1 AND active=TRUE LIMIT 1', [email]) : { rows: [] };
    const u = r.rows[0];
    if (!u || !verifyPassword(String(body.password || ''), u.password_hash)) return json(res, 401, { error: 'E-mail ou senha inválidos.' });
    await createSession(res, u.id);
    return json(res, 200, { user: { id: u.id, email: u.email, role: u.role, active: u.active, created_at: u.created_at } });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    const token = parseCookies(req).radar_session;
    if (token) await pool.query('DELETE FROM sessions WHERE token_hash=$1', [tokenHash(token)]);
    res.setHeader('Set-Cookie', 'radar_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    return json(res, 200, { ok: true });
  }

  const user = await currentUser(req);
  if (url.pathname.startsWith('/api/') && !user) return json(res, 401, { error: 'Faça login para continuar.' });
  if (req.method === 'GET' && url.pathname === '/api/me') return json(res, 200, { user });

  if (req.method === 'GET' && url.pathname === '/api/licitacoes') {
    const items = await pncpSearch({ keyword: url.searchParams.get('keyword') || '', uf: (url.searchParams.get('uf') || '').toUpperCase(), modality: url.searchParams.get('modalidade') || '', days: url.searchParams.get('days') || '7' });
    return json(res, 200, { source: 'PNCP', items });
  }

  if (req.method === 'GET' && url.pathname === '/api/preferences') {
    const r = await pool.query('SELECT uf,keyword,modality_code,enabled FROM alert_preferences WHERE user_id=$1', [user.id]);
    return json(res, 200, { preference: r.rows[0] || null });
  }
  if (req.method === 'PUT' && url.pathname === '/api/preferences') {
    const b = await readJson(req);
    const uf = String(b.uf || '').trim().toUpperCase();
    if (uf && !/^[A-Z]{2}$/.test(uf)) return json(res, 400, { error: 'UF inválida.' });
    const modality = b.modality_code === null || b.modality_code === '' ? null : Number(b.modality_code);
    if (modality !== null && (!Number.isInteger(modality) || modality < 1 || modality > 99)) return json(res, 400, { error: 'Modalidade inválida.' });
    await pool.query(`INSERT INTO alert_preferences(user_id,uf,keyword,modality_code,enabled) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(user_id) DO UPDATE SET uf=EXCLUDED.uf,keyword=EXCLUDED.keyword,modality_code=EXCLUDED.modality_code,enabled=EXCLUDED.enabled,updated_at=NOW()`, [user.id, uf || null, String(b.keyword || '').trim().slice(0,180) || null, modality, b.enabled !== false]);
    return json(res, 200, { ok: true });
  }

  if (req.method === 'GET' && url.pathname === '/api/documents') {
    const r = await pool.query('SELECT id,filename,mime_type,size_bytes,created_at FROM documents WHERE user_id=$1 ORDER BY id DESC LIMIT 100', [user.id]);
    return json(res, 200, { items: r.rows });
  }
  if (req.method === 'POST' && url.pathname === '/api/documents') {
    const b = await readJson(req, 3_000_000);
    const filename = String(b.filename || '').replace(/[\\/\0]/g, '_').slice(0,180);
    const mime = String(b.mime_type || 'application/octet-stream').slice(0,120);
    if (!filename || typeof b.content_base64 !== 'string') return json(res, 400, { error: 'Arquivo inválido.' });
    const buf = Buffer.from(b.content_base64, 'base64');
    if (!buf.length || buf.length > 2 * 1024 * 1024) return json(res, 400, { error: 'Arquivo vazio ou maior que 2 MB.' });
    const r = await pool.query('INSERT INTO documents(user_id,filename,mime_type,content,size_bytes) VALUES($1,$2,$3,$4,$5) RETURNING id', [user.id, filename, mime, buf, buf.length]);
    return json(res, 201, { id: r.rows[0].id });
  }
  const download = url.pathname.match(/^\/api\/documents\/(\d+)\/download$/);
  if (req.method === 'GET' && download) {
    const r = await pool.query('SELECT filename,mime_type,content FROM documents WHERE id=$1 AND user_id=$2', [download[1], user.id]);
    if (!r.rowCount) return json(res, 404, { error: 'Documento não encontrado.' });
    const d = r.rows[0];
    securityHeaders(res, d.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(d.filename)}`);
    res.statusCode = 200; return res.end(d.content);
  }
  const delDoc = url.pathname.match(/^\/api\/documents\/(\d+)$/);
  if (req.method === 'DELETE' && delDoc) {
    await pool.query('DELETE FROM documents WHERE id=$1 AND user_id=$2', [delDoc[1], user.id]);
    return json(res, 200, { ok: true });
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/users') {
    if (user.role !== 'admin') return json(res, 403, { error: 'Acesso restrito ao administrador.' });
    const r = await pool.query('SELECT id,email,role,active,created_at FROM users ORDER BY id DESC LIMIT 500');
    return json(res, 200, { items: r.rows });
  }

  return json(res, 404, { error: 'Rota não encontrada.' });
}

await initDb();
await pool.query('DELETE FROM sessions WHERE expires_at < NOW()');
const server = http.createServer((req, res) => route(req, res).catch(err => {
  console.error(err);
  json(res, err.status || 500, { error: err.status ? err.message : 'Erro interno do servidor.' });
}));
server.listen(PORT, '0.0.0.0', () => console.log(`Radar listening on ${PORT}`));
