import crypto from 'node:crypto';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';

const SECRET = process.env.AI_RLB_SECRET || process.env.ADMIN_PASSWORD || process.env.DATABASE_URL || '';
const CACHE = new Map();
let preferredModel = null;

const MODEL_CANDIDATES = () => [...new Set([
  preferredModel,
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  process.env.GEMINI_MODEL,
  'gemini-3.1-flash-lite'
].filter(Boolean))];

const SOURCES = [
  { title: 'Senado Federal — Lei nº 14.133/2021', url: 'https://legis.senado.leg.br/norma/33382036/publicacao/33383820', legal: true },
  { title: 'Câmara dos Deputados — Lei nº 14.133/2021', url: 'https://www2.camara.leg.br/legin/fed/lei/2021/lei-14133-1-abril-2021-791222-norma-pl.html', legal: true },
  { title: 'PNCP — Perguntas e Respostas', url: 'https://www.gov.br/pncp/pt-br/pncp/perguntas-e-respostas/', legal: false },
  { title: 'Compras.gov.br — Manuais', url: 'https://www.gov.br/compras/pt-br/acesso-a-informacao/manuais', legal: false }
];

const STOP = new Set('a o os as um uma uns umas de da do das dos em no na nos nas por para com sem e ou que qual quais como quando onde quem isso isto esse essa esses essas ao aos se sua seu suas seus sobre entre mais menos muito muita tambem ja ser estar ter tem pode podem deve devem foi sao eu voce voces meu minha'.split(/\s+/));
const clean = (v, n = 6000) => String(v ?? '').trim().slice(0, n);
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const words = s => [...new Set(norm(s).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length >= 3 && !STOP.has(w)))];

function deriveKey() {
  if (!SECRET) return null;
  return crypto.scryptSync(SECRET, 'ia-rlb-free-provider-v1', 32);
}
function unseal(value) {
  const key = deriveKey();
  if (!key || !value) return null;
  try {
    const b = Buffer.from(String(value), 'base64url');
    const iv = b.subarray(0, 12), tag = b.subarray(12, 28), enc = b.subarray(28);
    const dec = crypto.createDecipheriv('aes-256-gcm', key, iv);
    dec.setAuthTag(tag);
    return Buffer.concat([dec.update(enc), dec.final()]).toString('utf8');
  } catch { return null; }
}
async function geminiKey(pool) {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const r = await pool.query("SELECT api_key_cipher FROM ai_provider_settings WHERE id=1 AND provider='gemini' AND enabled=TRUE LIMIT 1");
  return unseal(r.rows[0]?.api_key_cipher);
}

