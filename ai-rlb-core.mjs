const AI_DAILY_LIMIT=Math.max(1,Math.min(Number(process.env.AI_DAILY_LIMIT||200),1000));
const ENGINE_NAME='IA RLB Conversacional Oficial';
const CACHE=new Map();

const LAW_SOURCES=[
  {id:'senado',title:'Senado Federal — Lei nº 14.133/2021',url:'https://legis.senado.leg.br/norma/33382036/publicacao/33383820',ttl:24*60*60*1000},
  {id:'camara',title:'Câmara dos Deputados — Lei nº 14.133/2021',url:'https://www2.camara.leg.br/legin/fed/lei/2021/lei-14133-1-abril-2021-791222-norma-pl.html',ttl:24*60*60*1000}
];
const SOURCES={
  pncp:{id:'pncp',title:'PNCP — Perguntas e Respostas',url:'https://www.gov.br/pncp/pt-br/pncp/perguntas-e-respostas/',ttl:6*60*60*1000},
  compras:{id:'compras',title:'Compras.gov.br — Portal de Dados Abertos',url:'https://www.gov.br/compras/pt-br/cidadao/portal-de-dados-abertos',ttl:6*60*60*1000},
  manuais:{id:'manuais',title:'Compras.gov.br — Manuais e documentação',url:'https://www.gov.br/compras/pt-br/acesso-a-informacao/manuais',ttl:6*60*60*1000}
};
const STOP=new Set('a o os as um uma uns umas de da do das dos em no na nos nas por para com sem e ou que qual quais como quando onde quem isso isto esse essa esses essas ao aos se sua seu suas seus sobre entre mais menos muito muita tambem também ja já ser estar ter tem pode podem deve devem foi sao são eu voce você voces vocês meu minha'.split(/\s+/));
const TOPICS=[
  {id:'planejamento',label:'planejamento da contratação',w:['planejamento','etp','estudo tecnico','pca','plano de contratacoes'],a:['18']},
  {id:'edital',label:'edital, impugnação ou esclarecimentos',w:['edital','impugnacao','esclarecimento'],a:['25','164']},
  {id:'pregao',label:'pregão',w:['pregao'],a:['6','28','29']},
  {id:'concorrencia',label:'concorrência',w:['concorrencia'],a:['6','28','29']},
  {id:'dispensa',label:'dispensa ou contratação direta',w:['dispensa','contratacao direta'],a:['72','75']},
  {id:'inexigibilidade',label:'inexigibilidade',w:['inexigibilidade'],a:['72','74']},
  {id:'habilitacao',label:'habilitação',w:['habilitacao','juridica','fiscal','trabalhista','economico-financeira','tecnica'],a:['62','63','64','65','66','67','68','69','70']},
  {id:'atestado',label:'capacidade ou qualificação técnica',w:['atestado','capacidade tecnica','qualificacao tecnica'],a:['67']},
  {id:'garantia',label:'garantia contratual',w:['garantia contratual','garantia'],a:['96','97','98','99','100','101','102']},
  {id:'fiscalizacao',label:'gestão e fiscalização contratual',w:['fiscal do contrato','gestor do contrato','fiscalizacao'],a:['117']},
  {id:'aditivo',label:'alteração ou aditivo contratual',w:['alteracao contratual','aditivo','acrescimo','supressao'],a:['124','125','126','127','128','129','130','131','132','133','134','135','136']},
  {id:'reequilibrio',label:'reajuste ou reequilíbrio econômico-financeiro',w:['reajuste','reequilibrio','revisao'],a:['92','124','134','135']},
  {id:'recurso',label:'recurso administrativo',w:['recurso','intencao de recurso'],a:['165','166','167','168']},
  {id:'srp',label:'sistema de registro de preços',w:['registro de precos','srp','ata de registro'],a:['82','83','84','85','86']},
  {id:'sancoes',label:'sanções e penalidades',w:['sancao','penalidade','multa','impedimento','inidoneidade'],a:['155','156','157','158','159','160','161','162','163']},
  {id:'exequibilidade',label:'exequibilidade, inexequibilidade ou diligência',w:['inexequibilidade','inexequivel','exequibilidade','diligencia'],a:['59','64']},
  {id:'contrato',label:'contrato, vigência ou prorrogação',w:['contrato','vigencia','prorrogacao'],a:['89','90','91','92','105','106','107','108','109','110','111','112','113','114']}
];
const PROCUREMENT_TERMS=['licitacao','licitações','licitacoes','contratacao','contratação','contrato','edital','pregao','pregão','concorrencia','concorrência','dispensa','inexigibilidade','habilitacao','habilitação','recurso','impugnacao','impugnação','proposta','lance','srp','ata de registro','pncp','compras.gov','tcu','etp','termo de referencia','termo de referência','fiscal do contrato','gestor do contrato','aditivo','reequilibrio','reequilíbrio','reajuste','garantia','atestado','capacidade tecnica','capacidade técnica','sancao','sanção','penalidade','exequibilidade','inexequibilidade','lei 14.133','lei 14133','artigo','art.'];
const clean=(v,max=5000)=>String(v??'').trim().slice(0,max);
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const words=s=>[...new Set(norm(s).replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w=>w.length>=3&&!STOP.has(w)))];

