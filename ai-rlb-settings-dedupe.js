(()=>{
  const SELECTOR='.rlb-ai-head-actions';
  function clean(){
    const head=document.querySelector(SELECTOR);if(!head)return;
    const all=[...head.querySelectorAll('button')];
    const settings=all.filter(b=>b.id==='rlbFreeAiBtn'||String(b.title||'').toLowerCase().includes('configurar')||String(b.textContent||'').trim()==='⚙');
    let keep=settings.find(b=>b.id==='rlbFreeAiBtn')||settings[0]||null;
    if(keep){
      if(!keep.id)keep.id='rlbFreeAiBtn';
      keep.title='Configurar IA RLB';
      settings.forEach(b=>{if(b!==keep)b.remove()});
    }
  }
  function bounded(){clean();requestAnimationFrame(clean);setTimeout(clean,80);setTimeout(clean,220);setTimeout(clean,800);setTimeout(clean,1400)}
  document.addEventListener('click',e=>{if(e.target.closest('#rlbAiLauncher,#rlbAiNew'))setTimeout(bounded,40)},true);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bounded,{once:true});else bounded();
})();