function htmlToText(input) {
  return String(input || '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr|\/section|\/article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
async function fetchText(url) {
  const hit = CACHE.get(url);
  if (hit && Date.now() - hit.at < 6 * 60 * 60 * 1000) return hit.text;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'RadarLicitacoesBrasil-GeminiOnly/1.0', 'Accept': 'text/html,text/plain;q=0.9,*/*;q=.5' },
    signal: AbortSignal.timeout(12000)
  });
  if (!r.ok) throw new Error(`Fonte oficial HTTP ${r.status}`);
  const raw = Buffer.from(await r.arrayBuffer()).toString('utf8');
  const text = htmlToText(raw);
  CACHE.set(url, { at: Date.now(), text });
  return text;
}
function chunks(text) {
  return String(text || '').split(/(?=\bArt\.\s*\d+[ºo]?\.?)|\n{2,}/gi).map(x => x.trim()).filter(x => x.length > 70 && x.length < 7000);
}
function rank(list, query) {
  const toks = words(query);
  return list.map(text => {
    const t = norm(text);
    let score = 0;
    for (const w of toks) score += Math.min(t.split(w).length - 1, 5) * (w.length > 7 ? 5 : 2);
    return { text, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);
}
function obviousSocial(message) {
  const s = norm(message).replace(/[^a-z0-9\s?]/g, ' ').replace(/\s+/g, ' ').trim();
  return /^(oi|ola|bom dia|boa tarde|boa noite|tudo bem|como vai|obrigado|obrigada|valeu|ate logo|tchau)(\s|\?|$)/.test(s) && s.split(' ').length <= 8;
}
async function collectEvidence(query) {
  if (obviousSocial(query)) return { hits: [], sources: [] };
  const settled = await Promise.allSettled(SOURCES.map(async src => ({ src, text: await fetchText(src.url) })));
  const hits = [], sources = [];
  for (const item of settled) {
    if (item.status !== 'fulfilled') continue;
    const { src, text } = item.value;
    const selected = rank(chunks(text), query).slice(0, src.legal ? 4 : 2);
    for (const x of selected) hits.push({ source: src.title, url: src.url, text: x.text.slice(0, 1200) });
    if (selected.length) sources.push({ title: src.title, url: src.url });
  }
  return { hits: hits.slice(0, 8), sources: [...new Map(sources.map(x => [x.url, x])).values()] };
}

async function history(pool, userId, conversationId) {
  if (!conversationId) return [];
  const r = await pool.query('SELECT role,content FROM ai_messages WHERE conversation_id=$1 AND user_id=$2 ORDER BY id DESC LIMIT 14', [conversationId, userId]);
  return r.rows.reverse();
}
async function getConv(pool, userId, id) {
  if (!id) return null;
  const r = await pool.query('SELECT id,title FROM ai_conversations WHERE id=$1 AND user_id=$2', [id, userId]);
  return r.rows[0] || null;
}
async function newConv(pool, userId, message) {
  const r = await pool.query('INSERT INTO ai_conversations(user_id,title) VALUES($1,$2) RETURNING id,title', [userId, clean(message.replace(/\s+/g, ' '), 70)]);
  return r.rows[0];
}
async function usage(pool, userId) {
  const r = await pool.query("SELECT COUNT(*)::int n FROM ai_messages WHERE user_id=$1 AND role='user' AND created_at>=date_trunc('day',NOW())", [userId]);
  return r.rows[0]?.n || 0;
}
async function persist(pool, userId, conv, message, answer, sources) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query("INSERT INTO ai_messages(conversation_id,user_id,role,content,sources) VALUES($1,$2,'user',$3,'[]'::jsonb)", [conv.id, userId, message]);
    await c.query("INSERT INTO ai_messages(conversation_id,user_id,role,content,sources) VALUES($1,$2,'assistant',$3,$4)", [conv.id, userId, answer, JSON.stringify(sources || [])]);
    await c.query('UPDATE ai_conversations SET updated_at=NOW() WHERE id=$1', [conv.id]);
    await c.query('COMMIT');
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch {}
    throw e;
  } finally { c.release(); }
}
function modelHistory(items) {
  return items.slice(-8).map(x => ({ role: x.role === 'assistant' ? 'model' : 'user', parts: [{ text: clean(x.content, 1800) }] }));
}

const SYSTEM = `Você é a IA RLB, assistente conversacional especializado em licitações, contratos administrativos e compras públicas brasileiras.
Toda interpretação, raciocínio, resposta e análise deve ser feita por você, Gemini.
Converse de forma natural, contextual e humana, sem parecer um buscador automático.
REGRAS:
- Se a mensagem for saudação, agradecimento ou conversa simples, responda naturalmente e não fale de lei ou fontes sem necessidade.
- Entenda o contexto das mensagens anteriores. Perguntas curtas podem ser continuação do assunto anterior.
- Se a pergunta for ambígua, faça uma pergunta curta de esclarecimento antes de concluir.
- Para fatos jurídicos, artigos, prazos, impedimentos, requisitos e procedimentos, use somente as EVIDÊNCIAS OFICIAIS fornecidas nesta chamada.
- Não invente artigo, acórdão, jurisprudência, prazo, requisito ou regra.
- Se as evidências não forem suficientes, diga isso de forma natural e peça o contexto mínimo necessário.
- Quando houver documento, analise o documento de forma crítica, identifique tipo, finalidade, inconsistências, riscos, pontos de atenção e melhorias, sempre cruzando com as evidências oficiais quando houver conteúdo jurídico.
- Responda primeiro ao ponto perguntado e depois explique de forma prática. Não despeje texto bruto da lei.
- Português brasileiro, tom profissional, claro e próximo. Evite bordões repetitivos e respostas engessadas.`;