function entities(s){return String(s||'').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)))}
function htmlToText(html){return entities(String(html||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr|\/section|\/article)>/gi,'\n').replace(/<[^>]+>/g,' ')).replace(/\r/g,'').replace(/[\t ]+/g,' ').replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim()}
async function fetchText(url,ttl=3600000){const hit=CACHE.get(url);if(hit&&Date.now()-hit.at<ttl)return hit.text;const r=await fetch(url,{headers:{'User-Agent':'RadarLicitacoesBrasil/4.0','Accept':'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5'},signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error(`HTTP ${r.status}`);const b=Buffer.from(await r.arrayBuffer());const ct=String(r.headers.get('content-type')||'').toLowerCase();let raw;try{raw=new TextDecoder(ct.includes('iso-8859-1')||ct.includes('windows-1252')?'windows-1252':'utf-8').decode(b)}catch{raw=b.toString('utf8')}const text=ct.includes('html')||/<html/i.test(raw.slice(0,1000))?htmlToText(raw):raw;CACHE.set(url,{at:Date.now(),text});return text}
async function fetchLaw(){let last;for(const src of LAW_SOURCES){try{return {src,text:await fetchText(src.url,src.ttl)}}catch(e){last=e;console.warn('IA RLB law source error',src.id,e.message)}}throw last||new Error('Fonte legal indisponível')}
function splitSegments(text,law=false){const t=String(text||'').replace(/\u00a0/g,' ');if(law){const p=t.split(/(?=\bArt\.\s*\d+[ºo]?\.?)/gi).map(x=>x.trim()).filter(x=>x.length>30);return p.map((x,i)=>({text:x.slice(0,5000),key:(x.match(/^Art\.\s*(\d+)/i)?.[1]||String(i))}))}return t.split(/\n{2,}|(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9])/).map(x=>x.trim()).filter(x=>x.length>45&&x.length<5000).map((x,i)=>({text:x,key:String(i)}))}
function refs(query){const out=new Set();for(const m of String(query).matchAll(/art(?:igo)?\.?\s*(\d{1,3})/gi))out.add(m[1]);const q=norm(query);for(const t of TOPICS)if(t.w.some(w=>q.includes(norm(w))))t.a.forEach(a=>out.add(a));return [...out]}
function score(seg,query,r){const s=norm(seg.text);let n=0;for(const t of words(query)){const c=s.split(t).length-1;n+=Math.min(c,4)*(t.length>=7?4:2)}if(r.includes(String(seg.key)))n+=50;if(/^art\./i.test(seg.text))n+=2;return n}
function top(segs,query,r,n=5){return segs.map(x=>({...x,score:score(x,query,r)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,n)}
function sentenceSummary(text,query,max=4){const toks=words(query);return String(text||'').split(/(?<=[.!?;])\s+/).map(s=>s.trim()).filter(s=>s.length>25&&s.length<1000).map(s=>({s,score:toks.reduce((a,t)=>a+(norm(s).includes(t)?1:0),0)})).sort((a,b)=>b.score-a.score).slice(0,max).map(x=>x.s).filter(Boolean)}
function tcuUrl(query){return `https://pesquisa.apps.tcu.gov.br/documento/publicacao/${encodeURIComponent(clean(query.replace(/[?#/]/g,' '),120))}/%2520/DTRELEVANCIA%2520desc/1`}
async function tcuSearch(query){const url=tcuUrl(query);try{return {url,text:await fetchText(url,20*60*1000)}}catch{return {url,text:''}}}
function sourceIds(query){const q=norm(query),ids=[];if(/(pncp|portal nacional|ata|contrato|edital|pca|contratacao)/.test(q))ids.push('pncp');if(/(compras\.gov|comprasgov|siasg|dados abertos|fornecedor|catalogo)/.test(q))ids.push('compras','manuais');return [...new Set(ids)]}

function seedNumber(text){let h=2166136261;for(const ch of String(text||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return Math.abs(h>>>0)}
function pick(arr,seed=''){return arr[seedNumber(seed)%arr.length]}
function topicOf(text){const q=norm(text);let best=null,bestScore=0;for(const t of TOPICS){let s=0;for(const w of t.w)if(q.includes(norm(w)))s+=w.length;if(s>bestScore){best=t;bestScore=s}}return best}
function previousByRole(history,role){return [...history].reverse().find(x=>x.role===role&&clean(x.content,6000))||null}
function previousProcurementUser(history){return [...history].reverse().find(x=>x.role==='user'&&PROCUREMENT_TERMS.some(t=>norm(x.content).includes(norm(t))))||null}
function lastTopic(history,message=''){return topicOf(message)||topicOf(previousProcurementUser(history)?.content||'')}
function isQuestion(raw){return /[?]/.test(raw)||/^(como|qual|quais|quando|onde|quem|porque|por que|posso|pode|deve|tem|existe|e permitido|é permitido|quanto|o que)/.test(norm(raw).trim())}

function classifyIntent(message,document,history=[]){
  const raw=clean(message,6000),q=norm(raw).replace(/[!?.,;:]+/g,' ').replace(/\s+/g,' ').trim();
  if(document)return 'procurement';
  if(/^(oi|ola|opa|hey|hello|e ai|bom dia|boa tarde|boa noite)( tudo bem| como vai| tudo certo)?$/.test(q))return 'greeting';
  if(/^(tudo bem|como vai|como voce esta|ta tudo bem|como estao as coisas)$/.test(q))return 'wellbeing';
  if(/^(obrigado|obrigada|valeu|agradeco|muito obrigado|muito obrigada|perfeito|show|beleza|entendi|certo|otimo)$/.test(q))return 'thanks';
  if(/^(tchau|ate mais|ate logo|falou|vou sair|encerrar|ate depois)$/.test(q))return 'bye';
  if(/(quem e voce|o que voce faz|como voce pode me ajudar|para que voce serve|o que sabe fazer)/.test(q))return 'capabilities';
  if(/^(sim|pode|pode sim|claro|continue|continua|prossiga|manda|quero|isso)$/.test(q)&&previousProcurementUser(history))return 'continue';
  if(/^(nao|não|deixa|deixe|nao precisa|não precisa|sem problema)$/.test(q))return 'decline';
  if(/(nao entendi|não entendi|explique melhor|explica melhor|mais simples|de forma simples|simplifica|simplifique)/.test(q)&&previousByRole(history,'assistant'))return 'simplify';
  if(/^(resuma|resume|resumo|faz um resumo|faça um resumo|mais curto|seja direto)$/.test(q)&&previousByRole(history,'assistant'))return 'summarize';
  if(/(isso esta errado|isso está errado|nao esta certo|não está certo|discordo|tem certeza|confere isso|verifique de novo)/.test(q))return 'challenge';
  if(/(exemplo|exemplifique|me de um exemplo|me dê um exemplo)/.test(q)&&previousProcurementUser(history))return 'example_request';
  const legal=PROCUREMENT_TERMS.some(t=>q.includes(norm(t)))||refs(raw).length>0;
  if(legal)return 'procurement';
  if(previousProcurementUser(history)&&/^(e |e no |e na |e quanto|nesse caso|neste caso|e se|mas e|mas no|mas na|isso|entao|então|sobre isso|e quanto a)/.test(q))return 'procurement_followup';
  if(q.length<=45&&!isQuestion(raw))return 'social';
  return 'unclear';
}

function socialReply(intent,message='',history=[]){
  const seed=`${message}|${history.length}|${intent}`;
  if(intent==='greeting')return pick([
    'Oi! 😊 Tudo bem? Pode falar comigo normalmente. O que você precisa resolver hoje?',
    'Olá! 👋 Estou por aqui. Me conta o que você precisa e eu vejo como posso te ajudar.',
    'Oi! Tudo certo? 😊 Pode mandar sua dúvida do jeito que você falaria com uma pessoa.'
  ],seed);
  if(intent==='wellbeing')return pick([
    'Tudo certo por aqui 😊 E com você? O que vamos resolver?',
    'Tudo bem! 😊 E por aí? Pode me contar o que você precisa.',
    'Por aqui está tudo certo. E com você? Se quiser, já pode me explicar a situação.'
  ],seed);
  if(intent==='thanks')return pick([
    'Por nada! 😊 Se quiser continuar nesse assunto, pode mandar.',
    'Disponha! Se surgir outra dúvida, estou por aqui.',
    'Que bom que ajudou. Se quiser aprofundar algum ponto, é só falar.'
  ],seed);
  if(intent==='bye')return pick(['Até mais! 👋','Até depois! Quando precisar, é só chamar.','Combinado. Até mais! 👋'],seed);
  if(intent==='capabilities')return 'Sou a IA RLB, assistente do Radar de Licitações Brasil. Posso conversar normalmente com você, acompanhar o contexto da conversa, ajudar a organizar dúvidas de licitações e contratos, consultar a Lei nº 14.133/2021 e outras fontes oficiais e apontar trechos relevantes de documentos. Quando a pergunta exigir fundamento jurídico, eu pesquiso antes de responder; quando for apenas conversa ou orientação geral, não preciso fazer busca desnecessária.';
  if(intent==='decline')return pick(['Tudo bem. Seguimos por outro caminho. O que você prefere fazer agora?','Sem problema. Me diga então o que você quer analisar.','Certo. Não vou insistir nesse ponto. O que você precisa agora?'],seed);
  return pick(['Entendi. Me conta um pouco mais.','Certo. Pode continuar — estou acompanhando.','Estou com você. O que aconteceu exatamente?'],seed);
}

function contextQuery(message,history=[]){const q=norm(message);if(!/^(e |e no |e na |e quanto|nesse caso|neste caso|e se|mas e|mas no|mas na|isso|entao|então|sobre isso|e quanto a)/.test(q))return message;const prev=previousProcurementUser(history);return prev?`${prev.content} — continuação: ${message}`:message}
function conversationalLead(query,history=[]){
  const t=lastTopic(history,query);const label=t?.label;
  const seed=`${query}|${history.length}|${label||''}`;
  if(label)return pick([
    `Entendi. Você está falando sobre **${label}**. Conferi a base oficial e o ponto principal é este:`,
    `Certo — olhando especificamente para **${label}**, encontrei o seguinte nas fontes oficiais:`,
    `Vamos por partes. Sobre **${label}**, a base oficial que encontrei aponta o seguinte:`
  ],seed);
  return pick(['Entendi sua dúvida. Conferi a base oficial e encontrei o seguinte:','Certo. Pesquisei exatamente esse ponto nas fontes oficiais:','Vamos direto ao que você perguntou. A base oficial encontrada indica:'],seed);
}
function followupPrompt(query,history=[]){
  const t=lastTopic(history,query);const label=t?.label;
  if(label)return `Se quiser, eu posso agora aprofundar **${label}**, explicar em linguagem mais simples ou verificar como isso se aplica ao seu caso concreto.`;
  return 'Se quiser, posso aprofundar esse ponto, resumir em linguagem simples ou verificar como isso se aplica ao seu caso concreto.';
}
function buildAnswer(query,hits,docNote='',history=[],detail=false){
  if(!hits.length)return `${docNote?docNote+'\n\n':''}Entendi o que você quer saber, mas não encontrei base oficial suficiente para afirmar isso com segurança. Em vez de completar por suposição, me diga um pouco mais do caso — por exemplo, a modalidade, a fase do processo e o que aconteceu — que eu refaço a busca de forma mais precisa.`;
  let out=`${conversationalLead(query,history)}\n\n`;if(docNote)out+=`${docNote}\n\n`;const law=hits.filter(h=>h.kind==='law'),other=hits.filter(h=>h.kind!=='law');
  if(law.length){const arts=[...new Set(law.map(h=>h.key).filter(k=>/^\d+$/.test(k)))];if(arts.length)out+=`**Base legal localizada:** art.${arts.length>1?'s':''} ${arts.join(', ')} da Lei nº 14.133/2021.\n\n`;const s=sentenceSummary(law.map(h=>h.text).join(' '),query,detail?6:4);if(s.length)out+=`**Em termos objetivos:**\n${s.map(x=>'• '+clean(x,detail?850:650)).join('\n')}\n\n`}
  if(other.length){const s=sentenceSummary(other.map(h=>h.text).join(' '),query,detail?5:3);if(s.length)out+=`**Também encontrei nas fontes oficiais:**\n${s.map(x=>'• '+clean(x,detail?750:600)).join('\n')}\n\n`}
  out+=followupPrompt(query,history);return clean(out,30000)
}
function summarizePrevious(history=[]){
  const prev=previousByRole(history,'assistant');if(!prev)return 'Claro. Qual resposta você quer que eu resuma?';
  const text=String(prev.content||'').replace(/\*\*/g,'').replace(/^•\s*/gm,'').split(/(?<=[.!?])\s+/).map(x=>x.trim()).filter(x=>x.length>20&&!/Se quiser/i.test(x));
  const selected=text.slice(0,3);return selected.length?`Claro. Resumindo:\n\n${selected.map(x=>'• '+clean(x,420)).join('\n')}`:'Claro. Me diga qual parte você quer que eu deixe mais curta.';
}
function simplifyPrevious(history=[]){
  const prev=previousByRole(history,'assistant');if(!prev)return 'Posso explicar de forma mais simples. Qual ponto você quer que eu simplifique?';
  const text=String(prev.content||'').replace(/\*\*/g,'').replace(/^•\s*/gm,'').split(/\n+/).map(x=>x.trim()).filter(x=>x.length>25&&!/Fontes|Se quiser/i.test(x));
  const core=text.slice(0,3);return `Claro. Em linguagem mais simples:\n\n${core.length?core.map((x,i)=>`${i+1}. ${clean(x,500)}`).join('\n'):'me diga qual ponto específico você quer que eu explique novamente.'}`;
}
function exampleReply(history=[]){
  const prev=previousProcurementUser(history);const t=lastTopic(history,prev?.content||'');
  if(!prev)return 'Posso dar um exemplo, sim. Sobre qual situação?';
  return `Posso exemplificar, mas para não criar um cenário que não corresponda ao seu processo, me diga só um dado: **qual é a situação concreta** relacionada a ${t?.label||'esse tema'}? Pode ser em uma frase. Aí eu monto o exemplo em cima do seu caso e separo claramente o que é fato do que é hipótese.`;
}
function challengeReply(history=[]){
  const prev=previousByRole(history,'assistant');
  return prev?'Entendi. Vamos conferir com cuidado. Me diga qual trecho ou conclusão parece errada para você; eu refaço a busca oficial focando exatamente nesse ponto, sem manter a resposta anterior por inércia.':'Claro. Me diga qual informação você quer que eu confira novamente.';
}
function pdfStrings(buffer){const s=Buffer.from(buffer).toString('latin1'),p=[];for(const m of s.matchAll(/\(([^()]*(?:\\.[^()]*)*)\)\s*Tj/g))p.push(m[1]);for(const m of s.matchAll(/\[(.*?)\]\s*TJ/gs))for(const x of m[1].matchAll(/\(([^()]*(?:\\.[^()]*)*)\)/g))p.push(x[1]);return p.join(' ').replace(/\\([()\\])/g,'$1').replace(/\\n/g,' ').replace(/\s+/g,' ').trim()}
function docText(doc){if(!doc?.content)return '';const mime=String(doc.mime_type||'').toLowerCase(),b=Buffer.from(doc.content);if(mime.startsWith('text/')||mime.includes('csv'))return b.toString('utf8').slice(0,60000);if(mime==='application/pdf')return pdfStrings(b).slice(0,60000);return ''}
function docNote(doc,text,query){if(!doc)return '';if(!text||text.length<80)return `Sobre o documento **${clean(doc.filename,180)}**: não consegui extrair texto suficiente para analisá-lo com segurança. Se for um PDF escaneado ou um formato sem texto acessível, não vou presumir o conteúdo.`;const toks=words(query),lines=text.split(/\n|(?<=[.;:])\s+/).map(x=>x.trim()).filter(x=>x.length>25),best=lines.map(x=>({x,s:toks.reduce((a,t)=>a+(norm(x).includes(t)?1:0),0)})).sort((a,b)=>b.s-a.s).slice(0,4).filter(x=>x.s>0).map(x=>clean(x.x,500));return `No documento **${clean(doc.filename,180)}**, ${best.length?`localizei estes trechos relacionados ao que você perguntou: ${best.join(' | ')}`:'o texto foi extraído, mas não encontrei um trecho diretamente relacionado à sua pergunta.'}`}

export async function initAiTables(pool){if(!pool)return;await pool.query(`CREATE TABLE IF NOT EXISTS ai_conversations(id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,title TEXT NOT NULL DEFAULT 'Nova conversa',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);await pool.query(`CREATE TABLE IF NOT EXISTS ai_messages(id BIGSERIAL PRIMARY KEY,conversation_id BIGINT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,role TEXT NOT NULL CHECK(role IN('user','assistant')),content TEXT NOT NULL,sources JSONB NOT NULL DEFAULT '[]'::jsonb,document_id BIGINT REFERENCES documents(id) ON DELETE SET NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);await pool.query('CREATE INDEX IF NOT EXISTS idx_ai_conv_user ON ai_conversations(user_id,updated_at DESC)');await pool.query('CREATE INDEX IF NOT EXISTS idx_ai_msg_conv ON ai_messages(conversation_id,id)');console.log(`IA RLB core ready: enhanced conversational official-source mode (${ENGINE_NAME})`);fetchLaw().then(x=>console.log(`IA RLB legal source ready: ${x.src.id}`)).catch(e=>console.warn('IA RLB legal source warmup:',e.message))}
export async function configureAiKey(){return {configured:true,operational:true,source:'official_public_sources',model:ENGINE_NAME,message:'A IA RLB opera gratuitamente com fontes públicas oficiais e não requer chave de API.'}}
export async function aiAdminStatus(){return {configured:true,operational:true,source:'official_public_sources',model:ENGINE_NAME,paid_api:false}}
export async function removeStoredAiKey(){return {configured:true,source:'official_public_sources',model:ENGINE_NAME,paid_api:false}}
async function usageToday(pool,userId){const r=await pool.query(`SELECT COUNT(*)::int n FROM ai_messages WHERE user_id=$1 AND role='user' AND created_at>=date_trunc('day',NOW())`,[userId]);return r.rows[0]?.n||0}
async function getConversation(pool,userId,id){if(!id)return null;const r=await pool.query('SELECT id,title,created_at,updated_at FROM ai_conversations WHERE id=$1 AND user_id=$2',[id,userId]);return r.rows[0]||null}
async function recentMessages(pool,userId,conversationId){if(!conversationId)return[];const r=await pool.query('SELECT role,content FROM ai_messages WHERE conversation_id=$1 AND user_id=$2 ORDER BY id DESC LIMIT 16',[conversationId,userId]);return r.rows.reverse()}
async function officialAnswer(query,document,history=[],detail=false){const r=refs(query),hits=[],sources=[];try{const law=await fetchLaw();top(splitSegments(law.text,true),query,r,detail?9:6).forEach(x=>hits.push({...x,kind:'law'}));if(hits.length)sources.push({title:law.src.title,url:law.src.url})}catch(e){console.warn('IA RLB law unavailable',e.message)}for(const id of sourceIds(query)){const src=SOURCES[id];try{const text=await fetchText(src.url,src.ttl),sel=top(splitSegments(text,false),query,r,detail?5:3);sel.forEach(x=>hits.push({...x,kind:id}));if(sel.length)sources.push({title:src.title,url:src.url})}catch(e){console.warn('IA RLB source error',id,e.message)}}if(/(tcu|acordao|jurisprudencia|exequibilidade|inexequibilidade|diligencia|sobrepreco)/.test(norm(query))){const tcu=await tcuSearch(query);if(tcu.text){const sel=top(splitSegments(tcu.text,false),query,r,detail?5:3);sel.forEach(x=>hits.push({...x,kind:'tcu'}));if(sel.length)sources.push({title:'Tribunal de Contas da União — Pesquisa',url:tcu.url})}}const dt=docText(document),dn=docNote(document,dt,query);return {answer:buildAnswer(query,hits,dn,history,detail),sources:[...new Map(sources.map(s=>[s.url,s])).values()].slice(0,8),interaction_type:detail?'procurement_detail':'procurement',suggestions:makeSuggestions(query,history)}}
function makeSuggestions(query,history=[]){const t=lastTopic(history,query);const base=['Explique mais simples','Resuma a resposta'];if(t?.id==='habilitacao'||t?.id==='atestado')base.unshift('E se faltar um documento?');else if(t?.id==='recurso')base.unshift('E qual é o prazo?');else if(t?.id==='contrato'||t?.id==='aditivo')base.unshift('E quando pode prorrogar?');else base.unshift('Aprofunde esse ponto');return base.slice(0,3)}
export async function aiStatus(pool,userId){return {configured:true,operational:true,model:ENGINE_NAME,mode:'official_public_sources',web_search:true,document_analysis:true,paid_api:false,conversational:true,contextual:true,daily_limit:AI_DAILY_LIMIT,used_today:await usageToday(pool,userId),sources:['Senado Federal','Câmara dos Deputados','PNCP','Compras.gov.br','TCU']}}
export async function listAiConversations(pool,userId){const r=await pool.query('SELECT id,title,created_at,updated_at FROM ai_conversations WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 40',[userId]);return r.rows}
export async function listAiMessages(pool,userId,conversationId){const c=await getConversation(pool,userId,conversationId);if(!c)throw Object.assign(new Error('Conversa não encontrada.'),{status:404});const r=await pool.query('SELECT id,role,content,sources,document_id,created_at FROM ai_messages WHERE conversation_id=$1 AND user_id=$2 ORDER BY id ASC LIMIT 200',[conversationId,userId]);return {conversation:c,items:r.rows}}
export async function deleteAiConversation(pool,userId,conversationId){await pool.query('DELETE FROM ai_conversations WHERE id=$1 AND user_id=$2',[conversationId,userId])}
export async function runAiChat({pool,userId,body,document}){
  const used=await usageToday(pool,userId);if(used>=AI_DAILY_LIMIT)throw Object.assign(new Error(`Limite diário da IA RLB atingido (${AI_DAILY_LIMIT} mensagens).`),{status:429,code:'daily_limit'});
  const message=clean(body.message,6000);if(!message)throw Object.assign(new Error('Digite uma mensagem para a IA RLB.'),{status:400});
  let conv=await getConversation(pool,userId,Number(body.conversation_id)||null);if(!conv){const r=await pool.query('INSERT INTO ai_conversations(user_id,title) VALUES($1,$2) RETURNING id,title,created_at,updated_at',[userId,message.replace(/\s+/g,' ').slice(0,70)]);conv=r.rows[0]}
  const history=await recentMessages(pool,userId,conv.id),intent=classifyIntent(message,document,history);let result;
  if(['greeting','wellbeing','thanks','bye','capabilities','social','decline'].includes(intent))result={answer:socialReply(intent,message,history),sources:[],interaction_type:'social',suggestions:[]};
  else if(intent==='summarize')result={answer:summarizePrevious(history),sources:[],interaction_type:'conversation_transform',suggestions:['Explique mais simples','Voltar ao assunto']};
  else if(intent==='simplify')result={answer:simplifyPrevious(history),sources:[],interaction_type:'conversation_transform',suggestions:['Aprofunde esse ponto','Resuma a resposta']};
  else if(intent==='challenge')result={answer:challengeReply(history),sources:[],interaction_type:'clarification',suggestions:['Refaça a busca','Mostre a base legal']};
  else if(intent==='example_request')result={answer:exampleReply(history),sources:[],interaction_type:'clarification',suggestions:[]};
  else if(intent==='continue'){
    const prev=previousProcurementUser(history);result=prev?await officialAnswer(`${prev.content} — aprofunde esse ponto com mais detalhes`,document,history,true):{answer:'Claro. Qual ponto você quer que eu aprofunde?',sources:[],interaction_type:'clarification',suggestions:[]};
  }
  else if(intent==='unclear'){
    const t=lastTopic(history,message);result={answer:t?`Entendi que a conversa está em **${t.label}**, mas essa última mensagem ficou aberta para mais de uma interpretação. Você quer que eu explique melhor, procure a base legal, resuma ou aplique ao seu caso?`:'Quero entender exatamente o que você precisa antes de pesquisar qualquer coisa. Me explique a situação do seu jeito — pode ser em uma frase. Se for sobre licitação ou contrato, eu identifico o tema e consulto só as fontes necessárias.',sources:[],interaction_type:'clarification',suggestions:t?['Explique melhor','Mostre a base legal','Aplique ao meu caso']:[]};
  }
  else result=await officialAnswer(contextQuery(message,history),document,history,false);
  const client=await pool.connect();try{await client.query('BEGIN');await client.query("INSERT INTO ai_messages(conversation_id,user_id,role,content,sources,document_id) VALUES($1,$2,'user',$3,'[]'::jsonb,$4)",[conv.id,userId,message,document?.id||null]);await client.query("INSERT INTO ai_messages(conversation_id,user_id,role,content,sources,document_id) VALUES($1,$2,'assistant',$3,$4,$5)",[conv.id,userId,result.answer,JSON.stringify(result.sources||[]),document?.id||null]);await client.query('UPDATE ai_conversations SET updated_at=NOW() WHERE id=$1',[conv.id]);await client.query('COMMIT')}catch(e){try{await client.query('ROLLBACK')}catch{}throw e}finally{client.release()}
  return {conversation_id:conv.id,answer:result.answer,sources:result.sources||[],suggestions:result.suggestions||[],used_today:used+1,daily_limit:AI_DAILY_LIMIT,mode:'official_public_sources',interaction_type:result.interaction_type||intent};
}
