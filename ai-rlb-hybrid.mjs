import crypto from 'node:crypto';

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const GROQ_MODEL = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
const SECRET = process.env.AI_RLB_SECRET || process.env.ADMIN_PASSWORD || process.env.DATABASE_URL || '';
const CACHE = new Map();
const LAW_SOURCES = [
  { id:'senado', title:'Senado Federal — Lei nº 14.133/2021', url:'https://legis.senado.leg.br/norma/33382036/publicacao/33383820', ttl:24*60*60*1000 },
  { id:'camara', title:'Câmara dos Deputados — Lei nº 14.133/2021', url:'https://www2.camara.leg.br/legin/fed/lei/2021/lei-14133-1-abril-2021-791222-norma-pl.html', ttl:24*60*60*1000 }
];
const EXTRA_SOURCES = {
  pncp:{ title:'PNCP — Perguntas e Respostas', url:'https://www.gov.br/pncp/pt-br/pncp/perguntas-e-respostas/', ttl:6*60*60*1000 },
  compras:{ title:'Compras.gov.br — Portal de Dados Abertos', url:'https://www.gov.br/compras/pt-br/cidadao/portal-de-dados-abertos', ttl:6*60*60*1000 },
  manuais:{ title:'Compras.gov.br — Manuais', url:'https://www.gov.br/compras/pt-br/acesso-a-informacao/manuais', ttl:6*60*60*1000 }
};
const STOP = new Set('a o os as um uma uns umas de da do das dos em no na nos nas por para com sem e ou que qual quais como quando onde quem isso isto esse essa esses essas ao aos se sua seu suas seus sobre entre mais menos muito muita tambem ja ser estar ter tem pode podem deve devem foi sao eu voce voces meu minha'.split(/\s+/));
const clean=(v,max=6000)=>String(v??'').trim().slice(0,max);
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const words=s=>[...new Set(norm(s).replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w=>w.length>=3&&!STOP.has(w)))];

function deriveKey(){ if(!SECRET) return null; return crypto.scryptSync(SECRET,'ia-rlb-free-provider-v1',32); }
function seal(value){
  const key=deriveKey(); if(!key) throw Object.assign(new Error('Segredo do servidor não configurado para proteger a chave.'),{status:500});
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);const enc=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]);const tag=cipher.getAuthTag();
  return Buffer.concat([iv,tag,enc]).toString('base64url');
}
function unseal(value){
  const key=deriveKey(); if(!key||!value) return null; try{const b=Buffer.from(String(value),'base64url'),iv=b.subarray(0,12),tag=b.subarray(12,28),enc=b.subarray(28),dec=crypto.createDecipheriv('aes-256-gcm',key,iv);dec.setAuthTag(tag);return Buffer.concat([dec.update(enc),dec.final()]).toString('utf8')}catch{return null}
}

