(()=>{
  const $=s=>document.querySelector(s);
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[!?.,;:]+/g,' ').replace(/\s+/g,' ').trim();
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition||null;
  const speech=window.speechSynthesis||null;
  const voiceState={recognition:null,wanted:false,base:'',finalText:'',speaking:false,button:null,queue:[],voice:null};

  function isSmallTalk(text){
    const q=norm(text);
    return /^(oi|ola|opa|hey|hello|e ai|bom dia|boa tarde|boa noite)( tudo bem| como vai| tudo certo)?$/.test(q)||
      /^(tudo bem|como vai|como voce esta|ta tudo bem|obrigado|obrigada|valeu|agradeco|muito obrigado|muito obrigada|perfeito|show|beleza|entendi|certo|otimo|tchau|ate mais|ate logo|falou)$/.test(q)||
      /(quem e voce|o que voce faz|como voce pode me ajudar|para que voce serve)/.test(q);
  }
  function injectStyle(){
    if($('#rlb-ai-interaction-v3-style'))return;
    const st=document.createElement('style');st.id='rlb-ai-interaction-v3-style';st.textContent=`
      .rlb-ai-voice-select{max-width:155px;height:28px;border:1px solid var(--rlb3-border,#29495a);border-radius:9px;background:var(--rlb3-surface-soft,#102837);color:var(--rlb3-text,#e9f3f7);font-size:9px;padding:0 24px 0 8px;outline:none}
      .rlb-ai-voice-select:focus{border-color:#19c58b;box-shadow:0 0 0 2px rgba(25,197,139,.14)}
      .rlb-ai-voice-hint{font-size:8px;color:var(--rlb3-muted,#8fa8b6);white-space:nowrap}
      .rlb-ai-mic[data-listening="true"]{box-shadow:0 0 0 5px rgba(20,190,139,.15),0 0 22px rgba(20,190,139,.32)!important;transform:scale(1.03)}
      .rlb-ai-mic[data-listening="true"] svg{animation:rlbMicPulse 1s ease-in-out infinite}
      @keyframes rlbMicPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}
      .rlb-ai-voicebar.rlb-ai-voice-error{border-color:rgba(239,108,108,.45)!important;background:rgba(123,34,34,.15)!important}
      @media(max-width:600px){.rlb-ai-voice-select{max-width:120px}.rlb-ai-voice-hint{display:none}}
    `;document.head.appendChild(st);
  }
  function patchStatic(){
    const welcome=$('.rlb-ai-welcome');
    if(welcome){
      const eyebrow=welcome.querySelector('.eyebrow');if(eyebrow)eyebrow.textContent='Assistente RLB';
      const h=welcome.querySelector('h3');if(h)h.textContent='Olá! Como posso ajudar?';
      const p=welcome.querySelector('p');if(p)p.textContent='Pode conversar comigo normalmente por texto ou voz. Quando sua dúvida envolver licitações, contratos ou compras públicas, consulto fontes oficiais antes de responder.';
    }
    const input=$('#rlbAiInput');if(input)input.placeholder='Digite ou fale sua mensagem...';
    const web=$('#rlbAiWeb');if(web){const label=web.closest('label');if(label){for(const n of [...label.childNodes])if(n.nodeType===Node.TEXT_NODE)n.textContent=' Consultar fontes oficiais';}}
    const disclaimer=$('.rlb-ai-disclaimer');if(disclaimer)disclaimer.textContent='Respostas jurídicas • baseadas em fontes oficiais';
    installVoiceSelector();installMic();
  }
  function patchWorking(social){
    if(!social)return;
    const rows=[...document.querySelectorAll('.rlb-ai-working-row')];const row=rows.at(-1);if(!row)return;
    const b=row.querySelector('.rlb-ai-working-copy b');if(b)b.textContent='IA RLB está respondendo';
    const s=row.querySelector('.rlb-ai-working-copy span');if(s)s.textContent='Conversando com você...';
    const mode=$('#rlbAiModeText');if(mode)mode.textContent='Respondendo...';
  }
  function captureAndPatch(){
    const input=$('#rlbAiInput');if(!input)return;
    const social=isSmallTalk(input.value);
    if(voiceState.wanted)stopRecognition(false);
    if(social)queueMicrotask(()=>patchWorking(true));
  }

  function getVoices(){return speech?.getVoices?.()||[]}
  function voiceScore(v){
    const name=norm(v?.name),lang=String(v?.lang||'').toLowerCase();let s=0;
    if(lang==='pt-br')s+=120;else if(lang.startsWith('pt'))s+=70;else return -1000;
    if(/natural|neural|premium|enhanced/.test(name))s+=55;
    if(/google/.test(name))s+=35;
    if(/microsoft/.test(name))s+=30;
    if(/online/.test(name))s+=25;
    if(/luciana|francisca|antonio|ant[oô]nio|felipe|camila/.test(name))s+=15;
    if(v.localService===false)s+=8;
    if(/compact|espeak/.test(name))s-=35;
    return s;
  }
  function bestVoice(){
    const all=getVoices().filter(v=>voiceScore(v)>-1000).sort((a,b)=>voiceScore(b)-voiceScore(a));
    const saved=localStorage.getItem('rlb-ai-voice');
    return all.find(v=>v.name===saved)||all[0]||getVoices()[0]||null;
  }
  function installVoiceSelector(){
    if(!speech)return;
    const options=$('.rlb-ai-options');if(!options||$('#rlbAiVoiceSelect'))return;
    const select=document.createElement('select');select.id='rlbAiVoiceSelect';select.className='rlb-ai-voice-select';select.title='Escolher voz da IA RLB';
    const hint=document.createElement('span');hint.className='rlb-ai-voice-hint';hint.textContent='Voz do dispositivo';
    const fill=()=>{
      const voices=getVoices().filter(v=>String(v.lang||'').toLowerCase().startsWith('pt')).sort((a,b)=>voiceScore(b)-voiceScore(a));
      const current=localStorage.getItem('rlb-ai-voice')||bestVoice()?.name||'';
      select.innerHTML=voices.length?voices.map(v=>`<option value="${String(v.name).replace(/"/g,'&quot;')}">${v.name}${String(v.lang).toLowerCase()==='pt-br'?' • BR':''}</option>`).join(''):'<option value="">Voz padrão</option>';
      if([...select.options].some(o=>o.value===current))select.value=current;
      voiceState.voice=bestVoice();
    };
    select.addEventListener('change',()=>{localStorage.setItem('rlb-ai-voice',select.value);voiceState.voice=getVoices().find(v=>v.name===select.value)||bestVoice()});
    options.insertBefore(hint,options.querySelector('.rlb-ai-disclaimer'));
    options.insertBefore(select,hint);
    fill();setTimeout(fill,300);setTimeout(fill,1200);
    if('onvoiceschanged' in speech)speech.addEventListener?.('voiceschanged',fill);
  }
  function cleanSpeechText(text){
    return String(text||'').replace(/\*\*/g,'').replace(/^[•\-]\s*/gm,'').replace(/https?:\/\/\S+/g,'').replace(/\s+/g,' ').trim();
  }
  function speechChunks(text){
    const t=cleanSpeechText(text);if(!t)return [];
    const sentences=t.match(/[^.!?;:]+[.!?;:]?|[^.!?;:]+$/g)||[t],out=[];let current='';
    for(const s0 of sentences){const s=s0.trim();if(!s)continue;if((current+' '+s).trim().length>230&&current){out.push(current.trim());current=s}else current=(current+' '+s).trim()}
    if(current)out.push(current.trim());return out;
  }
  function resetSpeakButton(){
    const b=voiceState.button;if(b){b.classList.remove('active');const sp=b.querySelector('span');if(sp)sp.textContent='Ouvir'}
    voiceState.button=null;voiceState.speaking=false;voiceState.queue=[];
    const mode=$('#rlbAiModeText');if(mode&&mode.textContent==='Lendo a resposta em voz alta')mode.textContent='Pronta para ajudar';
  }
  function stopSpeech(){if(!speech)return;try{speech.cancel()}catch{}resetSpeakButton()}
  function speakNext(){
    if(!speech||!voiceState.speaking)return;
    const part=voiceState.queue.shift();if(!part){resetSpeakButton();return}
    const u=new SpeechSynthesisUtterance(part);u.lang='pt-BR';u.rate=.94;u.pitch=1.01;u.volume=1;
    const selected=getVoices().find(v=>v.name===$('#rlbAiVoiceSelect')?.value)||voiceState.voice||bestVoice();if(selected)u.voice=selected;
    u.onend=()=>speakNext();u.onerror=()=>resetSpeakButton();
    try{speech.speak(u)}catch{resetSpeakButton()}
  }
  function startSpeech(text,button){
    if(!speech)return;stopSpeech();voiceState.queue=speechChunks(text);if(!voiceState.queue.length)return;
    voiceState.speaking=true;voiceState.button=button;button.classList.add('active');const sp=button.querySelector('span');if(sp)sp.textContent='Parar';
    const mode=$('#rlbAiModeText');if(mode)mode.textContent='Lendo a resposta em voz alta';speakNext();
  }

  function voiceBar(message,detail,error=false){
    const bar=$('#rlbAiVoiceStatus');if(!bar)return;bar.hidden=false;bar.classList.toggle('rlb-ai-voice-error',error);
    const b=bar.querySelector('b');if(b)b.textContent=message;const s=bar.querySelector('span:last-child');if(s)s.textContent=detail||'';
  }
  function setMicVisual(on){const mic=$('#rlbAiMic');if(mic)mic.dataset.listening=on?'true':'false';const mode=$('#rlbAiModeText');if(mode)mode.textContent=on?'Ouvindo você...':'Pronta para ajudar'}
  function currentTranscript(interim=''){
    const pieces=[voiceState.base,voiceState.finalText,interim].map(x=>String(x||'').trim()).filter(Boolean);return pieces.join(' ').replace(/\s+/g,' ').trim();
  }
  function createRecognition(){
    const rec=new SpeechRecognition();rec.lang='pt-BR';rec.interimResults=true;rec.continuous=true;rec.maxAlternatives=3;
    rec.onstart=()=>{setMicVisual(true);voiceBar('Ouvindo...','Pode falar normalmente e fazer pequenas pausas. Clique no microfone novamente quando terminar.')};
    rec.onresult=e=>{
      let interim='';for(let i=e.resultIndex;i<e.results.length;i++){const txt=String(e.results[i][0]?.transcript||'').trim();if(!txt)continue;if(e.results[i].isFinal){voiceState.finalText=(voiceState.finalText+' '+txt).trim()}else interim=(interim+' '+txt).trim()}
      const input=$('#rlbAiInput');if(input){input.value=currentTranscript(interim);input.focus();input.setSelectionRange(input.value.length,input.value.length)}
    };
    rec.onerror=e=>{
      const code=String(e.error||'');
      if(code==='not-allowed'||code==='service-not-allowed'){voiceState.wanted=false;voiceBar('Microfone bloqueado','Permita o acesso ao microfone nas configurações do navegador e tente novamente.',true);setMicVisual(false)}
      else if(code==='audio-capture'){voiceState.wanted=false;voiceBar('Microfone indisponível','Verifique se há um microfone conectado e se outro aplicativo não está usando o dispositivo.',true);setMicVisual(false)}
      else if(code!=='aborted'&&code!=='no-speech'){voiceBar('Não consegui entender','Continue falando ou clique no microfone para tentar novamente.',true)}
    };
    rec.onend=()=>{
      voiceState.recognition=null;
      if(voiceState.wanted){setTimeout(()=>{if(voiceState.wanted)startRecognition(false)},180)}else{setMicVisual(false);const bar=$('#rlbAiVoiceStatus');if(bar&&!bar.classList.contains('rlb-ai-voice-error'))setTimeout(()=>bar.hidden=true,700)}
    };
    return rec;
  }
  function startRecognition(reset=true){
    if(!SpeechRecognition)return;if(reset){voiceState.base=$('#rlbAiInput')?.value.trim()||'';voiceState.finalText=''}
    stopSpeech();voiceState.wanted=true;try{const rec=createRecognition();voiceState.recognition=rec;rec.start()}catch{voiceState.recognition=null;voiceState.wanted=false;voiceBar('Não foi possível iniciar o microfone','Tente novamente em alguns segundos.',true);setMicVisual(false)}
  }
  function stopRecognition(hide=true){
    voiceState.wanted=false;const rec=voiceState.recognition;voiceState.recognition=null;if(rec){try{rec.stop()}catch{}}
    setMicVisual(false);if(hide){const bar=$('#rlbAiVoiceStatus');if(bar&&!bar.classList.contains('rlb-ai-voice-error'))setTimeout(()=>bar.hidden=true,350)}
  }
  function installMic(){
    const old=$('#rlbAiMic');if(!old||old.dataset.voiceV3==='true')return;
    const mic=old.cloneNode(true);mic.dataset.voiceV3='true';old.replaceWith(mic);
    if(!SpeechRecognition){mic.disabled=true;mic.title='Reconhecimento de voz não disponível neste navegador';return}
    mic.disabled=false;mic.title='Falar com a IA RLB';mic.addEventListener('click',e=>{e.preventDefault();if(voiceState.wanted)stopRecognition();else startRecognition(true)});
  }

  document.addEventListener('click',e=>{
    const speak=e.target.closest('.rlb-ai-speak');if(speak){e.preventDefault();e.stopImmediatePropagation();const bubble=speak.closest('.rlb-ai-bubble-wrap')?.querySelector('.rlb-ai-bubble');if(voiceState.speaking&&voiceState.button===speak)stopSpeech();else startSpeech(bubble?.innerText||'',speak);return}
    if(e.target.closest('#rlbAiSend'))captureAndPatch();
    if(e.target.closest('#rlbAiLauncher,#rlbAiNew'))setTimeout(()=>{patchStatic();installMic()},40);
    if(e.target.closest('#rlbAiClose')){stopRecognition();stopSpeech()}
  },true);
  document.addEventListener('keydown',e=>{if(e.target?.id==='rlbAiInput'&&e.key==='Enter'&&!e.shiftKey)captureAndPatch()},true);
  window.addEventListener('beforeunload',()=>{stopRecognition();stopSpeech()});
  function bounded(){injectStyle();patchStatic();requestAnimationFrame(patchStatic);setTimeout(patchStatic,100);setTimeout(patchStatic,400);setTimeout(patchStatic,1000)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bounded,{once:true});else bounded();
})();
