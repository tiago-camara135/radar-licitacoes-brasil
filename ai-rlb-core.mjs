const AI_DAILY_LIMIT = Math.max(1, Math.min(Number(process.env.AI_DAILY_LIMIT || 50), 500));
const ENGINE_NAME = 'IA RLB Oficial';
const CACHE = new Map();

const OFFICIAL = {
  lei14133: {
    id: 'lei14133',
    title: 'Lei nº 14.133/2021 — Presidência da República',
    url: 'https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm',
    ttl: 24 * 60 * 60 * 1000
  },
  pncp: {
    id: 'pncp',
    title: 'PNCP — Perguntas e Respostas',
    url: 'https://www.gov.br/pncp/pt-br/pncp/perguntas-e-respostas/',
    ttl: 6 * 60 * 60 * 1000
  },
  compras: {
    id: 'compras',
    title: 'Compras.gov.br — Portal de Dados Abertos',
    url: 'https://www.gov.br/compras/pt-br/cidadao/portal-de-dados-abertos',
    ttl: 6 * 60 * 60 * 1000
  },
  manuais: {
    id: 'manuais',
    title: 'Compras.gov.br — Manuais e documentação',
    url: 'https://www.gov.br/compras/pt-br/acesso-a-informacao/manuais',
    ttl: 6 * 60 * 60 * 1000
  }
};

const STOP = new Set('a o os as um uma uns umas de da do das dos em no na nos nas por para com sem e ou que qual quais como quando onde quem isso isto esse essa esses essas ao aos à às se sua seu suas seus sobre entre mais menos muito muita também ja já ser estar ter tem pode podem deve devem foi são é eu voce você voces vocês meu minha'.split(/\s+/));
const TOPICS = [
  { words: ['planejamento','etp','estudo tecnico','estudo técnico','pca','plano de contratacoes','plano de contratações'], articles: ['18'] },
  { words: ['edital','impugnacao','impugnação','esclarecimento'], articles: ['25','164'] },
  { words: ['pregao','pregão'], articles: ['6','28','29'] },
  { words: ['concorrencia','concorrência'], articles: ['6','28','29'] },
  { words: ['dispensa','contratacao direta','contratação direta'], articles: ['72','75'] },
  { words: ['inexigibilidade'], articles: ['72','74'] },
  { words: ['habilitacao','habilitação','juridica','jurídica','fiscal','trabalhista','economico-financeira','econômico-financeira','tecnica','técnica'], articles: ['62','63','64','65','66','67','68','69','70'] },
  { words: ['atestado','capacidade tecnica','capacidade técnica','qualificacao tecnica','qualificação técnica'], articles: ['67'] },
  { words: ['garantia contratual','garantia'], articles: ['96','97','98','99','100','101','102'] },
  { words: ['fiscal do contrato','gestor do contrato','fiscalizacao','fiscalização'], articles: ['117'] },
  { words: ['alteracao contratual','alteração contratual','aditivo','acrescimo','acréscimo','supressao','supressão'], articles: ['124','125','126','127','128','129','130','131','132','133','134','135','136'] },
  { words: ['reajuste','reequilibrio','reequilíbrio','revisao','revisão'], articles: ['92','124','134','135'] },
  { words: ['recurso','intencao de recurso','intenção de recurso'], articles: ['165','166','167','168'] },
  { words: ['registro de precos','registro de preços','srp','ata de registro'], articles: ['82','83','84','85','86'] },
  { words: ['sancao','sanção','penalidade','multa','impedimento','inidoneidade'], articles: ['155','156','157','158','159','160','161','162','163'] },
  { words: ['inexequibilidade','inexequivel','inexequível','exequibilidade','diligencia','diligência'], articles: ['59','64'] },
  { words: ['contrato','vigencia','vigência','prorrogacao','prorrogação'], articles: ['89','90','91','92','105','106','107','108','109','110','111','112','113','114'] }
];

const clean = (v, max = 5000) => String(v ?? '').trim().slice(0, max);
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const words = s => [...new Set(norm(s).replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w => w.length >= 3 && !STOP.has(w)))];

function decodeEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'")
    .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)));
}
function htmlToText(html) {
  return decodeEntities(String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr|\/section|\/article)>/gi,'\n')
    .replace(/<[^>]+>/g,' '))
    .replace(/\r/g,'').replace(/[\t ]+/g,' ').replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
