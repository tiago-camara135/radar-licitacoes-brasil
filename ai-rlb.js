(()=>{
  const $=s=>document.querySelector(s);
  const state={conversationId:null,busy:false,started:false,status:null};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl=u=>{try{const x=new URL(u);return /^https?:$/.test(x.protocol)?x.href:null}catch{return null}};
  function icon(){return `<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect x="6" y="8" width="20" height="17" rx="6" stroke="currentColor" stroke-width="2"/><path d="M11 15h.01M21 15h.01M11 20c3 2 7 2 10 0M16 5v3" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`}
  async function api(path,options={}){
    const r=await fetch(path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(data.error||'Falha na IA RLB.');
    return data;
  }
  function markup(text){
    let s=esc(text).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
    s=s.replace(/(^|\n)[•\-] (.+)/g,'$1<span>• $2</span>');
    return s.replace(/\n/g,'<br>');
  }
  function sourcesHtml(sources){
    const arr=(sources||[]).map(s=>({title:s.title,url:safeUrl(s.url)})).filter(x=>x.url);
    if(!arr.length)return '';
    return `<div class="rlb-ai-sources"><b>Fontes consultadas</b>${arr.slice(0,8).map(x=>`<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">↗ ${esc(x.title||x.url)}</a>`).join('')}</div>`;
  }
  function addMessage(role,text,sources=[]){
    const box=$('#rlbAiMessages'); if(!box)return;
    box.querySelector('.rlb-ai-welcome')?.remove();
    const row=document.createElement('div');row.className=`rlb-ai-message ${role}`;
    row.innerHTML=`<div class="rlb-ai-bubble">${markup(text)}${role==='assistant'?sourcesHtml(sources):''}</div>`;
    box.appendChild(row);box.scrollTop=box.scrollHeight;return row;
  }
  function thinking(){
    const box=$('#rlbAiMessages');const row=document.createElement('div');row.className='rlb-ai-message assistant rlb-ai-thinking-row';row.innerHTML='<div class="rlb-ai-bubble"><span class="rlb-ai-thinking"><i></i><i></i><i></i></span></div>';box.appendChild(row);box.scrollTop=box.scrollHeight;return row;
  }
  function setUsage(){const el=$('#rlbAiUsage');if(!el||!state.status)return;el.textContent=`${state.status.used_today||0}/${state.status.daily_limit||'—'} hoje`}
  function welcome(){
    return `<div class="rlb-ai-welcome"><span class="eyebrow">Assistente especializado</span><h3>Como posso ajudar na sua licitação?</h3><p>Posso explicar a Lei nº 14.133/2021, etapas do processo, habilitação, recursos, contratos e analisar documentos que estejam na sua Central de Documentos.</p><div class="rlb-ai-quick"><button data-q="Qual a diferença entre pregão eletrônico e concorrência eletrônica na Lei 14.133/2021?">Pregão x concorrência</button><button data-q="Explique de forma prática as fases de uma licitação pela Lei 14.133/2021.">Fases da licitação</button><button data-q="Quais são os principais documentos de habilitação previstos na Lei 14.133/2021?">Habilitação</button><button data-q="Como funcionam intenção de recurso e recurso administrativo em licitações?">Recursos</button></div></div>`;
  }
  function build(){
    if($('#rlbAiLauncher'))return;
    const launcher=document.createElement('button');launcher.id='rlbAiLauncher';launcher.className='rlb-ai-launcher';launcher.type='button';launcher.innerHTML=`<span class="rlb-ai-orb">${icon()}</span><span class="rlb-ai-label">IA RLB<small>Assistente de Licitações</small></span><span class="rlb-ai-live"></span>`;
    const panel=document.createElement('section');panel.id='rlbAiPanel';panel.className='rlb-ai-panel';panel.hidden=true;panel.setAttribute('aria-label','IA RLB');
    panel.innerHTML=`<header class="rlb-ai-head"><span class="rlb-ai-avatar">${icon()}</span><div class="rlb-ai-title"><b><i class="rlb-ai-status-dot"></i> IA RLB</b><span>Inteligência em Licitações Públicas</span></div><div class="rlb-ai-head-actions"><button class="rlb-ai-icon-btn" id="rlbAiHistoryBtn" title="Histórico">☷</button><button class="rlb-ai-icon-btn" id="rlbAiNew" title="Nova conversa">＋</button><button class="rlb-ai-icon-btn" id="rlbAiClose" title="Fechar">×</button></div></header><div class="rlb-ai-tools"><button class="rlb-ai-tool-pill" data-q="Analise os principais riscos deste documento e diga o que merece atenção.">Analisar documento</button><button class="rlb-ai-tool-pill" data-q="Explique este documento em linguagem simples, informando para que serve e quais são seus pontos principais.">Explicar documento</button><span class="rlb-ai-usage" id="rlbAiUsage">—</span></div><div class="rlb-ai-messages" id="rlbAiMessages">${welcome()}</div><footer class="rlb-ai-compose"><div class="rlb-ai-docrow"><select id="rlbAiDoc"><option value="">Sem documento anexado</option></select><button type="button" class="rlb-ai-upload" id="rlbAiUpload">＋ Documento</button><input id="rlbAiFile" type="file" hidden accept=".pdf,.doc,.docx,.txt,.md,.csv,.xls,.xlsx"></div><div class="rlb-ai-inputrow"><textarea id="rlbAiInput" rows="2" maxlength="6000" placeholder="Digite sua dúvida sobre licitações..."></textarea><button id="rlbAiSend" class="rlb-ai-send" type="button" aria-label="Enviar">➤</button></div><div class="rlb-ai-options"><label><input type="checkbox" id="rlbAiWeb" checked> Pesquisar fontes atuais</label><span class="rlb-ai-disclaimer">Orientação informativa • confira atos oficiais</span></div></footer><div id="rlbAiHistory" class="rlb-ai-history" hidden><div class="rlb-ai-history-head"><b>Conversas recentes</b><button class="rlb-ai-icon-btn" id="rlbAiHistoryClose" style="color:inherit;background:var(--rlb3-surface-soft)">×</button></div><div class="rlb-ai-history-list" id="rlbAiHistoryList"></div></div>`;
    document.body.append(launcher,panel);
    launcher.addEventListener('click',toggle);
    $('#rlbAiClose').addEventListener('click',()=>panel.hidden=true);
    $('#rlbAiNew').addEventListener('click',newConversation);
    $('#rlbAiHistoryBtn').addEventListener('click',openHistory);
    $('#rlbAiHistoryClose').addEventListener('click',()=>$('#rlbAiHistory').hidden=true);
    $('#rlbAiSend').addEventListener('click',send);
    $('#rlbAiInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}});
    panel.addEventListener('click',e=>{const b=e.target.closest('[data-q]');if(b){$('#rlbAiInput').value=b.dataset.q||'';$('#rlbAiInput').focus()}});
    $('#rlbAiUpload').addEventListener('click',()=>$('#rlbAiFile').click());
    $('#rlbAiFile').addEventListener('change',uploadDoc);
  }
  async function toggle(){
    const p=$('#rlbAiPanel');p.hidden=!p.hidden;if(p.hidden)return;
    if(!state.started){state.started=true;await Promise.allSettled([loadStatus(),loadDocs()])}
    setTimeout(()=>$('#rlbAiInput')?.focus(),120);
  }
  async function loadStatus(){
    try{state.status=await api('/api/ai-rlb/status');setUsage();if(!state.status.configured)addMessage('assistant','A interface da IA RLB está instalada, mas o motor de IA ainda precisa ser ativado pelo administrador.')}
    catch(e){addMessage('assistant',e.message)}
  }
  async function loadDocs(selected){
    try{const d=await api('/api/documents');const sel=$('#rlbAiDoc');sel.innerHTML='<option value="">Sem documento anexado</option>'+((d.items||[]).map(x=>`<option value="${Number(x.id)}">${esc(x.filename||'Documento')}</option>`).join(''));if(selected)sel.value=String(selected)}catch{}
  }
  async function uploadDoc(e){
    const f=e.target.files?.[0];if(!f)return;e.target.value='';
    if(f.size>3*1024*1024){addMessage('assistant','O arquivo ultrapassa o limite atual de 3 MB da Central de Documentos.');return}
    const allowed=/\.(pdf|docx?|txt|md|csv|xlsx?)$/i;if(!allowed.test(f.name)){addMessage('assistant','Para análise pela IA RLB, envie PDF, DOC/DOCX, TXT, MD, CSV ou XLS/XLSX.');return}
    try{
      const base64=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]||'');r.onerror=no;r.readAsDataURL(f)});
      const d=await api('/api/documents',{method:'POST',body:JSON.stringify({filename:f.name,mime_type:f.type||'application/octet-stream',content_base64:base64})});
      await loadDocs(d.id);addMessage('assistant',`Documento “${f.name}” anexado. Agora você pode pedir uma análise, resumo ou verificação.`)
    }catch(err){addMessage('assistant',err.message)}
  }
  async function send(){
    if(state.busy)return;const input=$('#rlbAiInput');const message=input.value.trim();if(!message)return;
    state.busy=true;$('#rlbAiSend').disabled=true;input.value='';addMessage('user',message);const wait=thinking();
    try{
      const data=await api('/api/ai-rlb/chat',{method:'POST',body:JSON.stringify({message,conversation_id:state.conversationId,document_id:Number($('#rlbAiDoc').value)||null,use_web:$('#rlbAiWeb').checked})});
      state.conversationId=data.conversation_id;wait.remove();addMessage('assistant',data.answer,data.sources||[]);if(state.status){state.status.used_today=data.used_today;state.status.daily_limit=data.daily_limit;setUsage()}
    }catch(e){wait.remove();addMessage('assistant',e.message)}finally{state.busy=false;$('#rlbAiSend').disabled=false;input.focus()}
  }
  function newConversation(){state.conversationId=null;$('#rlbAiMessages').innerHTML=welcome();$('#rlbAiHistory').hidden=true;$('#rlbAiDoc').value='';$('#rlbAiInput').focus()}
  async function openHistory(){
    const drawer=$('#rlbAiHistory');drawer.hidden=false;const list=$('#rlbAiHistoryList');list.innerHTML='<div style="padding:12px;color:var(--rlb3-muted);font-size:10px">Carregando...</div>';
    try{const d=await api('/api/ai-rlb/conversations');if(!(d.items||[]).length){list.innerHTML='<div style="padding:12px;color:var(--rlb3-muted);font-size:10px">Nenhuma conversa salva.</div>';return}list.innerHTML=d.items.map(x=>`<button class="rlb-ai-history-item" data-conv="${Number(x.id)}"><b>${esc(x.title||'Conversa')}</b><span>${new Date(x.updated_at||x.created_at).toLocaleString('pt-BR')}</span></button>`).join('');list.onclick=e=>{const b=e.target.closest('[data-conv]');if(b)loadConversation(Number(b.dataset.conv))}}
    catch(e){list.innerHTML=`<div style="padding:12px;color:var(--rlb3-muted);font-size:10px">${esc(e.message)}</div>`}
  }
  async function loadConversation(id){
    try{const d=await api(`/api/ai-rlb/conversations/${id}/messages`);state.conversationId=id;const box=$('#rlbAiMessages');box.innerHTML='';(d.items||[]).forEach(m=>addMessage(m.role,m.content,m.sources||[]));$('#rlbAiHistory').hidden=true;if(!d.items?.length)box.innerHTML=welcome()}
    catch(e){addMessage('assistant',e.message)}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',build,{once:true});else build();
})();
