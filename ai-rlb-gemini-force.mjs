import crypto from 'node:crypto';

const SECRET=process.env.AI_RLB_SECRET||process.env.ADMIN_PASSWORD||process.env.DATABASE_URL||'';
const CACHE=new Map();
const MODELS=[...new Set([
  process.env.GEMINI_MODEL||'gemini-3.5-flash-lite',
  'gemini-3.5-flash-lite','gemini-3.6-flash','gemini-3.8-flash'
])];
const SOURCES=[
  {title:'Senado Federal — Lei nº 14.133/2021',url:'https://legis.senado.leg.br/norma/33382036/publicacao/33383820'},
  {title:'Câmara dos Deputados — Lei nº 14.133/2021',url:'https://www2.camara.leg.br/legin/fed/lei/2021/lei-14133-1-abril-2021-791222-norma-pl.html'},
  {title:'PNCP — Perguntas e Respostas',url:'https://www.gov.br/pncp/pt-br/pncp/perguntas-e-respostas/'}
];
const STOP=new Set('a o os as um uma uns umas de da do das dos em no na nos nas por para com sem e ou que qual quais como quando onde quem isso isto esse essa esses essas ao aos se sua seu suas seus sobre entre mais menos muito muita tambem ja ser estar ter tem pode podem deve devem foi sao eu voce voces meu minha'.split(/\s+/));
const clean=(v,n=6000)=>String(v??'').trim().slice(0,n);
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const words=s=>[...new Set(norm(s).replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w=>w.length>=3&&!STOP.has(w)))];

function deriveKey(){if(!SECRET)return null;return crypto.scryptSync(SECRET,'ia-rlb-free-provider-v1',32)}
function unseal(value){const key=deriveKey();if(!key||!value)return null;try{const b=Buffer.from(String(value),'base64url'),iv=b.subarray(0,12),tag=b.subarray(12,28),enc=b.subarray(28),dec=crypto.createDecipheriv('aes-256-gcm',key,iv);dec.setAuthTag(tag);return Buffer.concat([dec.update(enc),dec.final()]).toString('utf8')}catch{return null}}
async function geminiKey(pool){if(process.env.GEMINI_API_KEY)return process.env.GEMINI_API_KEY;const r=await pool.query("SELECT api_key_cipher FROM ai_provider_settings WHERE id=1 AND provider='gemini' AND enabled=TRUE LIMIT 1");return unseal(r.rows[0]?.api_key_cipher)}

