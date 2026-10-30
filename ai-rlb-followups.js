(()=>{
  const $=s=>document.querySelector(s);
  const originalFetch=window.fetch.bind(window);

  function style(){
    if($('#rlb-ai-followup-style'))return;
    const st=document.createElement('style');st.id='rlb-ai-followup-style';st.textContent=`
      .rlb-ai-followups{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 2px 42px;animation:rlbFollowupIn .22s ease-out}
      .rlb-ai-followup{border:1px solid var(--rlb3-border,#29495a);background:var(--rlb3-surface-soft,#102837);color:var(--rlb3-text,#e9f3f7);border-radius:999px;padding:7px 10px;font-size:9px;font-weight:800;cursor:pointer;transition:.16s ease}
      .rlb-ai-followup:hover{border-color:#19c58b;transform:translateY(-1px);box-shadow:0 5px 14px rgba(20,190,139,.12)}
      .rlb-ai-followup:active{transform:translateY(0)}
      @keyframes rlbFollowupIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
      @media(max-width:600px){.rlb-ai-followups{margin-left:34px}.rlb-ai-followup{font-size:8.5px;padding:6px 9px}}
    `;document.head.appendChild(st);
  }
  function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function removeOld(){document.querySelectorAll('.rlb-ai-followups').forEach(x=>x.remove())}
  function add(items){
    const arr=[...new Set((items||[]).map(x=>String(x||'').trim()).filter(Boolean))].slice(0,4);if(!arr.length)return;
    const box=$('#rlbAiMessages');if(!box)return;removeOld();
    const wrap=document.createElement('div');wrap.className='rlb-ai-followups';wrap.setAttribute('aria-label','Sugestões de continuação');
    wrap.innerHTML=arr.map(x=>`<button type="button" class="rlb-ai-followup" data-followup="${esc(x)}">${esc(x)}</button>`).join('');
    box.appendChild(wrap);box.scrollTop=box.scrollHeight;
  }
  document.addEventListener('click',e=>{
    const b=e.target.closest('.rlb-ai-followup');if(!b)return;
    const input=$('#rlbAiInput');if(!input)return;
    input.value=b.dataset.followup||b.textContent||'';removeOld();input.focus();
    setTimeout(()=>$('#rlbAiSend')?.click(),40);
  },true);
  window.fetch=async function(input,init){
    const response=await originalFetch(input,init);
    try{
      const url=typeof input==='string'?input:input?.url||'';
      if(String(url).includes('/api/ai-rlb/chat')&&response.ok){
        const data=await response.clone().json();
        if(Array.isArray(data?.suggestions))setTimeout(()=>add(data.suggestions),90);
      }
    }catch{}
    return response;
  };
  style();
})();