function inferMime(document) {
  const mime = String(document?.mime_type || '').toLowerCase();
  if (mime) return mime;
  const name = String(document?.filename || '').toLowerCase();
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (name.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (name.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (name.endsWith('.csv')) return 'text/csv';
  if (name.endsWith('.json')) return 'application/json';
  if (name.endsWith('.html') || name.endsWith('.htm')) return 'text/html';
  if (name.endsWith('.md')) return 'text/markdown';
  if (name.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
}
function asBuffer(content) {
  if (Buffer.isBuffer(content)) return content;
  if (content?.type === 'Buffer' && Array.isArray(content.data)) return Buffer.from(content.data);
  if (typeof content === 'string') return Buffer.from(content, 'utf8');
  return Buffer.from(content || '');
}
function cellText(value) {
  if (value == null) return '';
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map(x => x.text || '').join('');
    if (value.text != null) return String(value.text);
    if (value.result != null) return String(value.result);
    if (value.formula != null) return String(value.result ?? value.formula);
  }
  return String(value);
}
async function prepareDocument(document) {
  if (!document) return { parts: [], searchText: '' };
  const buffer = asBuffer(document.content);
  const mime = inferMime(document);
  const filename = String(document.filename || 'documento');
  if (!buffer.length) throw Object.assign(new Error('O documento está vazio.'), { status: 400, publicCode: 'empty_document' });

  if (mime === 'application/pdf' || mime.startsWith('image/')) {
    return {
      parts: [
        { inlineData: { mimeType: mime, data: buffer.toString('base64') } },
        { text: `Arquivo anexado: ${filename}` }
      ],
      searchText: filename
    };
  }

  if (mime.includes('wordprocessingml') || filename.toLowerCase().endsWith('.docx')) {
    const out = await mammoth.extractRawText({ buffer });
    const text = clean(out.value, 60000);
    return { parts: [{ text: `CONTEÚDO EXTRAÍDO DO DOCX ${filename}:\n${text}` }], searchText: text.slice(0, 8000) };
  }

  if (mime.includes('spreadsheetml') || filename.toLowerCase().endsWith('.xlsx')) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheets = [];
    for (const ws of workbook.worksheets) {
      const rows = [];
      ws.eachRow({ includeEmpty: false }, row => {
        const values = Array.isArray(row.values) ? row.values.slice(1).map(cellText) : [];
        rows.push(values.join('\t'));
      });
      sheets.push(`PLANILHA: ${ws.name}\n${rows.join('\n')}`);
    }
    const text = clean(sheets.join('\n\n'), 60000);
    return { parts: [{ text: `CONTEÚDO EXTRAÍDO DA PLANILHA ${filename}:\n${text}` }], searchText: text.slice(0, 8000) };
  }

  if (mime.includes('ms-excel') || filename.toLowerCase().endsWith('.xls')) {
    throw Object.assign(new Error('Para manter a análise 100% Gemini com processamento seguro, converta o arquivo .XLS para .XLSX, CSV ou PDF.'), { status: 415, publicCode: 'legacy_xls_unsupported' });
  }

  if (mime.startsWith('text/') || ['application/json', 'application/xml'].includes(mime) || /\.(txt|md|csv|json|html?|xml)$/i.test(filename)) {
    const text = clean(buffer.toString('utf8'), 60000);
    return { parts: [{ text: `CONTEÚDO DO ARQUIVO ${filename}:\n${text}` }], searchText: text.slice(0, 8000) };
  }

  throw Object.assign(new Error('Para análise 100% Gemini, este formato ainda não é compatível. Converta o arquivo para PDF, DOCX, XLSX, CSV, TXT ou imagem.'), { status: 415, publicCode: 'unsupported_document_type' });
}

async function callModel(apiKey, model, contents, evidenceText) {
  const body = {
    systemInstruction: { parts: [{ text: `${SYSTEM}\n\nEVIDÊNCIAS OFICIAIS DISPONÍVEIS NESTA RESPOSTA:\n${evidenceText || 'Nenhuma evidência oficial relevante foi localizada para esta mensagem.'}` }] },
    contents,
    generationConfig: { temperature: 0.42, topP: 0.9, maxOutputTokens: 1500 }
  };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    signal: AbortSignal.timeout(22000),
    body: JSON.stringify(body)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data?.error?.message || `Gemini ${model} HTTP ${r.status}`), { model, statusCode: r.status });
  const text = (data.candidates?.[0]?.content?.parts || []).map(x => x.text || '').join('').trim();
  if (!text) throw Object.assign(new Error(`Gemini ${model} não retornou texto.`), { model });
  return { text, model };
}
async function cascade(apiKey, contents, evidenceText) {
  let last;
  for (const model of MODEL_CANDIDATES()) {
    try {
      const result = await callModel(apiKey, model, contents, evidenceText);
      preferredModel = model;
      return result;
    } catch (e) {
      last = e;
      if (preferredModel === model) preferredModel = null;
      console.warn('IA RLB Gemini-only attempt failed:', model, e?.message || e);
    }
  }
  throw last || new Error('Gemini indisponível');
}