export async function initHybridTables(pool){
  if(!pool)return;
  await pool.query(`CREATE TABLE IF NOT EXISTS ai_provider_settings(
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK(id=1),
    provider TEXT NOT NULL CHECK(provider IN('gemini','groq')),
    api_key_cipher TEXT NOT NULL,
    model TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}
async function storedProvider(pool){
  if(process.env.GEMINI_API_KEY)return {provider:'gemini',apiKey:process.env.GEMINI_API_KEY,model:GEMINI_MODEL,source:'env'};
  if(process.env.GROQ_API_KEY)return {provider:'groq',apiKey:process.env.GROQ_API_KEY,model:GROQ_MODEL,source:'env'};
  const r=await pool.query('SELECT provider,api_key_cipher,model,enabled,updated_at FROM ai_provider_settings WHERE id=1 LIMIT 1');
  const row=r.rows[0];if(!row?.enabled)return null;const apiKey=unseal(row.api_key_cipher);if(!apiKey)return null;return {provider:row.provider,apiKey,model:row.model,source:'database',updated_at:row.updated_at};
}
function publicProvider(p){return p?{configured:true,provider:p.provider,model:p.model,source:p.source,free_tier:true}:{configured:false,provider:null,model:null,free_tier:true}}

async function geminiCall(apiKey,messages,{maxTokens=1200,temperature=.35}={}){
  const system=messages.find(x=>x.role==='system')?.content||'';
  const contents=messages.filter(x=>x.role!=='system').map(x=>({role:x.role==='assistant'?'model':'user',parts:[{text:String(x.content||'')}]}));
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,{
    method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},signal:AbortSignal.timeout(25000),
    body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents,generationConfig:{temperature,maxOutputTokens:maxTokens,topP:.9}})
  });
  const data=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(data?.error?.message||`Gemini HTTP ${r.status}`),{providerStatus:r.status});
  const text=(data.candidates?.[0]?.content?.parts||[]).map(x=>x.text||'').join('').trim();if(!text)throw new Error('Gemini não retornou texto.');return text;
}
async function groqCall(apiKey,messages,{maxTokens=1200,temperature=.35}={}){
  const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{
    method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},signal:AbortSignal.timeout(25000),
    body:JSON.stringify({model:GROQ_MODEL,messages:messages.map(x=>({role:x.role,content:String(x.content||'')})),temperature,max_completion_tokens:maxTokens,reasoning_effort:'none',stream:false})
  });
  const data=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(data?.error?.message||`Groq HTTP ${r.status}`),{providerStatus:r.status});
  const text=String(data.choices?.[0]?.message?.content||'').trim();if(!text)throw new Error('Groq não retornou texto.');return text;
}
async function providerCall(p,messages,opts){return p.provider==='gemini'?geminiCall(p.apiKey,messages,opts):groqCall(p.apiKey,messages,opts)}

async function validateProvider(provider,apiKey){
  if(!['gemini','groq'].includes(provider))throw Object.assign(new Error('Provedor inválido.'),{status:400});
  if(!apiKey||apiKey.length<20)throw Object.assign(new Error('Chave de API inválida.'),{status:400});
  if(provider==='groq'){
    const r=await fetch('https://api.groq.com/openai/v1/models',{headers:{Authorization:`Bearer ${apiKey}`},signal:AbortSignal.timeout(12000)});if(!r.ok)throw Object.assign(new Error('A chave da Groq não foi aceita.'),{status:400});
    return {model:GROQ_MODEL};
  }
  const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models',{headers:{'x-goog-api-key':apiKey},signal:AbortSignal.timeout(12000)});if(!r.ok)throw Object.assign(new Error('A chave do Gemini não foi aceita.'),{status:400});
  return {model:GEMINI_MODEL};
}
export async function hybridAdminStatus(pool){return publicProvider(await storedProvider(pool))}
export async function configureHybridProvider(pool,userId,body={}){
  const provider=String(body.provider||'').toLowerCase(),apiKey=String(body.api_key||'').trim();const valid=await validateProvider(provider,apiKey);const cipher=seal(apiKey);
  await pool.query(`INSERT INTO ai_provider_settings(id,provider,api_key_cipher,model,enabled,updated_by,updated_at) VALUES(1,$1,$2,$3,TRUE,$4,NOW()) ON CONFLICT(id) DO UPDATE SET provider=EXCLUDED.provider,api_key_cipher=EXCLUDED.api_key_cipher,model=EXCLUDED.model,enabled=TRUE,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,[provider,cipher,valid.model,userId]);
  return {configured:true,operational:true,provider,model:valid.model,source:'database',free_tier:true,message:`Motor conversacional gratuito ${provider==='gemini'?'Gemini':'Groq'} ativado.`};
}
export async function removeHybridProvider(pool){await pool.query('DELETE FROM ai_provider_settings WHERE id=1');return {configured:false,free_tier:true,message:'Motor externo gratuito removido. A IA RLB continuará com o modo local de contingência.'}}
export async function hybridStatus(pool,base={}){const p=await storedProvider(pool);return {...base,hybrid_ai:Boolean(p),provider:p?.provider||null,provider_model:p?.model||null,free_provider:true}}

