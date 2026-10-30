(()=>{
  const nativeFetch=window.fetch.bind(window);
  let last={provider:null,model:null,mode:null};
  function ensureBadge(){
    const title=document.querySelector('.rlb-ai-title');if(!title)return null;
    let b=document.getElementById('rlbAiProviderBadge');
    if(!b){b=document.createElement('span');b.id='rlbAiProviderBadge';b.style.cssText='display:inline-flex;align-items:center;gap:5px;margin-top:3px;font-size:8px;font-weight:800;letter-spacing:.02em;color:var(--rlb3-muted,#90a8b5)';title.appendChild(b)}
    return b;
  }
  function label(){
    if(last.mode==='gemini_unavailable')return '● Gemini indisponível';
    if(last.provider==='gemini')return `● Gemini • ${String(last.model||'').replace(/^gemini-/,'')}`;
    if(last.provider==='groq')return `● Groq • ${last.model||''}`;
    if(last.mode)return '● Modo local';
    return '● Aguardando resposta';
  }
  function render(){
    const b=ensureBadge();if(!b)return;
    b.textContent=label();
    if(last.mode==='gemini_unavailable'){
      b.style.color='#f0b84a';
      b.title='O Radar tentou os modelos Gemini configurados, mas nenhum respondeu nesta tentativa.';
    }else if(last.provider){
      b.style.color='#2bd99f';
      b.title='Esta resposta foi gerada pelo modelo externo indicado.';
    }else{
      b.style.color='var(--rlb3-muted,#90a8b5)';
      b.title='A última resposta usou o motor local de contingência.';
    }
  }
  window.fetch=async function(input,init){
    const r=await nativeFetch(input,init);
    try{
      const url=typeof input==='string'?input:input?.url||'';
      if(String(url).includes('/api/ai-rlb/chat')&&r.ok){
        const d=await r.clone().json();
        last={provider:d.provider||null,model:d.model||null,mode:d.mode||null};
        queueMicrotask(render);
      }
    }catch{}
    return r;
  };
  document.addEventListener('click',e=>{if(e.target.closest('#rlbAiLauncher'))setTimeout(render,80)},true);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});else render();
})();
