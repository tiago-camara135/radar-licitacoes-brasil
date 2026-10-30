(()=>{
  const $=s=>document.querySelector(s);
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition||null;
  const canSpeak='speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const state={conversationId:null,busy:false,started:false,status:null,me:null,listening:false,recognition:null,voiceBase:'',speakingButton:null};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl=u=>{try{const x=new URL(u);return /^https?:$/.test(x.protocol)?x.href:null}catch{return null}};

  function isAuthenticatedView(){
    const auth=$('#auth');
    if(!auth)return false;
    return auth.classList.contains('hidden')||getComputedStyle(auth).display==='none';
  }
  function syncPlatformAccess(){
    const active=isAuthenticatedView();
    document.body?.classList.toggle('rlb-platform-authenticated',active);
    if(!active){
      const panel=$('#rlbAiPanel');if(panel)panel.hidden=true;
      stopListening();stopSpeaking();
    }
    return active;
  }
  function boundedAccessSync(){
    syncPlatformAccess();
    requestAnimationFrame(syncPlatformAccess);
    setTimeout(syncPlatformAccess,80);
    setTimeout(syncPlatformAccess,280);
    setTimeout(syncPlatformAccess,850);
  }

  function lawyerAvatar(extra=''){
    return `<span class="rlb-lawyer-avatar ${extra}" aria-hidden="true"><svg class="rlb-lawyer-svg" viewBox="0 0 72 72" fill="none">
      <circle cx="36" cy="36" r="34" class="rlb-lawyer-bg"/>
      <path d="M19 66c1-15 7-23 17-23s16 8 17 23H19Z" class="rlb-lawyer-suit"/>
      <path d="M27 47l9 8 9-8 3 19H24l3-19Z" class="rlb-lawyer-shirt"/>
      <path d="M34 53h4l2 13h-8l2-13Z" class="rlb-lawyer-tie"/>
      <rect x="32" y="38" width="8" height="9" rx="3" class="rlb-lawyer-skin"/>
      <ellipse cx="36" cy="27" rx="14" ry="15" class="rlb-lawyer-skin"/>
      <path d="M23 26c0-11 5-17 14-17 8 0 13 4 14 12-6 1-9-2-12-5-4 5-9 7-16 6v4Z" class="rlb-lawyer-hair"/>
      <path d="M23 23c-1 6 0 11 3 15" class="rlb-lawyer-hairline"/>
      <g class="rlb-lawyer-eyes"><circle cx="31" cy="28" r="1.25" class="rlb-lawyer-eye"/><circle cx="41" cy="28" r="1.25" class="rlb-lawyer-eye"/></g>
      <path d="M32 35c2 1.7 6 1.7 8 0" class="rlb-lawyer-smile"/>
      <path d="M25 27h8M39 27h8M33 27h6" class="rlb-lawyer-glasses"/>
      <g class="rlb-lawyer-writing-arm">
        <path d="M47 51c5 3 8 7 10 13" class="rlb-lawyer-arm"/>
        <circle cx="57" cy="64" r="3" class="rlb-lawyer-skin"/>
        <path d="M56 62l7-8" class="rlb-lawyer-pen"/>
      </g>
      <rect x="8" y="54" width="21" height="13" rx="3" class="rlb-lawyer-document"/>
      <path d="M12 58h12M12 61h10M12 64h7" class="rlb-lawyer-document-lines"/>
    </svg></span>`;
  }
  function micIcon(){return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6"/></svg>`}
  function sendIcon(){return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 16 8-16 8 3-8-3-8Z"/><path d="M7 12h13"/></svg>`}
  function speakerIcon(){return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 10v4h4l5 4V6l-5 4H5Z"/><path d="M17 9c1.6 1.6 1.6 4.4 0 6M19.5 6.5c3 3 3 8 0 11"/></svg>`}

  async function api(path,options={}){
    const r=await fetch(path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(data.error||'Falha na IA RLB.');
    return data;
  }
  function markup(text){
    let s=esc(text).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
    s=s.replace(/(^|\n)[•\-] (.+)/g,'$1<span class="rlb-ai-list-line">• $2</span>');
    return s.replace(/\n/g,'<br>');
  }
  function sourcesHtml(sources){
    const arr=(sources||[]).map(s=>({title:s.title,url:safeUrl(s.url)})).filter(x=>x.url);
    if(!arr.length)return '';
    return `<div class="rlb-ai-sources"><b>Fontes consultadas</b>${arr.slice(0,8).map(x=>`<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">↗ ${esc(x.title||x.url)}</a>`).join('')}</div>`;
  }
  function plainText(text){return String(text||'').replace(/\*\*/g,'').replace(/^[•\-]\s*/gm,'').replace(/\s+/g,' ').trim()}
  function addMessage(role,text,sources=[]){
    const box=$('#rlbAiMessages');if(!box)return;
    box.querySelector('.rlb-ai-welcome')?.remove();
    const row=document.createElement('div');row.className=`rlb-ai-message ${role}`;
    const listen=role==='assistant'&&canSpeak?`<div class="rlb-ai-message-actions"><button type="button" class="rlb-ai-speak" title="Ouvir esta resposta">${speakerIcon()}<span>Ouvir</span></button></div>`:'';
    row.innerHTML=`${role==='assistant'?`<div class="rlb-ai-message-avatar">${lawyerAvatar()}</div>`:''}<div class="rlb-ai-bubble-wrap"><div class="rlb-ai-bubble">${markup(text)}${role==='assistant'?sourcesHtml(sources):''}</div>${listen}</div>`;
    if(role==='assistant'&&canSpeak){
      row.querySelector('.rlb-ai-speak')?.addEventListener('click',e=>toggleSpeak(text,e.currentTarget));
    }
    box.appendChild(row);box.scrollTop=box.scrollHeight;return row;
  }
  function working(stage){
    const box=$('#rlbAiMessages');
    const row=document.createElement('div');row.className='rlb-ai-message assistant rlb-ai-working-row';
    row.innerHTML=`<div class="rlb-ai-working-card"><div class="rlb-ai-working-mascot">${lawyerAvatar('writing')}</div><div class="rlb-ai-working-copy"><b>IA RLB em análise</b><span>${esc(stage)}</span><div class="rlb-ai-thinking"><i></i><i></i><i></i></div></div><div class="rlb-ai-paper"><i></i><i></i><i></i></div></div>`;
    box.appendChild(row);box.scrollTop=box.scrollHeight;return row;
  }
  function setMode(mode,label=''){
    const panel=$('#rlbAiPanel'),launcher=$('#rlbAiLauncher'),modeText=$('#rlbAiModeText');
    if(panel)panel.dataset.aiMode=mode||'idle';
    if(launcher)launcher.dataset.aiMode=mode||'idle';
    if(modeText)modeText.textContent=label||({idle:'Pronta para ajudar',thinking:'Analisando sua solicitação',listening:'Ouvindo você',speaking:'Lendo a resposta'}[mode]||'Pronta para ajudar');
  }
  function setUsage(){const el=$('#rlbAiUsage');if(!el||!state.status)return;el.textContent=`${state.status.used_today||0}/${state.status.daily_limit||'—'} hoje`}
  function setStatusVisual(){const dot=document.querySelector('.rlb-ai-status-dot');if(!dot)return;dot.classList.toggle('offline',!state.status?.configured);dot.title=state.status?.configured?'IA RLB configurada':'IA RLB aguardando ativação'}
  function welcome(){
    return `<div class="rlb-ai-welcome"><div class="rlb-ai-welcome-hero">${lawyerAvatar('welcome')}<div><span class="eyebrow">Assistente especializado</span><h3>Como posso ajudar na sua licitação?</h3><p>Converse comigo por texto ou voz. Posso explicar a Lei nº 14.133/2021, etapas, habilitação, recursos, contratos e analisar documentos.</p></div></div><div class="rlb-ai-quick"><button data-q="Qual a diferença entre pregão eletrônico e concorrência eletrônica na Lei 14.133/2021?">Pregão x concorrência</button><button data-q="Explique de forma prática as fases de uma licitação pela Lei 14.133/2021.">Fases da licitação</button><button data-q="Quais são os principais documentos de habilitação previstos na Lei 14.133/2021?">Habilitação</button><button data-q="Como funcionam intenção de recurso e recurso administrativo em licitações?">Recursos</button></div></div>`;
  }
  function build(){
    if($('#rlbAiLauncher'))return;
    const launcher=document.createElement('button');launcher.id='rlbAiLauncher';launcher.className='rlb-ai-launcher';launcher.type='button';launcher.dataset.aiMode='idle';launcher.innerHTML=`<span class="rlb-ai-orb">${lawyerAvatar('launcher')}</span><span class="rlb-ai-label">IA RLB<small>Assistente de Licitações</small></span><span class="rlb-ai-live"></span>`;
    const panel=document.createElement('section');panel.id='rlbAiPanel';panel.className='rlb-ai-panel';panel.hidden=true;panel.dataset.aiMode='idle';panel.setAttribute('aria-label','IA RLB');
    panel.innerHTML=`<header class="rlb-ai-head"><span class="rlb-ai-avatar">${lawyerAvatar('header')}</span><div class="rlb-ai-title"><b><i class="rlb-ai-status-dot"></i> IA RLB</b><span>Assistente de Licitações Públicas</span><small id="rlbAiModeText">Pronta para ajudar</small></div><div class="rlb-ai-head-actions"><button class="rlb-ai-icon-btn" id="rlbAiHistoryBtn" title="Histórico">☷</button><button class="rlb-ai-icon-btn" id="rlbAiNew" title="Nova conversa">＋</button><button class="rlb-ai-icon-btn" id="rlbAiClose" title="Fechar">×</button></div></header><div class="rlb-ai-tools"><button class="rlb-ai-tool-pill" data-q="Analise os principais riscos deste documento e diga o que merece atenção.">Analisar documento</button><button class="rlb-ai-tool-pill" data-q="Explique este documento em linguagem simples, informando para que serve e quais são seus pontos principais.">Explicar documento</button><span class="rlb-ai-usage" id="rlbAiUsage">—</span></div><div class="rlb-ai-messages" id="rlbAiMessages">${welcome()}</div><footer class="rlb-ai-compose"><div class="rlb-ai-docrow"><select id="rlbAiDoc"><option value="">Sem documento anexado</option></select><button type="button" class="rlb-ai-upload" id="rlbAiUpload">＋ Documento</button><input id="rlbAiFile" type="file" hidden accept=".pdf,.doc,.docx,.txt,.md,.csv,.xls,.xlsx"></div><div class="rlb-ai-voicebar" id="rlbAiVoiceStatus" hidden><span class="rlb-ai-wave"><i></i><i></i><i></i><i></i><i></i></span><b>Ouvindo...</b><span>Fale normalmente. O texto aparecerá no campo abaixo.</span></div><div class="rlb-ai-inputrow"><textarea id="rlbAiInput" rows="2" maxlength="6000" placeholder="Digite ou fale sua dúvida sobre licitações..."></textarea><button id="rlbAiMic" class="rlb-ai-mic" type="button" aria-label="Falar com a IA RLB" title="Falar com a IA RLB">${micIcon()}</button><button id="rlbAiSend" class="rlb-ai-send" type="button" aria-label="Enviar">${sendIcon()}</button></div><div class="rlb-ai-options"><label><input type="checkbox" id="rlbAiWeb" checked> Pesquisar fontes atuais</label><span class="rlb-ai-disclaimer">Orientação informativa • confira atos oficiais</span></div></footer><div id="rlbAiHistory" class="rlb-ai-history" hidden><div class="rlb-ai-history-head"><b>Conversas recentes</b><button class="rlb-ai-icon-btn" id="rlbAiHistoryClose" style="color:inherit;background:var(--rlb3-surface-soft)">×</button></div><div class="rlb-ai-history-list" id="rlbAiHistoryList"></div></div>`;
    document.body.append(launcher,panel);
    launcher.addEventListener('click',toggle);
    $('#rlbAiClose').addEventListener('click',()=>{panel.hidden=true;stopListening();stopSpeaking()});
    $('#rlbAiNew').addEventListener('click',newConversation);
    $('#rlbAiHistoryBtn').addEventListener('click',openHistory);
    $('#rlbAiHistoryClose').addEventListener('click',()=>$('#rlbAiHistory').hidden=true);
    $('#rlbAiSend').addEventListener('click',send);
    $('#rlbAiMic').addEventListener('click',toggleListening);
    $('#rlbAiInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}});
    panel.addEventListener('click',e=>{const b=e.target.closest('[data-q]');if(b){$('#rlbAiInput').value=b.dataset.q||'';$('#rlbAiInput').focus()}});
    $('#rlbAiUpload').addEventListener('click',()=>$('#rlbAiFile').click());
    $('#rlbAiFile').addEventListener('change',uploadDoc);
    if(!SpeechRecognition){const mic=$('#rlbAiMic');mic.disabled=true;mic.title='Reconhecimento de voz não disponível neste navegador';mic.setAttribute('aria-label','Reconhecimento de voz indisponível')}
    boundedAccessSync();
  }
  async function toggle(){
    const p=$('#rlbAiPanel');p.hidden=!p.hidden;if(p.hidden){stopListening();stopSpeaking();return}
    if(!state.started){state.started=true;await initialize()}
    setTimeout(()=>$('#rlbAiInput')?.focus(),120);
  }
  async function initialize(){
    await Promise.allSettled([loadMe(),loadStatus(),loadDocs()]);
    setStatusVisual();setMode('idle');
    if(!state.status?.configured){
      if(state.me?.role==='admin')showAdminSetup();
      else addMessage('assistant','A IA RLB está temporariamente indisponível. O administrador da plataforma já foi notificado.');
    }
  }
  async function loadMe(){try{const d=await api('/api/me');state.me=d.user||null}catch{state.me=null}}
  async function loadStatus(){try{state.status=await api('/api/ai-rlb/status');setUsage();setStatusVisual()}catch(e){addMessage('assistant',e.message)}}
  function showAdminSetup(){
    if($('#rlbAiSetup')||state.status?.configured)return;
    const box=$('#rlbAiMessages');if(!box)return;
    box.querySelector('.rlb-ai-welcome')?.remove();
    const card=document.createElement('div');card.id='rlbAiSetup';card.className='rlb-ai-setup';
    card.innerHTML=`<span class="eyebrow">Ativação exclusiva do administrador</span><h3>Conectar a IA RLB à OpenAI</h3><p>Esta chave será cadastrada uma única vez e servirá globalmente para todos os usuários da plataforma. Depois de salva, o campo não será exibido novamente.</p><label for="rlbAiKeyInput">Chave da API</label><div class="rlb-ai-keyrow"><input id="rlbAiKeyInput" type="password" autocomplete="off" spellcheck="false" placeholder="sk-proj-…"><button id="rlbAiActivate" type="button">Salvar e ativar</button></div><span class="rlb-ai-setup-status" id="rlbAiSetupStatus">A chave será armazenada criptografada e não será exibida depois de salva.</span>`;
    box.appendChild(card);box.scrollTop=box.scrollHeight;
    $('#rlbAiActivate').addEventListener('click',activateAi);
  }
  async function activateAi(){
    const input=$('#rlbAiKeyInput'),btn=$('#rlbAiActivate'),status=$('#rlbAiSetupStatus');
    const key=input?.value.trim();if(!key){status.textContent='Cole a chave criada pela OpenAI para continuar.';return}
    btn.disabled=true;status.textContent='Validando e salvando a configuração global…';
    try{
      const d=await api('/api/ai-rlb/admin/config',{method:'POST',body:JSON.stringify({api_key:key})});
      input.value='';state.status={...(state.status||{}),configured:true,model:d.model||state.status?.model};setStatusVisual();
      $('#rlbAiSetup')?.remove();addMessage('assistant',d.message||'IA RLB configurada globalmente. A mesma credencial será usada por todos os usuários da plataforma.');await loadStatus();
    }catch(e){status.textContent=e.message}finally{btn.disabled=false}
  }
  async function loadDocs(selected){
    try{const d=await api('/api/documents');const sel=$('#rlbAiDoc');sel.innerHTML='<option value="">Sem documento anexado</option>'+((d.items||[]).map(x=>`<option value="${Number(x.id)}">${esc(x.filename||'Documento')}</option>`).join(''));if(selected)sel.value=String(selected)}catch{}
  }
  async function uploadDoc(e){
    const f=e.target.files?.[0];if(!f)return;e.target.value='';
    if(f.size>3*1024*1024){addMessage('assistant','O arquivo ultrapassa o limite atual de 3 MB da Central de Documentos.');return}
    const allowed=/\.(pdf|docx?|txt|md|csv|xlsx?)$/i;if(!allowed.test(f.name)){addMessage('assistant','Para análise pela IA RLB, envie PDF, DOC/DOCX, TXT, MD, CSV ou XLS/XLSX.');return}
    try{
      setMode('thinking','Preparando documento para análise');
      const base64=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]||'');r.onerror=no;r.readAsDataURL(f)});
      const d=await api('/api/documents',{method:'POST',body:JSON.stringify({filename:f.name,mime_type:f.type||'application/octet-stream',content_base64:base64})});
      await loadDocs(d.id);addMessage('assistant',`Documento “${f.name}” anexado. Agora você pode pedir uma análise, resumo ou verificação.`)
    }catch(err){addMessage('assistant',err.message)}finally{setMode('idle')}
  }
  async function send(){
    if(state.busy)return;const input=$('#rlbAiInput');const message=input.value.trim();if(!message)return;
    if(!state.status?.configured){if(state.me?.role==='admin')showAdminSetup();else addMessage('assistant','A IA RLB está temporariamente indisponível.');return}
    stopListening();stopSpeaking();state.busy=true;$('#rlbAiSend').disabled=true;$('#rlbAiMic').disabled=true;input.value='';addMessage('user',message);
    const hasDoc=Boolean(Number($('#rlbAiDoc').value));const useWeb=$('#rlbAiWeb').checked;
    const stage=hasDoc?'Lendo e analisando o documento...':useWeb?'Consultando fontes e elaborando a resposta...':'Organizando a fundamentação e a resposta...';
    setMode('thinking',stage);const wait=working(stage);
    try{
      const data=await api('/api/ai-rlb/chat',{method:'POST',body:JSON.stringify({message,conversation_id:state.conversationId,document_id:Number($('#rlbAiDoc').value)||null,use_web:useWeb})});
      state.conversationId=data.conversation_id;wait.remove();addMessage('assistant',data.answer,data.sources||[]);if(state.status){state.status.used_today=data.used_today;state.status.daily_limit=data.daily_limit;setUsage()}
    }catch(e){wait.remove();addMessage('assistant',e.message)}finally{state.busy=false;$('#rlbAiSend').disabled=false;if(SpeechRecognition)$('#rlbAiMic').disabled=false;setMode('idle');input.focus()}
  }

  function toggleListening(){if(!SpeechRecognition||state.busy)return;if(state.listening)stopListening();else startListening()}
  function startListening(){
    stopSpeaking();
    const input=$('#rlbAiInput'),bar=$('#rlbAiVoiceStatus'),mic=$('#rlbAiMic');
    state.voiceBase=input.value.trim();
    const rec=new SpeechRecognition();state.recognition=rec;rec.lang='pt-BR';rec.interimResults=true;rec.continuous=false;rec.maxAlternatives=1;
    rec.onstart=()=>{state.listening=true;mic.classList.add('active');bar.hidden=false;setMode('listening','Ouvindo você...')};
    rec.onresult=e=>{let finalText='',interim='';for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0]?.transcript||'';if(e.results[i].isFinal)finalText+=t;else interim+=t}const spoken=(finalText||interim).trim();input.value=[state.voiceBase,spoken].filter(Boolean).join(state.voiceBase&&spoken?' ':'');input.focus();input.setSelectionRange(input.value.length,input.value.length)};
    rec.onerror=e=>{if(e.error!=='aborted'){bar.hidden=false;bar.querySelector('b').textContent=e.error==='not-allowed'?'Microfone bloqueado':'Não consegui ouvir';bar.querySelector('span:last-child').textContent=e.error==='not-allowed'?'Permita o acesso ao microfone no navegador e tente novamente.':'Tente novamente falando um pouco mais perto do microfone.'}};
    rec.onend=()=>{state.listening=false;mic.classList.remove('active');state.recognition=null;setMode('idle');setTimeout(()=>{if(!state.listening)bar.hidden=true},900)};
    try{rec.start()}catch{state.recognition=null}
  }
  function stopListening(){if(state.recognition){try{state.recognition.stop()}catch{}}state.listening=false;$('#rlbAiMic')?.classList.remove('active');const bar=$('#rlbAiVoiceStatus');if(bar)bar.hidden=true;if(!state.busy)setMode('idle')}

  function choosePortugueseVoice(){const voices=window.speechSynthesis?.getVoices?.()||[];return voices.find(v=>/^pt-BR$/i.test(v.lang))||voices.find(v=>/^pt/i.test(v.lang))||voices[0]||null}
  function toggleSpeak(text,button){
    if(!canSpeak)return;
    if(state.speakingButton===button&&window.speechSynthesis.speaking){stopSpeaking();return}
    stopSpeaking();
    const utter=new SpeechSynthesisUtterance(plainText(text));utter.lang='pt-BR';utter.rate=1;utter.pitch=1;const voice=choosePortugueseVoice();if(voice)utter.voice=voice;
    state.speakingButton=button;button.classList.add('active');button.querySelector('span').textContent='Parar';setMode('speaking','Lendo a resposta em voz alta');
    utter.onend=utter.onerror=()=>{button.classList.remove('active');const label=button.querySelector('span');if(label)label.textContent='Ouvir';if(state.speakingButton===button)state.speakingButton=null;if(!state.busy)setMode('idle')};
    window.speechSynthesis.speak(utter);
  }
  function stopSpeaking(){if(!canSpeak)return;try{window.speechSynthesis.cancel()}catch{}if(state.speakingButton){state.speakingButton.classList.remove('active');const label=state.speakingButton.querySelector('span');if(label)label.textContent='Ouvir';state.speakingButton=null}if(!state.busy&&!state.listening)setMode('idle')}

  function newConversation(){stopListening();stopSpeaking();state.conversationId=null;$('#rlbAiMessages').innerHTML=welcome();$('#rlbAiHistory').hidden=true;$('#rlbAiDoc').value='';if(!state.status?.configured&&state.me?.role==='admin')showAdminSetup();setMode('idle');$('#rlbAiInput').focus()}
  async function openHistory(){
    stopListening();stopSpeaking();const drawer=$('#rlbAiHistory');drawer.hidden=false;const list=$('#rlbAiHistoryList');list.innerHTML='<div style="padding:12px;color:var(--rlb3-muted);font-size:10px">Carregando...</div>';
    try{const d=await api('/api/ai-rlb/conversations');if(!(d.items||[]).length){list.innerHTML='<div style="padding:12px;color:var(--rlb3-muted);font-size:10px">Nenhuma conversa salva.</div>';return}list.innerHTML=d.items.map(x=>`<button class="rlb-ai-history-item" data-conv="${Number(x.id)}"><b>${esc(x.title||'Conversa')}</b><span>${new Date(x.updated_at||x.created_at).toLocaleString('pt-BR')}</span></button>`).join('');list.onclick=e=>{const b=e.target.closest('[data-conv]');if(b)loadConversation(Number(b.dataset.conv))}}
    catch(e){list.innerHTML=`<div style="padding:12px;color:var(--rlb3-muted);font-size:10px">${esc(e.message)}</div>`}
  }
  async function loadConversation(id){
    try{const d=await api(`/api/ai-rlb/conversations/${id}/messages`);state.conversationId=id;const box=$('#rlbAiMessages');box.innerHTML='';(d.items||[]).forEach(m=>addMessage(m.role,m.content,m.sources||[]));$('#rlbAiHistory').hidden=true;if(!d.items?.length)box.innerHTML=welcome();setMode('idle')}
    catch(e){addMessage('assistant',e.message)}
  }
  document.addEventListener('click',e=>{if(e.target.closest('#authBtn,#logout,#tabLogin,#tabRegister'))boundedAccessSync()},true);
  window.addEventListener('pageshow',boundedAccessSync);
  window.addEventListener('beforeunload',()=>{stopListening();stopSpeaking()});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{build();boundedAccessSync()},{once:true});else{build();boundedAccessSync()}
})();