function entities(s){return String(s||'').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)))}
function htmlToText(html){return entities(String(html||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr|\/section|\/article)>/gi,'\n').replace(/<[^>]+>/g,' ')).replace(/\r/g,'').replace(/[\t ]+/g,' ').replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim()}
async function fetchText(url,ttl){const h=CACHE.get(url);if(h&&Date.now()-h.at<ttl)return h.text;const r=await fetch(url,{headers:{'User-Agent':'RadarLicitacoesBrasil-Hybrid/1.0','Accept':'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5'},signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error(`HTTP ${r.status}`);const raw=Buffer.from(await r.arrayBuffer()).toString('utf8'),text=/<html/i.test(raw.slice(0,1000))?htmlToText(raw):raw;CACHE.set(url,{at:Date.now(),text});return text}
async function fetchLaw(){let last;for(const src of LAW_SOURCES){try{return {src,text:await fetchText(src.url,src.ttl)}}catch(e){last=e}}throw last||new Error('Fonte legal indisponível')}
function lawSegments(text){return String(text||'').split(/(?=\bArt\.\s*\d+[ºo]?\.?)/gi).map(x=>x.trim()).filter(x=>x.length>40).map((x,i)=>({text:x.slice(0,6000),article:x.match(/^Art\.\s*(\d+)/i)?.[1]||String(i)}))}
function genericSegments(text){return String(text||'').split(/\n{2,}|(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9])/).map(x=>x.trim()).filter(x=>x.length>50&&x.length<5000).map((x,i)=>({text:x,key:String(i)}))}
function rankSegments(segs,query,terms=[],articles=[]){const toks=[...new Set([...words(query),...terms.flatMap(words)])],arts=new Set((articles||[]).map(String));return segs.map(s=>{const t=norm(s.text);let score=0;for(const w of toks){const c=t.split(w).length-1;score+=Math.min(c,4)*(w.length>7?5:2)}if(arts.has(String(s.article)))score+=80;return {...s,score}}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,9)}
function extractJson(text){const s=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/```$/,'').trim();try{return JSON.parse(s)}catch{const a=s.indexOf('{'),b=s.lastIndexOf('}');if(a>=0&&b>a){try{return JSON.parse(s.slice(a,b+1))}catch{}}return null}}
async function recent(pool,userId,conversationId){if(!conversationId)return[];const r=await pool.query('SELECT role,content FROM ai_messages WHERE conversation_id=$1 AND user_id=$2 ORDER BY id DESC LIMIT 14',[conversationId,userId]);return r.rows.reverse()}
async function getConversation(pool,userId,id){if(!id)return null;const r=await pool.query('SELECT id,title FROM ai_conversations WHERE id=$1 AND user_id=$2',[id,userId]);return r.rows[0]||null}
async function createConversation(pool,userId,message){const r=await pool.query('INSERT INTO ai_conversations(user_id,title) VALUES($1,$2) RETURNING id,title',[userId,clean(message.replace(/\s+/g,' '),70)]);return r.rows[0]}
async function usageToday(pool,userId){const r=await pool.query(`SELECT COUNT(*)::int n FROM ai_messages WHERE user_id=$1 AND role='user' AND created_at>=date_trunc('day',NOW())`,[userId]);return r.rows[0]?.n||0}

function plannerSystem(){return `Você é o interpretador conversacional da IA RLB, especializada em licitações e contratos públicos brasileiros. Sua tarefa aqui NÃO é responder juridicamente: é entender exatamente o que o usuário quis dizer.
Retorne SOMENTE JSON válido com: mode (social|procurement|clarify|other), normalized_question, search_terms (array), likely_articles (array de números em string), clarification_question, direct_answer.
Regras:
- Preserve o contexto das mensagens anteriores.
- Perguntas ambíguas devem virar clarify antes de qualquer pesquisa. Exemplo: "quem pode licitar?" pode significar quem pode PARTICIPAR como licitante ou quem pode REALIZAR/conduzir a licitação na Administração; pergunte qual sentido. "quem pode contratar?" também é ambígua entre quem pode ser contratado e qual autoridade/órgão pode contratar.
- Saudações, agradecimentos e conversa comum são social e direct_answer deve soar natural em português brasileiro.
- procurement é usado quando a intenção jurídica está clara. search_terms devem conter expressões jurídicas úteis para localizar a resposta na Lei 14.133 e fontes oficiais.
- likely_articles só pode conter artigos quando você tiver boa confiança; caso contrário, deixe vazio.
- Nunca invente fatos, artigos, acórdãos ou prazos.`}
function historyForModel(history){return history.slice(-10).map(x=>({role:x.role==='assistant'?'assistant':'user',content:clean(x.content,2500)}))}
async function plan(p,message,history){const msgs=[{role:'system',content:plannerSystem()},...historyForModel(history),{role:'user',content:message}];const raw=await providerCall(p,msgs,{maxTokens:500,temperature:.15});return extractJson(raw)}

async function collectEvidence(plan,message){const hits=[],sources=[];const query=clean(plan?.normalized_question||message,1000),terms=Array.isArray(plan?.search_terms)?plan.search_terms.map(x=>clean(x,100)):[],articles=Array.isArray(plan?.likely_articles)?plan.likely_articles.map(x=>String(x).replace(/\D/g,'')).filter(Boolean):[];
  try{const law=await fetchLaw();const sel=rankSegments(lawSegments(law.text),query,terms,articles);for(const x of sel)hits.push({source:law.src.title,url:law.src.url,label:`Art. ${x.article}`,text:x.text});if(sel.length)sources.push({title:law.src.title,url:law.src.url})}catch{}
  const q=norm(query+' '+terms.join(' '));const extra=[];if(/pncp|portal nacional|publicacao|publicação/.test(q))extra.push('pncp');if(/compras\.gov|siasg|catalogo|catálogo|dados abertos|manual/.test(q))extra.push('compras','manuais');
  for(const id of [...new Set(extra)]){const src=EXTRA_SOURCES[id];try{const text=await fetchText(src.url,src.ttl),sel=rankSegments(genericSegments(text),query,terms,[]).slice(0,4);for(const x of sel)hits.push({source:src.title,url:src.url,label:'Trecho oficial',text:x.text});if(sel.length)sources.push({title:src.title,url:src.url})}catch{}}
  return {query,hits:hits.slice(0,11),sources:[...new Map(sources.map(s=>[s.url,s])).values()]};
}
function evidenceText(hits){return hits.map((h,i)=>`[FONTE ${i+1}] ${h.source} — ${h.label}\n${clean(h.text,1200)}`).join('\n\n')}
function answerSystem(){return `Você é a IA RLB, assistente conversacional especializado em licitações e contratos administrativos brasileiros.
Objetivo: conversar de forma natural, clara e inteligente, como um bom consultor humano, sem parecer um buscador automático.
REGRAS JURÍDICAS OBRIGATÓRIAS:
1. Use SOMENTE os trechos oficiais fornecidos em EVIDÊNCIAS para afirmar conteúdo de lei, artigo, prazo, requisito, impedimento ou procedimento.
2. Não invente artigo, acórdão, jurisprudência, prazo ou regra. Se a evidência não bastar, diga isso e faça UMA pergunta objetiva para obter contexto.
3. Não despeje texto bruto da lei. Primeiro responda diretamente ao que foi perguntado; depois explique em linguagem prática.
4. Se houver mais de uma interpretação possível, deixe isso claro e pergunte antes de concluir.
5. Mantenha o contexto da conversa e responda ao sentido real da pergunta, não apenas às palavras-chave.
6. Pode usar conhecimento geral apenas para fluidez da conversa; fatos jurídicos precisam estar nas evidências.
7. Em português brasileiro, tom profissional, natural e objetivo. Evite frases repetitivas como "conferi as fontes" a cada resposta.
8. Quando citar artigo, cite apenas se o número estiver literalmente nas evidências.
9. Termine sem bordões; só ofereça próximo passo quando for realmente útil.`}
async function synthesize(p,message,history,evidence,plan){const context=`Pergunta entendida: ${plan?.normalized_question||message}\n\nEVIDÊNCIAS OFICIAIS:\n${evidenceText(evidence.hits)||'Nenhum trecho oficial suficiente foi localizado.'}`;const msgs=[{role:'system',content:answerSystem()},...historyForModel(history).slice(-8),{role:'user',content:`${message}\n\n${context}`}];return providerCall(p,msgs,{maxTokens:1400,temperature:.45})}
async function persist(pool,userId,conv,message,answer,sources,documentId){const c=await pool.connect();try{await c.query('BEGIN');await c.query("INSERT INTO ai_messages(conversation_id,user_id,role,content,sources,document_id) VALUES($1,$2,'user',$3,'[]'::jsonb,$4)",[conv.id,userId,message,documentId||null]);await c.query("INSERT INTO ai_messages(conversation_id,user_id,role,content,sources,document_id) VALUES($1,$2,'assistant',$3,$4,$5)",[conv.id,userId,answer,JSON.stringify(sources||[]),documentId||null]);await c.query('UPDATE ai_conversations SET updated_at=NOW() WHERE id=$1',[conv.id]);await c.query('COMMIT')}catch(e){try{await c.query('ROLLBACK')}catch{}throw e}finally{c.release()}}

export async function runHybridChat({pool,userId,body,document,fallback}){
  const p=await storedProvider(pool);if(!p||document)return fallback({pool,userId,body,document});
  const message=clean(body.message,6000);if(!message)return fallback({pool,userId,body,document});
  let conv=await getConversation(pool,userId,Number(body.conversation_id)||null);if(!conv)conv=await createConversation(pool,userId,message);const history=await recent(pool,userId,conv.id);const used=await usageToday(pool,userId);
  try{
    const pl=await plan(p,message,history);if(!pl)return fallback({pool,userId,body:{...body,conversation_id:conv.id},document});
    let answer='',sources=[],interaction='hybrid_conversation';
    if(pl.mode==='social'){answer=clean(pl.direct_answer||'Oi! Pode falar comigo normalmente. Como posso ajudar?',6000);interaction='social'}
    else if(pl.mode==='clarify'){answer=clean(pl.clarification_question||'Quero entender exatamente o que você quis dizer antes de responder. Pode detalhar um pouco?',6000);interaction='clarification'}
    else if(pl.mode==='other'){answer=clean(pl.direct_answer||'Posso conversar com você, mas minha especialidade é licitações, contratos administrativos e compras públicas. Se sua dúvida for nessa área, me conte a situação do seu jeito.',6000);interaction='social'}
    else {
      const evidence=await collectEvidence(pl,message);sources=evidence.sources;
      if(!evidence.hits.length){answer='Entendi sua pergunta, mas não localizei base oficial suficiente para responder com segurança. Pode me dar um pouco mais de contexto sobre o caso?';interaction='clarification'}
      else{answer=await synthesize(p,message,history,evidence,pl);interaction='hybrid_procurement'}
    }
    await persist(pool,userId,conv,message,answer,sources,null);
    return {conversation_id:conv.id,answer,sources,suggestions:interaction==='hybrid_procurement'?['Explique mais simples','Mostre a base legal','Aplique ao meu caso']:[],used_today:used+1,daily_limit:200,mode:'hybrid_free_ai_official_sources',interaction_type:interaction,provider:p.provider,model:p.model};
  }catch(e){console.warn('IA RLB hybrid fallback:',p.provider,e?.message||e);return fallback({pool,userId,body:{...body,conversation_id:conv.id},document});}
}