function contentPayload(messages){const system=messages.find(x=>x.role==='system')?.content||'';const contents=messages.filter(x=>x.role!=='system').map(x=>({role:x.role==='assistant'?'model':'user',parts:[{text:String(x.content||'')}]}));return {systemInstruction:{parts:[{text:system}]},contents}}
async function callModel(apiKey,model,messages,{maxTokens=900,temperature=.3}={}){
  const body=contentPayload(messages);body.generationConfig={temperature,maxOutputTokens:maxTokens,topP:.9};
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},signal:AbortSignal.timeout(18000),body:JSON.stringify(body)});
  const data=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(data?.error?.message||`Gemini ${model} HTTP ${r.status}`),{statusCode:r.status,model});
  const text=(data.candidates?.[0]?.content?.parts||[]).map(x=>x.text||'').join('').trim();if(!text)throw Object.assign(new Error(`Gemini ${model} não retornou texto.`),{model});return {text,model};
}
async function cascade(apiKey,messages,opts){let last;for(const model of MODELS){try{return await callModel(apiKey,model,messages,opts)}catch(e){last=e;console.warn('IA RLB Gemini model attempt failed:',model,e?.message||e)}}throw last||new Error('Gemini indisponível')}
function extractJson(text){const s=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/```$/,'').trim();try{return JSON.parse(s)}catch{const a=s.indexOf('{'),b=s.lastIndexOf('}');if(a>=0&&b>a){try{return JSON.parse(s.slice(a,b+1))}catch{}}return null}}

function entities(s){return String(s||'').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr|\/section|\/article)>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/[\t ]+/g,' ').replace(/\n{3,}/g,'\n\n').trim()}
async function fetchText(url){const hit=CACHE.get(url);if(hit&&Date.now()-hit.at<21600000)return hit.text;const r=await fetch(url,{headers:{'User-Agent':'RadarLicitacoesBrasil-Gemini/1.0','Accept':'text/html,text/plain;q=0.9,*/*;q=.5'},signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error(`Fonte oficial HTTP ${r.status}`);const raw=Buffer.from(await r.arrayBuffer()).toString('utf8'),text=entities(raw);CACHE.set(url,{at:Date.now(),text});return text}
function chunks(text){return String(text||'').split(/(?=\bArt\.\s*\d+[ºo]?\.?)|\n{2,}/gi).map(x=>x.trim()).filter(x=>x.length>80&&x.length<7000)}
function rank(list,query,terms=[]){const toks=[...new Set([...words(query),...terms.flatMap(words)])];return list.map(text=>{const t=norm(text);let score=0;for(const w of toks)score+=Math.min(t.split(w).length-1,5)*(w.length>7?5:2);return {text,score}}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,8)}
async function evidence(question,terms=[]){const hits=[],sources=[];for(const src of SOURCES){try{const text=await fetchText(src.url),sel=rank(chunks(text),question,terms).slice(0,src.title.startsWith('PNCP')?3:5);for(const x of sel)hits.push({source:src.title,url:src.url,text:x.text.slice(0,1400)});if(sel.length)sources.push({title:src.title,url:src.url})}catch(e){console.warn('IA RLB official source failed:',src.title,e?.message||e)}}return {hits:hits.slice(0,10),sources:[...new Map(sources.map(x=>[x.url,x])).values()]}}

async function history(pool,userId,conversationId){if(!conversationId)return[];const r=await pool.query('SELECT role,content FROM ai_messages WHERE conversation_id=$1 AND user_id=$2 ORDER BY id DESC LIMIT 16',[conversationId,userId]);return r.rows.reverse()}
async function getConv(pool,userId,id){if(!id)return null;const r=await pool.query('SELECT id,title FROM ai_conversations WHERE id=$1 AND user_id=$2',[id,userId]);return r.rows[0]||null}
async function newConv(pool,userId,message){const r=await pool.query('INSERT INTO ai_conversations(user_id,title) VALUES($1,$2) RETURNING id,title',[userId,clean(message.replace(/\s+/g,' '),70)]);return r.rows[0]}
async function usage(pool,userId){const r=await pool.query(`SELECT COUNT(*)::int n FROM ai_messages WHERE user_id=$1 AND role='user' AND created_at>=date_trunc('day',NOW())`,[userId]);return r.rows[0]?.n||0}
async function persist(pool,userId,conv,message,answer,sources){const c=await pool.connect();try{await c.query('BEGIN');await c.query("INSERT INTO ai_messages(conversation_id,user_id,role,content,sources) VALUES($1,$2,'user',$3,'[]'::jsonb)",[conv.id,userId,message]);await c.query("INSERT INTO ai_messages(conversation_id,user_id,role,content,sources) VALUES($1,$2,'assistant',$3,$4)",[conv.id,userId,answer,JSON.stringify(sources||[])]);await c.query('UPDATE ai_conversations SET updated_at=NOW() WHERE id=$1',[conv.id]);await c.query('COMMIT')}catch(e){try{await c.query('ROLLBACK')}catch{}throw e}finally{c.release()}}
function modelHistory(items){return items.slice(-10).map(x=>({role:x.role==='assistant'?'assistant':'user',content:clean(x.content,2200)}))}

const PLAN_SYSTEM=`Você interpreta mensagens para a IA RLB, especialista em licitações e contratos públicos brasileiros. Retorne SOMENTE JSON válido com: mode (social|procurement|clarify|other), normalized_question, search_terms (array), clarification_question, direct_answer. Preserve o contexto. Saudações e conversa comum são social. Perguntas jurídicas ambíguas são clarify. Exemplo: "quem pode licitar?" é ambígua entre quem pode participar como licitante e quem pode realizar/conduzir a licitação; pergunte qual sentido. "quem pode contratar?" também é ambígua. procurement somente quando a intenção jurídica estiver clara. Nunca invente artigo, prazo ou regra.`;
const ANSWER_SYSTEM=`Você é a IA RLB, assistente conversacional especializado em licitações e contratos administrativos brasileiros. Fale de forma natural, clara e contextual, como um consultor humano. Para fatos jurídicos, use SOMENTE as EVIDÊNCIAS OFICIAIS fornecidas. Não invente artigo, prazo, jurisprudência, requisito ou procedimento. Responda primeiro ao ponto perguntado, depois explique de forma prática. Se as evidências forem insuficientes, diga isso e peça o contexto mínimo necessário. Não despeje a lei inteira. Não repita bordões.`;

export async function runForcedGeminiChat({pool,userId,body,document,fallback}){
  if(document)return fallback({pool,userId,body,document});
  const apiKey=await geminiKey(pool);if(!apiKey)throw Object.assign(new Error('Gemini não está configurado. Abra as configurações da IA RLB e ative a chave gratuita.'),{status:503,publicCode:'gemini_not_configured'});
  const message=clean(body.message,6000);if(!message)throw Object.assign(new Error('Digite uma mensagem.'),{status:400,publicCode:'empty_message'});
  let conv=await getConv(pool,userId,Number(body.conversation_id)||null);if(!conv)conv=await newConv(pool,userId,message);const hist=await history(pool,userId,conv.id),used=await usage(pool,userId);
  try{
    const planned=await cascade(apiKey,[{role:'system',content:PLAN_SYSTEM},...modelHistory(hist),{role:'user',content:message}],{maxTokens:500,temperature:.12});
    const pl=extractJson(planned.text);if(!pl)throw new Error(`Gemini ${planned.model} não retornou um plano válido.`);
    let answer='',sources=[],interaction='gemini_conversation',answerModel=planned.model;
    if(pl.mode==='social'){answer=clean(pl.direct_answer||'Oi! Tudo bem? Como posso te ajudar?',6000);interaction='social'}
    else if(pl.mode==='clarify'){answer=clean(pl.clarification_question||'Quero entender exatamente o que você quis dizer. Pode me dar um pouco mais de contexto?',6000);interaction='clarification'}
    else if(pl.mode==='other'){answer=clean(pl.direct_answer||'Posso conversar normalmente com você, mas minha especialidade é licitações, contratos administrativos e compras públicas.',6000);interaction='social'}
    else{
      const ev=await evidence(clean(pl.normalized_question||message,1000),Array.isArray(pl.search_terms)?pl.search_terms:[]);sources=ev.sources;
      if(!ev.hits.length){answer='Entendi sua dúvida, mas não localizei base oficial suficiente para responder com segurança. Pode detalhar um pouco o caso?';interaction='clarification'}
      else{
        const evid=ev.hits.map((h,i)=>`[FONTE ${i+1}] ${h.source}\n${h.text}`).join('\n\n');
        const result=await cascade(apiKey,[{role:'system',content:ANSWER_SYSTEM},...modelHistory(hist).slice(-8),{role:'user',content:`Pergunta: ${message}\n\nEVIDÊNCIAS OFICIAIS:\n${evid}`}],{maxTokens:1300,temperature:.4});answer=result.text;answerModel=result.model;interaction='gemini_procurement';
      }
    }
    await persist(pool,userId,conv,message,answer,sources);
    console.log('IA RLB Gemini response:',answerModel,interaction);
    return {conversation_id:conv.id,answer,sources,suggestions:interaction==='gemini_procurement'?['Explique mais simples','Mostre a base legal','Aplique ao meu caso']:[],used_today:used+1,daily_limit:200,mode:'gemini_forced_official_sources',interaction_type:interaction,provider:'gemini',model:answerModel};
  }catch(e){console.error('IA RLB Gemini forced failure:',e?.message||e);throw Object.assign(new Error('O Gemini está temporariamente indisponível para responder. Tente novamente em instantes; o Radar não usou o modo local nesta resposta.'),{status:503,publicCode:'gemini_temporarily_unavailable'});}
}
