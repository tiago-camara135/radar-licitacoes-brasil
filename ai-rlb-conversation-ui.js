(()=>{
  const $=s=>document.querySelector(s);
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[!?.,;:]+/g,' ').replace(/\s+/g,' ').trim();
  function isSmallTalk(text){
    const q=norm(text);
    return /^(oi|ola|opa|hey|hello|e ai|bom dia|boa tarde|boa noite)( tudo bem| como vai| tudo certo)?$/.test(q)||
      /^(tudo bem|como vai|como voce esta|ta tudo bem|obrigado|obrigada|valeu|agradeco|muito obrigado|muito obrigada|perfeito|show|beleza|entendi|certo|otimo|tchau|ate mais|ate logo|falou)$/.test(q)||
      /(quem e voce|o que voce faz|como voce pode me ajudar|para que voce serve)/.test(q);
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
    if(social)queueMicrotask(()=>patchWorking(true));
  }
  document.addEventListener('click',e=>{if(e.target.closest('#rlbAiSend'))captureAndPatch()},true);
  document.addEventListener('keydown',e=>{if(e.target?.id==='rlbAiInput'&&e.key==='Enter'&&!e.shiftKey)captureAndPatch()},true);
  function bounded(){patchStatic();requestAnimationFrame(patchStatic);setTimeout(patchStatic,100);setTimeout(patchStatic,400)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bounded,{once:true});else bounded();
  document.addEventListener('click',e=>{if(e.target.closest('#rlbAiLauncher,#rlbAiNew'))setTimeout(patchStatic,40)},true);
})();
