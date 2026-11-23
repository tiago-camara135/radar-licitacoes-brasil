import { isSafePublicOriginUrl } from './tender-source-resilience-v2.mjs';

const documentPath = /^\/api\/radar\/documents\/(\d{14})\/(\d{4})\/([1-9]\d{0,8})$/;
const downloadPath = /^\/api\/radar\/documents\/(\d{14})\/(\d{4})\/([1-9]\d{0,8})\/([1-9]\d{0,9})\/download$/;
const savedPath = /^\/api\/radar\/saved\/(tender|search)(?:\/([\w-]{1,100}))?$/;
const text = (value, max) => String(value ?? '').trim().slice(0, max);

function publicUrl(value) {
  return isSafePublicOriginUrl(value) ? new URL(value).href : '';
}

async function documents(cnpj, year, sequence) {
  const base = `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/compras/${year}/${sequence}/arquivos`;
  const response = await fetch(base, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(18000) });
  if (response.status === 404 || response.status === 204) return [];
  if (!response.ok) throw new Error('PNCP indisponível');
  const json = await response.json();
  const list = Array.isArray(json) ? json : json?.documentos;
  if (!Array.isArray(list)) throw new Error('Resposta de documentos inválida');
  const fromOrigin = response.headers.get('x-rlb-source') === 'origin-fallback';
  return list.filter(doc => Number.isSafeInteger(Number(doc?.sequencialDocumento)) && Number(doc.sequencialDocumento) > 0).map(doc => ({
    id: Number(doc.sequencialDocumento),
    title: text(doc.titulo || doc.tipoDocumentoNome || 'Documento', 300),
    type: text(doc.tipoDocumentoNome, 180),
    publishedAt: text(doc.dataPublicacaoPncp, 40),
    source: fromOrigin ? 'Portal de origem' : 'PNCP',
    url: publicUrl(doc.url) || (fromOrigin ? '' : `${base}/${doc.sequencialDocumento}`)
  })).filter(doc => doc.url);
}

async function downloadDocument(res, [cnpj, year, sequence, id], name) {
  const source = `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/compras/${year}/${sequence}/arquivos/${id}`;
  const fallback = () => {
    res.statusCode = 302;
    res.setHeader('Location', source);
    res.setHeader('Cache-Control', 'no-store');
    return res.end();
  };
  const limit = 16 * 1024 * 1024;
  try {
    const response = await fetch(source, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    const mime = response.headers.get('content-type') || '';
    if (!response.ok || !response.body || /html|json|xml/i.test(mime) || Number(response.headers.get('content-length')) > limit) {
      await response.body?.cancel();
      return fallback();
    }
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > limit) break;
      chunks.push(chunk);
    }
    if (!length || length > limit) return fallback();
    const filename = text(name, 180).replace(/[\u0000-\u001f\u007f/\\]/g, '_').toWellFormed() || `documento-${id}`;
    const completeName = /application\/pdf/i.test(mime) && !/\.pdf$/i.test(filename) ? filename + '.pdf' : filename;
    const encoded = encodeURIComponent(completeName).replace(/['()*]/g, char => '%' + char.charCodeAt(0).toString(16));
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encoded);
    res.setHeader('Content-Length', length);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(Buffer.concat(chunks, length));
  } catch {
    return fallback();
  }
}

function savedData(kind, body) {
  if (kind === 'search') {
    const name = text(body?.name, 80);
    if (!name) return null;
    return { name, query: text(body.query, 700) };
  }
  const title = text(body?.title, 5000);
  if (!title) return null;
  return {
    title, place: text(body.place, 240), org: text(body.org, 400),
    modality: text(body.modality, 120), number: text(body.number, 180),
    published: text(body.published, 40), opening: text(body.opening, 40), closing: text(body.closing, 40),
    status: text(body.status, 120), value: text(body.value, 60),
    official: publicUrl(body.official), origin: publicUrl(body.origin)
  };
}

