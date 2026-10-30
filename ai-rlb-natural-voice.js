(()=>{
  const $=s=>document.querySelector(s);
  const speech=window.speechSynthesis||null;
  if(!speech||!('SpeechSynthesisUtterance' in window))return;

  const state={speaking:false,button:null,queue:[],timer:null,voice:null};
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

  function injectStyle(){
    if($('#rlb-ai-natural-voice-style'))return;
    const st=document.createElement('style');st.id='rlb-ai-natural-voice-style';st.textContent=`
      #rlbAiVoiceSelect{display:none!important}
      .rlb-ai-natural-voice-wrap{display:inline-flex;align-items:center;gap:5px;min-width:0}
      .rlb-ai-natural-voice-select{height:28px;max-width:170px;border:1px solid var(--rlb3-border,#29495a);border-radius:9px;background:var(--rlb3-surface-soft,#102837);color:var(--rlb3-text,#e9f3f7);font-size:9px;padding:0 23px 0 8px;outline:none}
      .rlb-ai-natural-voice-select:focus{border-color:#19c58b;box-shadow:0 0 0 2px rgba(25,197,139,.14)}
      .rlb-ai-voice-test{height:28px;border:1px solid var(--rlb3-border,#29495a);border-radius:9px;background:var(--rlb3-surface-soft,#102837);color:var(--rlb3-text,#e9f3f7);font-size:9px;font-weight:800;padding:0 9px;cursor:pointer;white-space:nowrap}
      .rlb-ai-voice-test:hover{border-color:#19c58b}
      .rlb-ai-natural-badge{font-size:8px;font-weight:800;color:#19c58b;white-space:nowrap}
      @media(max-width:600px){.rlb-ai-natural-voice-select{max-width:125px}.rlb-ai-natural-badge{display:none}.rlb-ai-voice-test{padding:0 7px}}
    `;document.head.appendChild(st);
  }

  function voices(){return speech.getVoices?.()||[]}
  function score(v){
    const name=norm(v?.name),lang=String(v?.lang||'').toLowerCase();
    if(!lang.startsWith('pt'))return -10000;
    let n=lang==='pt-br'?300:160;
    if(/natural/.test(name))n+=180;
    if(/neural/.test(name))n+=165;
    if(/premium|enhanced/.test(name))n+=135;
    if(/online/.test(name))n+=95;
    if(/google/.test(name))n+=80;
    if(/microsoft/.test(name))n+=75;
    if(/francisca|antonio|ant[oô]nio|luciana|felipe|camila|fernanda|paulo|vit[oó]ria|vitoria/.test(name))n+=35;
    if(v?.localService===false)n+=20;
    if(/compact|espeak|festival/.test(name))n-=180;
    return n;
  }
  function ranked(){return voices().filter(v=>score(v)>-10000).sort((a,b)=>score(b)-score(a))}
  function selectedVoice(){
    const list=ranked(),saved=localStorage.getItem('rlb-ai-natural-voice')||'';
    return list.find(v=>v.name===saved)||list[0]||voices()[0]||null;
  }
  function isHighQuality(v){return /(natural|neural|premium|enhanced|online|google)/i.test(v?.name||'')}
  function label(v){
    const high=isHighQuality(v)?' • natural':'';
    return `${v.name}${String(v.lang||'').toLowerCase()==='pt-br'?' • BR':''}${high}`;
  }

  function fillSelect(select){
    const list=ranked(),current=localStorage.getItem('rlb-ai-natural-voice')||selectedVoice()?.name||'';
    select.innerHTML=list.length?list.map(v=>`<option value="${String(v.name).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')}">${label(v)}</option>`).join(''):'<option value="">Voz padrão do dispositivo</option>';
    if([...select.options].some(o=>o.value===current))select.value=current;
    state.voice=selectedVoice();
    const badge=$('#rlbAiNaturalBadge');if(badge)badge.textContent=isHighQuality(state.voice)?'Voz natural':'Voz padrão';
  }

  function installControls(){
    injectStyle();
    const options=$('.rlb-ai-options');if(!options||$('#rlbAiNaturalVoiceSelect'))return;
    const wrap=document.createElement('span');wrap.className='rlb-ai-natural-voice-wrap';
    wrap.innerHTML=`<select id="rlbAiNaturalVoiceSelect" class="rlb-ai-natural-voice-select" title="Escolher voz da IA RLB"></select><button id="rlbAiVoiceTest" class="rlb-ai-voice-test" type="button">Testar voz</button><span id="rlbAiNaturalBadge" class="rlb-ai-natural-badge"></span>`;
    options.insertBefore(wrap,options.querySelector('.rlb-ai-disclaimer'));
    const select=$('#rlbAiNaturalVoiceSelect');
    select.addEventListener('change',()=>{localStorage.setItem('rlb-ai-natural-voice',select.value);state.voice=voices().find(v=>v.name===select.value)||selectedVoice();const badge=$('#rlbAiNaturalBadge');if(badge)badge.textContent=isHighQuality(state.voice)?'Voz natural':'Voz padrão'});
    $('#rlbAiVoiceTest').addEventListener('click',e=>{e.preventDefault();e.stopPropagation();start('Olá! Eu sou a IA RLB. Esta é a voz selecionada para conversar com você de forma mais natural.',e.currentTarget,true)});
    fillSelect(select);setTimeout(()=>fillSelect(select),250);setTimeout(()=>fillSelect(select),1000);
  }

  function clean(text){
    return String(text||'')
      .replace(/Fontes consultadas[\s\S]*$/i,'')
      .replace(/https?:\/\/\S+/g,'')
      .replace(/\bLei\s*(?:n[º°]\s*)?14\.133\/2021\b/gi,'Lei número quatorze mil cento e trinta e três, de dois mil e vinte e um')
      .replace(/\bArt\.\s*/gi,'Artigo ')
      .replace(/\bn[º°]\s*/gi,'número ')
      .replace(/\bIA RLB\b/g,'I A R L B')
      .replace(/[•▪◦]/g,'. ')
      .replace(/\s*\n+\s*/g,'. ')
      .replace(/\.{2,}/g,'.')
      .replace(/\s+/g,' ')
      .trim();
  }
  function chunks(text){
    const t=clean(text);if(!t)return [];
    const sentences=t.match(/[^.!?;:]+[.!?;:]?/g)||[t],out=[];
    for(const raw of sentences){
      const s=raw.trim();if(!s)continue;
      if(s.length<=185){out.push({text:s,pause:/[!?]$/.test(s)?270:/[.;:]$/.test(s)?200:135});continue}
      const pieces=s.match(/.{1,165}(?:,\s|\s|$)/g)||[s];
      for(const p of pieces){const x=p.trim();if(x)out.push({text:x,pause:125})}
    }
    return out;
  }
  function readableTextFromButton(button){
    const bubble=button.closest('.rlb-ai-bubble-wrap')?.querySelector('.rlb-ai-bubble');if(!bubble)return '';
    const clone=bubble.cloneNode(true);clone.querySelectorAll('.rlb-ai-sources,a').forEach(n=>n.remove());
    return clone.innerText||clone.textContent||'';
  }
  function resetButton(){
    if(state.timer){clearTimeout(state.timer);state.timer=null}
    if(state.button){
      state.button.classList.remove('active');
      const sp=state.button.querySelector('span');
      if(sp)sp.textContent='Ouvir';
      else if(state.button.id==='rlbAiVoiceTest')state.button.textContent='Testar voz';
    }
    state.speaking=false;state.button=null;state.queue=[];
    const mode=$('#rlbAiModeText');if(mode&&/Lendo|Falando/.test(mode.textContent))mode.textContent='Pronta para ajudar';
  }
  function stop(){try{speech.cancel()}catch{}resetButton()}
  function next(){
    if(!state.speaking)return;
    const item=state.queue.shift();if(!item){resetButton();return}
    const voice=voices().find(v=>v.name===$('#rlbAiNaturalVoiceSelect')?.value)||state.voice||selectedVoice();
    const u=new SpeechSynthesisUtterance(item.text);u.lang='pt-BR';u.voice=voice||null;u.volume=1;
    if(isHighQuality(voice)){u.rate=.96;u.pitch=1.0}else{u.rate=.92;u.pitch=.99}
    u.onend=()=>{state.timer=setTimeout(next,item.pause||140)};
    u.onerror=()=>resetButton();
    try{speech.speak(u)}catch{resetButton()}
  }
  function start(text,button,isTest=false){
    if(state.speaking&&state.button===button){stop();return}
    stop();state.queue=chunks(text);if(!state.queue.length)return;
    state.speaking=true;state.button=button;button.classList.add('active');
    const span=button.querySelector('span');if(span)span.textContent='Parar';else if(isTest)button.textContent='Parar';
    const mode=$('#rlbAiModeText');if(mode)mode.textContent='Falando com você...';
    next();
  }

  document.addEventListener('click',e=>{
    const b=e.target.closest('.rlb-ai-speak');if(!b)return;
    e.preventDefault();e.stopImmediatePropagation();
    start(readableTextFromButton(b),b,false);
  },true);

  function bounded(){installControls();requestAnimationFrame(installControls);setTimeout(installControls,80);setTimeout(installControls,350);setTimeout(installControls,1000)}
  if('onvoiceschanged' in speech)speech.addEventListener?.('voiceschanged',()=>{const s=$('#rlbAiNaturalVoiceSelect');if(s)fillSelect(s)});
  document.addEventListener('click',e=>{if(e.target.closest('#rlbAiLauncher,#rlbAiNew'))setTimeout(bounded,40);if(e.target.closest('#rlbAiClose,#logout'))stop()},true);
  window.addEventListener('beforeunload',stop);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bounded,{once:true});else bounded();
})();