async function fetchText(url, ttl = 60 * 60 * 1000) {
  const hit = CACHE.get(url);
  if (hit && Date.now() - hit.at < ttl) return hit.text;
  const r = await fetch(url, { headers: { 'User-Agent': 'RadarLicitacoesBrasil/3.0 (consulta publica institucional)', 'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const ct = String(r.headers.get('content-type') || '').toLowerCase();
  let enc = 'utf-8';
  if (ct.includes('iso-8859-1') || ct.includes('latin1') || ct.includes('windows-1252')) enc = 'windows-1252';
  let raw;
  try { raw = new TextDecoder(enc).decode(buf); } catch { raw = buf.toString('utf8'); }
  const text = ct.includes('html') || /<html/i.test(raw.slice(0,1000)) ? htmlToText(raw) : raw;
  CACHE.set(url,{ at: Date.now(), text });
  return text;
}
function splitSegments(text, sourceId) {
  const t = String(text || '').replace(/\u00a0/g,' ');
  if (sourceId === 'lei14133') {
    const pieces = t.split(/(?=\bArt\.\s*\d+[ºo]?\.?)/gi).map(x=>x.trim()).filter(x=>x.length>30);
    return pieces.map((x,i)=>({ text:x.slice(0,5000), key:(x.match(/^Art\.\s*(\d+)/i)?.[1] || String(i)) }));
  }
  return t.split(/\n{2,}|(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9])/).map(x=>x.trim()).filter(x=>x.length>45 && x.length<5000).map((x,i)=>({text:x,key:String(i)}));
}
function articleRefs(query) {
  const out = new Set();
  for (const m of String(query).matchAll(/art(?:igo)?\.?\s*(\d{1,3})/gi)) out.add(m[1]);
  const qn = norm(query);
  for (const t of TOPICS) if (t.words.some(w=>qn.includes(norm(w)))) t.articles.forEach(a=>out.add(a));
  return [...out];
}
function scoreSegment(seg, query, refs) {
  const s = norm(seg.text); const toks = words(query);
  let score = 0;
  for (const t of toks) {
    const n = s.split(t).length - 1;
    score += Math.min(n,4) * (t.length >= 7 ? 4 : 2);
  }
  if (refs.includes(String(seg.key))) score += 50;
  if (/^art\./i.test(seg.text)) score += 2;
  return score;
}
function topSegments(segments, query, refs, n=5) {
  return segments.map(seg=>({...seg,score:scoreSegment(seg,query,refs)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,n);
}
function sentenceSummary(text, query, max=3) {
  const toks = words(query);
  const sentences = String(text||'').split(/(?<=[.!?;])\s+/).map(s=>s.trim()).filter(s=>s.length>25);
  return sentences.map(s=>({s, score:toks.reduce((a,t)=>a+(norm(s).includes(t)?1:0),0)})).sort((a,b)=>b.score-a.score).slice(0,max).map(x=>x.s).filter(Boolean);
}
function tcuSearchUrl(query) {
  const q = encodeURIComponent(clean(query.replace(/[?#/]/g,' '),120));
  return `https://pesquisa.apps.tcu.gov.br/documento/publicacao/${q}/%2520/DTRELEVANCIA%2520desc/1`;
}
async function tcuResults(query) {
  const url = tcuSearchUrl(query);
  try {
    const text = await fetchText(url, 20 * 60 * 1000);
    return { url, text };
  } catch { return { url, text:'' }; }
}
function relevantSourceIds(query) {
  const q = norm(query); const ids = ['lei14133'];
  if (/(pncp|portal nacional|ata|contrato|edital|pca|contratacao|contratação)/.test(q)) ids.push('pncp');
  if (/(compras\.gov|comprasgov|siasg|dados abertos|fornecedor|catalogo|catálogo)/.test(q)) ids.push('compras','manuais');
  return [...new Set(ids)];
}
function formatOfficialAnswer(query, hits, sources, docNote='') {
  if (!hits.length) {
    return `**Não encontrei fundamento suficiente nas fontes oficiais consultadas para responder com segurança.**\n\n${docNote ? docNote+'\n\n' : ''}Tente informar o tema com mais detalhes ou citar o artigo, modalidade, fase do processo ou situação concreta. A IA RLB não completa lacunas por suposição.`;
  }
  const lawHits = hits.filter(h=>h.sourceId==='lei14133');
  const otherHits = hits.filter(h=>h.sourceId!=='lei14133');
  let out = `**Resposta baseada em fontes oficiais**\n\n`;
  if (docNote) out += `${docNote}\n\n`;
  if (lawHits.length) {
    const arts = [...new Set(lawHits.map(h=>h.key).filter(k=>/^\d+$/.test(k)))];
    if (arts.length) out += `A Lei nº 14.133/2021 trata do tema principalmente no${arts.length>1?'s':''} art.${arts.length>1?'s':''} ${arts.join(', ')}.\n\n`;
    const summaries = sentenceSummary(lawHits.map(h=>h.text).join(' '), query, 4);
    if (summaries.length) out += `**O que a lei estabelece:**\n${summaries.map(s=>`• ${clean(s,700)}`).join('\n')}\n\n`;
  }
  if (otherHits.length) {
    const summaries = sentenceSummary(otherHits.map(h=>h.text).join(' '), query, 3);
    if (summaries.length) out += `**Complemento das fontes oficiais:**\n${summaries.map(s=>`• ${clean(s,650)}`).join('\n')}\n\n`;
  }
  out += `**Observação:** esta é uma consulta informativa baseada no conteúdo oficial localizado. Em situações com efeitos jurídicos concretos, confira o texto integral e os atos específicos aplicáveis ao processo.`;
  return clean(out,30000);
}

function extractPdfStrings(buffer) {
  const s = Buffer.from(buffer).toString('latin1');
  const parts=[];
  for (const m of s.matchAll(/\(([^()]*(?:\\.[^()]*)*)\)\s*Tj/g)) parts.push(m[1]);
  for (const m of s.matchAll(/\[(.*?)\]\s*TJ/gs)) {
    for (const x of m[1].matchAll(/\(([^()]*(?:\\.[^()]*)*)\)/g)) parts.push(x[1]);
  }
  return parts.join(' ').replace(/\\([()\\])/g,'$1').replace(/\\n/g,' ').replace(/\s+/g,' ').trim();
}
function extractDocumentText(document) {
  if (!document?.content) return '';
  const mime = String(document.mime_type || '').toLowerCase();
  const b = Buffer.from(document.content);
  if (mime.startsWith('text/') || mime.includes('csv')) return b.toString('utf8').slice(0,60000);
  if (mime === 'application/pdf') return extractPdfStrings(b).slice(0,60000);
  return '';
}
function documentQueryNote(document, text, query) {
  if (!document) return '';
  if (!text || text.length < 80) return `**Documento anexado:** ${clean(document.filename,180)}. Não consegui extrair texto suficiente deste arquivo no modo gratuito. Se for PDF escaneado ou arquivo binário, a IA RLB não fará afirmações sobre conteúdo que não conseguiu ler.`;
  const toks=words(query); const lines=text.split(/\n|(?<=[.;:])\s+/).map(x=>x.trim()).filter(x=>x.length>25);
  const best=lines.map(x=>({x,s:toks.reduce((a,t)=>a+(norm(x).includes(t)?1:0),0)})).sort((a,b)=>b.s-a.s).slice(0,4).filter(x=>x.s>0).map(x=>clean(x.x,500));
  return `**Documento analisado:** ${clean(document.filename,180)}.${best.length?` Trechos relacionados à pergunta: ${best.join(' | ')}`:' O texto foi extraído, mas não encontrei trecho diretamente relacionado à pergunta.'}`;
}

export async function initAiTables(pool) {
  if (!pool) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS ai_conversations(
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Nova conversa',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ai_messages(
    id BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN('user','assistant')),
    content TEXT NOT NULL,
    sources JSONB NOT NULL DEFAULT '[]'::jsonb,
    document_id BIGINT REFERENCES documents(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_ai_conv_user ON ai_conversations(user_id,updated_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_ai_msg_conv ON ai_messages(conversation_id,id)');
  console.log(`IA RLB core ready: free official-source mode (${ENGINE_NAME})`);
  fetchText(OFFICIAL.lei14133.url,OFFICIAL.lei14133.ttl).catch(e=>console.warn('IA RLB source warmup:',e.message));
}

export async function configureAiKey() {
  return { configured:true, operational:true, source:'official_public_sources', model:ENGINE_NAME, message:'A IA RLB opera gratuitamente com fontes públicas oficiais e não requer chave de API.' };
}
export async function aiAdminStatus() {
  return { configured:true, operational:true, source:'official_public_sources', model:ENGINE_NAME, secure_storage_available:true, paid_api:false };
}
export async function removeStoredAiKey() {
  return { configured:true, source:'official_public_sources', model:ENGINE_NAME, paid_api:false };
}
async function usageToday(pool,userId){const r=await pool.query(`SELECT COUNT(*)::int n FROM ai_messages WHERE user_id=$1 AND role='user' AND created_at >= date_trunc('day',NOW())`,[userId]);return r.rows[0]?.n||0}
async function getConversation(pool,userId,id){if(!id)return null;const r=await pool.query('SELECT id,title,created_at,updated_at FROM ai_conversations WHERE id=$1 AND user_id=$2',[id,userId]);return r.rows[0]||null}

async function answerFromOfficialSources(query,document) {
  const refs = articleRefs(query);
  const hits=[]; const sources=[];
  for (const id of relevantSourceIds(query)) {
    const src=OFFICIAL[id];
    try {
      const text=await fetchText(src.url,src.ttl);
      const selected=topSegments(splitSegments(text,id),query,refs,id==='lei14133'?6:3);
      selected.forEach(x=>hits.push({...x,sourceId:id}));
      if(selected.length) sources.push({title:src.title,url:src.url});
    } catch(e) { console.warn('IA RLB official source error',id,e.message); }
  }
  const qn=norm(query);
  if (/(tcu|acordao|acórdão|jurisprudencia|jurisprudência|exequibilidade|inexequibilidade|diligencia|diligência|sobrepreco|sobrepreço)/.test(qn)) {
    const tcu=await tcuResults(query);
    if(tcu.text){const sel=topSegments(splitSegments(tcu.text,'tcu'),query,refs,3);sel.forEach(x=>hits.push({...x,sourceId:'tcu'}));if(sel.length)sources.push({title:'Tribunal de Contas da União — Pesquisa',url:tcu.url})}
    else sources.push({title:'Tribunal de Contas da União — Pesquisa',url:tcu.url});
  }
  const docText=extractDocumentText(document);
  const docNote=documentQueryNote(document,docText,query);
  if(document && docText.length>=80){
    const docHits=topSegments(splitSegments(docText,'document'),query,refs,4).map(x=>({...x,sourceId:'document'}));
    hits.push(...docHits);
  }
  return { answer:formatOfficialAnswer(query,hits.filter(h=>h.sourceId!=='document'),sources,docNote), sources:[...new Map(sources.map(s=>[s.url,s])).values()].slice(0,8) };
}

export async function aiStatus(pool,userId){const used=await usageToday(pool,userId);return {configured:true,operational:true,model:ENGINE_NAME,mode:'official_public_sources',web_search:true,document_analysis:true,paid_api:false,daily_limit:AI_DAILY_LIMIT,used_today:used,sources:['Planalto','PNCP','Compras.gov.br','TCU']}}
export async function listAiConversations(pool,userId){const r=await pool.query('SELECT id,title,created_at,updated_at FROM ai_conversations WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 40',[userId]);return r.rows}
export async function listAiMessages(pool,userId,conversationId){const conv=await getConversation(pool,userId,conversationId);if(!conv)throw Object.assign(new Error('Conversa não encontrada.'),{status:404});const r=await pool.query('SELECT id,role,content,sources,document_id,created_at FROM ai_messages WHERE conversation_id=$1 AND user_id=$2 ORDER BY id ASC LIMIT 200',[conversationId,userId]);return {conversation:conv,items:r.rows}}
export async function deleteAiConversation(pool,userId,conversationId){await pool.query('DELETE FROM ai_conversations WHERE id=$1 AND user_id=$2',[conversationId,userId])}
export async function runAiChat({pool,userId,body,document}){
  const used=await usageToday(pool,userId);if(used>=AI_DAILY_LIMIT)throw Object.assign(new Error(`Limite diário da IA RLB atingido (${AI_DAILY_LIMIT} mensagens).`),{status:429,code:'daily_limit'});
  const message=clean(body.message,6000);if(!message)throw Object.assign(new Error('Digite uma pergunta para a IA RLB.'),{status:400});
  let conv=await getConversation(pool,userId,Number(body.conversation_id)||null);if(!conv){const r=await pool.query('INSERT INTO ai_conversations(user_id,title) VALUES($1,$2) RETURNING id,title,created_at,updated_at',[userId,message.replace(/\s+/g,' ').slice(0,70)]);conv=r.rows[0]}
  const result=await answerFromOfficialSources(message,document);
  const client=await pool.connect();try{await client.query('BEGIN');await client.query("INSERT INTO ai_messages(conversation_id,user_id,role,content,sources,document_id) VALUES($1,$2,'user',$3,'[]'::jsonb,$4)",[conv.id,userId,message,document?.id||null]);await client.query("INSERT INTO ai_messages(conversation_id,user_id,role,content,sources,document_id) VALUES($1,$2,'assistant',$3,$4,$5)",[conv.id,userId,result.answer,JSON.stringify(result.sources),document?.id||null]);await client.query('UPDATE ai_conversations SET updated_at=NOW() WHERE id=$1',[conv.id]);await client.query('COMMIT')}catch(e){try{await client.query('ROLLBACK')}catch{}throw e}finally{client.release()}
  return {conversation_id:conv.id,answer:result.answer,sources:result.sources,used_today:used+1,daily_limit:AI_DAILY_LIMIT,mode:'official_public_sources'};
}