export function createRadarWorkspaceRouter({ pool, readJson, json }) {
  let schema, preferencesSchema;
  const preferences = new Map();
  function ensurePreferencesSchema() {
    preferencesSchema ??= pool.query(`CREATE TABLE IF NOT EXISTS radar_user_preferences (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      default_uf TEXT NOT NULL DEFAULT ''
    )`).catch(error => { preferencesSchema = undefined; throw error; });
    return preferencesSchema;
  }
  const memory = new Map();
  function ensureSchema() {
    schema ??= pool.query(`CREATE TABLE IF NOT EXISTS radar_workspace_saved (
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('tender','search')),
      item_key TEXT NOT NULL,
      payload JSONB NOT NULL,
      saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, kind, item_key)
    )`).catch(error => { schema = undefined; throw error; });
    return schema;
  }
  return async function handleRadarWorkspace(req, res, url, user) {
    if (url.pathname === '/api/radar/preferences') {
      if (!['GET','PUT'].includes(req.method)) return json(res, 405, {error:'Método não permitido.'});
      if (req.method === 'PUT' && req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, {error:'Origem não autorizada.'});
      if (pool) await ensurePreferencesSchema();
      if (req.method === 'GET') {
        const uf = pool
          ? (await pool.query('SELECT default_uf FROM radar_user_preferences WHERE user_id=$1', [user.id])).rows[0]?.default_uf
          : preferences.get(user.id);
        return json(res, 200, {uf:uf || ''});
      }
      const {uf} = await readJson(req, 1024) || {};
      if (typeof uf !== 'string' || !/^(?:AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)?$/.test(uf)) {
        return json(res, 400, {error:'Selecione uma UF válida.'});
      }
      if (pool) await pool.query(`INSERT INTO radar_user_preferences(user_id,default_uf) VALUES ($1,$2)
        ON CONFLICT(user_id) DO UPDATE SET default_uf=EXCLUDED.default_uf`, [user.id,uf]);
      else preferences.set(user.id,uf);
      return json(res, 200, {uf});
    }
    const download = url.pathname.match(downloadPath);
    if (download && req.method === 'GET') return downloadDocument(res, download.slice(1), url.searchParams.get('name'));
    const file = url.pathname.match(documentPath);
    if (file && req.method === 'GET') {
      try {
        return json(res, 200, { items: await documents(...file.slice(1)) });
      } catch {
        return json(res, 502, { error: 'Não foi possível consultar os documentos. Abra a fonte oficial ou tente novamente.' });
      }
    }
    if (url.pathname === '/api/radar/metrics' && req.method === 'GET') {
      if (!pool) return json(res, 200, { recent: 0, soon: 0 });
      const { rows } = await pool.query(`SELECT
        COUNT(*) FILTER (WHERE published_at >= now() - interval '1 day')::int AS recent,
        COUNT(*) FILTER (WHERE closes_at <= now() + interval '7 days')::int AS soon
        FROM monitored_procurements WHERE closes_at >= now()`);
      return json(res, 200, rows[0]);
    }
    const match = url.pathname.match(savedPath);
    if (!match) return false;
    const [, kind, key] = match;
    const values = [user.id, kind];
    const bucket = `${user.id}:${kind}`;
    if (pool) await ensureSchema();
    if (req.method === 'GET' && !key) {
      const items = pool
        ? (await pool.query('SELECT item_key AS key, payload FROM radar_workspace_saved WHERE user_id=$1 AND kind=$2 ORDER BY saved_at DESC, item_key', values)).rows
        : [...(memory.get(bucket)?.values() || [])].reverse();
      return json(res, 200, { items });
    }
    if (req.method === 'PUT' && key) {
      if (req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { error: 'Origem não autorizada.' });
      const payload = savedData(kind, await readJson(req, 16000));
      if (!payload) return json(res, 400, { error: 'Dados para salvar inválidos.' });
      if (pool) await pool.query(`INSERT INTO radar_workspace_saved(user_id,kind,item_key,payload)
        VALUES ($1,$2,$3,$4) ON CONFLICT (user_id,kind,item_key)
        DO UPDATE SET payload=EXCLUDED.payload`, [...values, key, JSON.stringify(payload)]);
      else {
        if (!memory.has(bucket)) memory.set(bucket, new Map());
        memory.get(bucket).set(key, { key, payload });
      }
      return json(res, 200, { item: { key, payload } });
    }
    if (req.method === 'DELETE' && key) {
      if (req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { error: 'Origem não autorizada.' });
      if (pool) await pool.query('DELETE FROM radar_workspace_saved WHERE user_id=$1 AND kind=$2 AND item_key=$3', [...values, key]);
      else memory.get(bucket)?.delete(key);
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { error: 'Método não permitido.' });
  };
}
