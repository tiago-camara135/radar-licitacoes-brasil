(()=>{
  const $=s=>document.querySelector(s);
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition||null;
  const micState={recognition:null,wanted:false,starting:false,base:'',finalText:''};

  function bar(message,detail,error=false){
    const el=$('#rlbAiVoiceStatus');if(!el)return;
    el.hidden=false;el.classList.toggle('rlb-ai-voice-error',error);
    const b=el.querySelector('b');if(b)b.textContent=message;
    const s=el.querySelector('span:last-child');if(s)s.textContent=detail||'';
  }
  function visual(on){
    const mic=$('#rlbAiMic');if(mic)mic.dataset.listening=on?'true':'false';
    const mode=$('#rlbAiModeText');if(mode)mode.textContent=on?'Ouvindo você...':'Pronta para ajudar';
  }
  function transcript(interim=''){
    return [micState.base,micState.finalText,interim].map(x=>String(x||'').trim()).filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
  }
  function stop(hide=true){
    micState.wanted=false;micState.starting=false;
    const rec=micState.recognition;micState.recognition=null;
    if(rec){try{rec.stop()}catch{}}
    visual(false);
    if(hide){const el=$('#rlbAiVoiceStatus');if(el&&!el.classList.contains('rlb-ai-voice-error'))setTimeout(()=>{if(!micState.wanted)el.hidden=true},350)}
  }
  async function requestMicrophone(){
    if(!window.isSecureContext)return {ok:false,kind:'insecure'};
    if(!navigator.mediaDevices?.getUserMedia)return {ok:false,kind:'unsupported'};
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      for(const track of stream.getTracks())track.stop();
      return {ok:true};
    }catch(e){
      const name=String(e?.name||'');
      if(name==='NotAllowedError'||name==='SecurityError')return {ok:false,kind:'denied'};
      if(name==='NotFoundError'||name==='DevicesNotFoundError')return {ok:false,kind:'missing'};
      if(name==='NotReadableError'||name==='TrackStartError')return {ok:false,kind:'busy'};
      return {ok:false,kind:'error'};
    }
  }
  function permissionHelp(kind){
    if(kind==='denied')bar('Microfone bloqueado','Clique no cadeado ao lado do endereço do site → Microfone → Permitir. Depois clique novamente no microfone da IA RLB.',true);
    else if(kind==='missing')bar('Microfone não encontrado','Conecte ou ative um microfone no dispositivo e tente novamente.',true);
    else if(kind==='busy')bar('Microfone em uso','Feche outro aplicativo que esteja usando o microfone e tente novamente.',true);
    else if(kind==='insecure')bar('Microfone indisponível','O navegador só libera o microfone em conexão segura HTTPS.',true);
    else if(kind==='unsupported')bar('Microfone não suportado','Este navegador não oferece acesso compatível ao microfone. Use Chrome ou Edge atualizado.',true);
    else bar('Não consegui acessar o microfone','Verifique a permissão do site e tente novamente.',true);
  }
  function createRecognition(){
    const rec=new SpeechRecognition();
    rec.lang='pt-BR';rec.interimResults=true;rec.continuous=true;rec.maxAlternatives=3;
    rec.onstart=()=>{visual(true);bar('Ouvindo...','Fale normalmente. Pode fazer pequenas pausas e clique no microfone novamente quando terminar.',false)};
    rec.onresult=e=>{
      let interim='';
      for(let i=e.resultIndex;i<e.results.length;i++){
        const txt=String(e.results[i][0]?.transcript||'').trim();if(!txt)continue;
        if(e.results[i].isFinal)micState.finalText=(micState.finalText+' '+txt).trim();else interim=(interim+' '+txt).trim();
      }
      const input=$('#rlbAiInput');if(input){input.value=transcript(interim);input.focus();input.setSelectionRange(input.value.length,input.value.length)}
    };
    rec.onerror=e=>{
      const code=String(e.error||'');
      if(code==='not-allowed'||code==='service-not-allowed'){micState.wanted=false;permissionHelp('denied');visual(false)}
      else if(code==='audio-capture'){micState.wanted=false;permissionHelp('missing');visual(false)}
      else if(code!=='aborted'&&code!=='no-speech')bar('Não consegui entender','Continue falando ou clique no microfone e tente novamente.',true);
    };
    rec.onend=()=>{
      micState.recognition=null;
      if(micState.wanted)setTimeout(()=>{if(micState.wanted)beginRecognition(false)},220);
      else visual(false);
    };
    return rec;
  }
  function beginRecognition(reset=true){
    if(!SpeechRecognition)return permissionHelp('unsupported');
    if(reset){micState.base=$('#rlbAiInput')?.value.trim()||'';micState.finalText=''}
    micState.wanted=true;
    try{const rec=createRecognition();micState.recognition=rec;rec.start()}
    catch{micState.recognition=null;micState.wanted=false;bar('Não foi possível iniciar o microfone','Tente novamente em alguns segundos.',true);visual(false)}
  }
  async function start(){
    if(micState.starting||micState.wanted)return;
    micState.starting=true;bar('Solicitando acesso ao microfone...','Se o navegador perguntar, escolha Permitir.',false);
    const permission=await requestMicrophone();micState.starting=false;
    if(!permission.ok){permissionHelp(permission.kind);return}
    beginRecognition(true);
  }
  function install(){
    const old=$('#rlbAiMic');if(!old||old.dataset.micPermissionV4==='true')return;
    const mic=old.cloneNode(true);mic.dataset.micPermissionV4='true';mic.dataset.voiceV3='true';old.replaceWith(mic);
    if(!SpeechRecognition||!navigator.mediaDevices?.getUserMedia){mic.disabled=true;mic.title='Microfone indisponível neste navegador';return}
    mic.disabled=false;mic.title='Falar com a IA RLB';
    mic.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();if(micState.wanted||micState.starting)stop();else start()});
  }
  function bounded(){install();requestAnimationFrame(install);setTimeout(install,80);setTimeout(install,350);setTimeout(install,1000)}
  document.addEventListener('click',e=>{
    if(e.target.closest('#rlbAiLauncher,#rlbAiNew'))setTimeout(bounded,40);
    if(e.target.closest('#rlbAiSend,#rlbAiClose,#logout'))stop(false);
  },true);
  document.addEventListener('keydown',e=>{if(e.target?.id==='rlbAiInput'&&e.key==='Enter'&&!e.shiftKey)stop(false)},true);
  window.addEventListener('beforeunload',()=>stop(false));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bounded,{once:true});else bounded();
})();