export async function runForcedGeminiChatV2({ pool, userId, body, document }) {
  const apiKey = await geminiKey(pool);
  if (!apiKey) throw Object.assign(new Error('Gemini não está configurado. Abra as configurações da IA RLB e ative a chave gratuita.'), { status: 503, publicCode: 'gemini_not_configured' });
  const message = clean(body.message || (document ? 'Analise este documento e destaque os principais pontos relacionados a licitações e contratos públicos.' : ''), 6000);
  if (!message) throw Object.assign(new Error('Digite uma mensagem.'), { status: 400, publicCode: 'empty_message' });

  let conv = await getConv(pool, userId, Number(body.conversation_id) || null);
  if (!conv) conv = await newConv(pool, userId, message);
  const hist = await history(pool, userId, conv.id);
  const used = await usage(pool, userId);

  try {
    const doc = await prepareDocument(document);
    const contextQuery = [...hist.filter(x => x.role === 'user').slice(-2).map(x => x.content), message, doc.searchText].join(' ').slice(0, 12000);
    const ev = await collectEvidence(contextQuery);
    const evidenceText = ev.hits.map((h, i) => `[FONTE ${i + 1}] ${h.source}\n${h.text}`).join('\n\n');
    const userParts = [...doc.parts, { text: message }];
    const contents = [...modelHistory(hist), { role: 'user', parts: userParts }];
    const result = await cascade(apiKey, contents, evidenceText);
    const interaction = document ? 'gemini_document_analysis' : (obviousSocial(message) ? 'social' : (ev.hits.length ? 'gemini_procurement' : 'gemini_conversation'));

    await persist(pool, userId, conv, message, result.text, ev.sources);
    console.log('IA RLB Gemini-only response:', result.model, interaction);
    return {
      conversation_id: conv.id,
      answer: result.text,
      sources: ev.sources,
      suggestions: interaction === 'gemini_procurement' || interaction === 'gemini_document_analysis' ? ['Explique mais simples', 'Mostre a base legal', 'Aplique ao meu caso'] : [],
      used_today: used + 1,
      daily_limit: 200,
      mode: 'gemini_only_official_sources',
      interaction_type: interaction,
      provider: 'gemini',
      model: result.model
    };
  } catch (e) {
    if (e?.status && e?.publicCode) throw e;
    console.error('IA RLB Gemini-only failure:', e?.message || e);
    throw Object.assign(new Error('O Gemini não conseguiu concluir esta resposta agora. A IA RLB não utilizou nenhum motor local.'), { status: 503, publicCode: 'gemini_temporarily_unavailable' });
  }
}
