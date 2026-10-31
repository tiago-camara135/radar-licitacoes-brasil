(()=>{
'use strict';
if(window.__rlbAiUiEnhanced)return;
window.__rlbAiUiEnhanced=true;

let typingNode=null;
let lastStatus='';
const nativeFetch=window.fetch.bind(window);

function messagesRoot(){return document.getElementById('aiMessages')}
function promptBox(){return document.getElementById('aiPrompt')}
function scrollMessages(){const root=messagesRoot();if(root)root.scrollTop=root.scrollHeight}

function decorateMessage(node){
  if(!(node instanceof HTMLElement)||!node.classList.contains('ai-msg')||node.dataset.enhanced==='1')return;
  const role=node.classList.contains('assistant')?'assistant':'user';
  const text=node.textContent||'';
  node.textContent='';
  node.dataset.enhanced='1';
  node.classList.add('ai-msg-modern');
  if(role==='assistant'){
    const avatar=document.createElement('span');
    avatar.className='ai-msg-avatar';
    avatar.setAttribute('aria-hidden','true');
    avatar.textContent='🧑‍⚖️';
    node.appendChild(avatar);
  }
  const bubble=document.createElement('div');
  bubble.className='ai-msg-bubble';
  bubble.textContent=text;
  node.appendChild(bubble);
  requestAnimationFrame(()=>node.classList.add('ai-msg-in'));
  scrollMessages();
}

function showTyping(){
  const root=messagesRoot();
  if(!root||typingNode)return;
  root.querySelector('.empty-state')?.remove();
  const row=document.createElement('div');
  row.className='ai-typing-row';
  row.innerHTML='<span class="ai-msg-avatar" aria-hidden="true">🧑‍⚖️</span><div class="ai-typing-bubble"><span></span><span></span><span></span><small>Analisando sua solicitação</small></div>';
  typingNode=row;
  root.appendChild(row);
  const status=document.getElementById('aiStatusText');
  if(status){lastStatus=status.textContent||'';status.textContent='Analisando…'}
  scrollMessages();
}
function hideTyping(){
  typingNode?.remove();
  typingNode=null;
  const status=document.getElementById('aiStatusText');
  if(status&&lastStatus){status.textContent=lastStatus;lastStatus=''}
}

function enhanceHeader(){
  const avatar=document.querySelector('#ai-assistant .ai-avatar');
  if(avatar){avatar.textContent='🧑‍⚖️';avatar.classList.add('ai-advisor-avatar')}
  const title=document.querySelector('#ai-assistant .ai-window-head b');
  if(title)title.textContent='IA-RLB • Assessor Virtual';
  const status=document.getElementById('aiStatusText');
  if(status&&!status.dataset.enhanced){
    status.dataset.enhanced='1';
    const dot=document.createElement('i');
    dot.className='ai-online-dot';
    status.parentElement?.insertBefore(dot,status);
  }
}

function enhanceWelcome(){
  const root=messagesRoot();
  const welcome=root?.querySelector('.ai-welcome');
  if(!welcome||welcome.dataset.enhanced==='1')return;
  welcome.dataset.enhanced='1';
  welcome.innerHTML='<div class="ai-welcome-icon">⚖</div><b>Olá, sou seu assessor virtual de licitações.</b><span>Posso apoiar em editais, habilitação, recursos, Lei 14.133/2021, documentos e oportunidades monitoradas.</span><div class="ai-welcome-tags"><em>PNCP</em><em>Lei 14.133</em><em>Habilitação</em><em>Recursos</em></div>';
}

function installSuggestions(){
  const compose=document.querySelector('#ai-assistant .ai-compose');
  if(!compose||document.querySelector('#ai-assistant .ai-suggestions'))return;
  const box=document.createElement('div');
  box.className='ai-suggestions';
  const suggestions=[
    ['Analisar edital','Quero analisar um edital. Quais informações ou documento devo enviar para você fazer uma análise completa?'],
    ['Habilitação','Quero conferir a habilitação de uma empresa em uma licitação. Me ajude a montar a análise dos documentos e requisitos.'],
    ['Recurso','Preciso analisar ou elaborar um recurso/contrarrazões em licitação. Me ajude a estruturar os pontos jurídicos e técnicos.'],
    ['Buscar oportunidade','Quero buscar oportunidades de licitação. Vou informar o segmento, UF e palavras-chave para você me orientar.']
  ];
  suggestions.forEach(([label,prompt])=>{
    const b=document.createElement('button');
    b.type='button';
    b.className='ai-suggestion-chip';
    b.textContent=label;
    b.addEventListener('click',()=>{
      const field=promptBox();
      if(!field)return;
      field.value=prompt;
      field.focus({preventScroll:true});
      field.dispatchEvent(new Event('input',{bubbles:true}));
    });
    box.appendChild(b);
  });
  compose.parentElement?.insertBefore(box,compose);
}

function observeMessages(){
  const root=messagesRoot();
  if(!root)return;
  root.querySelectorAll('.ai-msg').forEach(decorateMessage);
  const obs=new MutationObserver(records=>{
    for(const rec of records){
      rec.addedNodes.forEach(node=>{
        if(node instanceof HTMLElement&&node.classList.contains('ai-msg'))decorateMessage(node);
        else if(node instanceof HTMLElement)node.querySelectorAll?.('.ai-msg').forEach(decorateMessage);
      });
    }
  });
  obs.observe(root,{childList:true,subtree:true});
}

function installTypingInterceptor(){
  if(window.__rlbAiFetchWrapped)return;
  window.__rlbAiFetchWrapped=true;
  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:(input?.url||'');
    const isChat=url.includes('/api/ai-rlb/chat');
    if(isChat)showTyping();
    try{return await nativeFetch(input,init)}
    finally{if(isChat)hideTyping()}
  };
}

function enhanceComposer(){
  const field=promptBox();
  if(field){field.placeholder='Converse com seu assessor de licitações…';field.setAttribute('aria-label','Mensagem para a IA-RLB')}
  const send=document.getElementById('aiSend');
  if(send&&!send.dataset.enhanced){send.dataset.enhanced='1';send.innerHTML='<span>Enviar</span><b aria-hidden="true">↗</b>'}
}

function init(){
  if(!document.getElementById('ai-assistant'))return;
  enhanceHeader();
  enhanceWelcome();
  installSuggestions();
  enhanceComposer();
  observeMessages();
  installTypingInterceptor();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
