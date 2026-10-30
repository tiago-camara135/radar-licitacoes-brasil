(()=>{
  'use strict';
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const POLL_MS=240000;
  let currentUser=null;
  let regionalTimer=null;
  let regionalBusy=false;
  let lastPollAt=0;

  function isAuthenticated(){
    const auth=$('#auth'),app=$('#app');
    return Boolean(auth&&app&&(auth.classList.contains('hidden')||auth.hidden||getComputedStyle(auth).display==='none')&&!app.classList.contains('hidden')&&!app.hidden);
  }

  function quickKey(button){
    if(!button||button.id==='rlbHeroChambers')return null;
    const t=norm(button.textContent);
    if(button.id==='searchChambersBrazil'||t.startsWith('camaras municipais'))return 'chambers';
    if(t==='pregao eletronico')return 'pregao';
    if(t==='dispensas'||t==='dispensa')return 'dispensas';
    if(t==='concorrencias'||t==='concorrencia')return 'concorrencias';
    if(t==='publicadas hoje')return 'today';
    if(t==='propostas abertas')return 'open';
    return null;
  }

  function quickButtons(){
    const view=$('#view-radar');
    if(!view)return [];
    return $$('button',view).filter(b=>quickKey(b));
  }

  function decorateQuickButtons(){
    for(const button of quickButtons()){
      const key=quickKey(button);
      button.dataset.rlbQuick=key;
      button.classList.add('rlb-quick-choice');
      if(!button.hasAttribute('aria-pressed'))button.setAttribute('aria-pressed','false');
      button.classList.toggle('rlb-quick-active',button.getAttribute('aria-pressed')==='true');
      if(!button.title)button.title='Executar busca rápida: '+button.textContent.trim();
    }
    // Remove the old fixed visual state from Câmaras Municipais on every install pass.
    const chamber=$('[data-rlb-quick="chambers"]');
    if(chamber&&chamber.getAttribute('aria-pressed')!=='true'){
      chamber.classList.remove('active','selected','is-active','rlb-quick-active');
      chamber.setAttribute('aria-pressed','false');
    }
  }

  function setQuickActive(active){
    for(const button of quickButtons()){
      const yes=quickKey(button)===active;
      button.setAttribute('aria-pressed',yes?'true':'false');
      button.classList.toggle('rlb-quick-active',yes);
      if(!yes)button.classList.remove('active','selected','is-active');
    }
  }

  function setValue(id,value){const el=$(id);if(el)el.value=value}
  function ensureConcurrencyOption(){
    const modal=$('#modal');if(!modal)return;
    if(!modal.querySelector('option[value="4,5"]')){
      const option=document.createElement('option');
      option.value='4,5';option.textContent='Concorrências - todas';option.dataset.rlbQuickOnly='1';
      modal.appendChild(option);
    }
  }

  function resetForQuickSearch(){
    // Keep geographic context because users commonly choose a UF/municipality first,
    // then use a quick category. Remove stale hidden filters that could cause false zero results.
    for(const id of ['#q','#org','#cnpj','#minValue','#maxValue'])setValue(id,'');
    setValue('#modal','');
    setValue('#days','7');
    setValue('#openOnly','false');
    setValue('#order','newest');
    setValue('#orgType','all');
    setValue('#sourceScope','all');
  }

  function applyQuickPreset(key){
    ensureConcurrencyOption();
    resetForQuickSearch();
    if(key==='pregao')setValue('#modal','6');
    else if(key==='dispensas')setValue('#modal','8');
    else if(key==='concorrencias')setValue('#modal','4,5');
    else if(key==='today')setValue('#days','1');
    else if(key==='open'){
      setValue('#days','30');
      setValue('#openOnly','true');
      setValue('#order','deadline');
    }else if(key==='chambers'){
      setValue('#orgType','chambers');
      setValue('#sourceScope','all');
    }
  }

  function runQuick(button,key){
    applyQuickPreset(key);
    setQuickActive(key);
    const search=$('#search');
    if(search&&!search.disabled)setTimeout(()=>search.click(),0);
  }

  function installQuickSearch(){
    decorateQuickButtons();
    document.addEventListener('click',e=>{
      const button=e.target.closest('button');
      const key=quickKey(button);
      if(key){
        e.preventDefault();
        e.stopImmediatePropagation();
        runQuick(button,key);
        return;
      }
      if(e.target.closest('#clearFilters'))setTimeout(()=>setQuickActive(null),0);
    },true);

    const manual='#q,#uf,#municipality,#municipalityIbge,#modal,#org,#cnpj,#days,#minValue,#maxValue,#openOnly,#order,#orgType,#sourceScope';
    document.addEventListener('input',e=>{if(e.target.matches?.(manual))setQuickActive(null)},true);
    document.addEventListener('change',e=>{if(e.target.matches?.(manual))setQuickActive(null)},true);

    const observer=new MutationObserver(()=>decorateQuickButtons());
    const view=$('#view-radar');if(view)observer.observe(view,{childList:true,subtree:true});
    [0,250,800,1800,4000].forEach(ms=>setTimeout(decorateQuickButtons,ms));
  }

  async function api(path){
    const r=await fetch(path,{credentials:'same-origin',headers:{accept:'application/json'},cache:'no-store'});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||'Falha temporária.');
    return d;
  }

  function itemKey(x){return String(x?.numeroControlePNCP||[x?.orgaoEntidade?.cnpj,x?.anoCompra,x?.sequencialCompra,x?._modalidadeConsultada].join('-'))}
  function itemUf(x){return String(x?.unidadeOrgao?.ufSigla||x?.ufSigla||'').toUpperCase()}
  function itemDetected(x){const t=Date.parse(x?._detectedAt||x?.dataPublicacaoPncp||'');return Number.isFinite(t)?t:0}
  function officialUrl(x){
    const v=window.RLBVerifiedPNCP?.officialUrl?.(x)||x?._pncpUrl||'';
    try{const u=new URL(v);return /^https?:$/.test(u.protocol)?u.href:''}catch{return''}
  }

  function toastStack(){
    let stack=$('#rlbRegionalToastStack');
    if(!stack){stack=document.createElement('div');stack.id='rlbRegionalToastStack';stack.className='rlb-regional-toast-stack';stack.setAttribute('aria-live','polite');stack.setAttribute('aria-atomic','false');document.body.appendChild(stack)}
    return stack;
  }
  function showToast({kicker,title,text,url,summary=false}){
    const stack=toastStack();
    const card=document.createElement('article');
    card.className='rlb-regional-toast'+(summary?' summary':'');
    card.innerHTML=`<button type="button" aria-label="Fechar notificação">×</button><div class="rlb-toast-kicker">${esc(kicker)}</div><strong>${esc(title)}</strong><p>${esc(text)}</p>${url?`<a href="${esc(url)}" target="_blank" rel="noopener">Abrir oportunidade ↗</a>`:''}`;
    card.querySelector('button')?.addEventListener('click',()=>card.remove());
    stack.prepend(card);
    while(stack.children.length>4)stack.lastElementChild?.remove();
    setTimeout(()=>card.remove(),20000);
  }

  async function preferredUfs(){
    const set=new Set();
    const selected=String($('#uf')?.value||'').toUpperCase();
    if(/^[A-Z]{2}$/.test(selected))set.add(selected);
    try{
      const alerts=await api('/api/alerts');
      for(const a of alerts.items||[]){const uf=String(a?.uf||'').toUpperCase();if(a?.enabled&&/^[A-Z]{2}$/.test(uf))set.add(uf)}
    }catch{}
    return set;
  }

  async function ensureUser(){
    if(currentUser)return currentUser;
    try{const d=await api('/api/me');currentUser=d.user||null;return currentUser}catch{return null}
  }

  async function pollRegionalNotifications({baseline=false}={}){
    if(regionalBusy||!isAuthenticated())return;
    regionalBusy=true;
    try{
      const user=await ensureUser();if(!user)return;
      const ufs=await preferredUfs();
      const feed=await api('/api/live-feed?limit=100');
      const items=Array.isArray(feed.items)?feed.items:[];
      const storageKey=`rlb-regional-last-${user.id}`;
      const now=Date.now();
      const last=Number(localStorage.getItem(storageKey)||0);
      if(!last||baseline){localStorage.setItem(storageKey,String(now));lastPollAt=now;return}
      const fresh=items.filter(x=>itemDetected(x)>last&&(ufs.size===0||ufs.has(itemUf(x))));
      fresh.sort((a,b)=>itemDetected(b)-itemDetected(a));
      const unique=[];const seen=new Set();
      for(const x of fresh){const k=itemKey(x);if(!k||seen.has(k))continue;seen.add(k);unique.push(x)}
      for(const x of unique.slice(0,3)){
        const uf=itemUf(x)||'Brasil';
        const modality=String(x?.modalidadeNome||'Nova licitação');
        const object=String(x?.objetoCompra||'Nova oportunidade publicada no Radar.').slice(0,165);
        const org=String(x?.orgaoEntidade?.razaoSocial||'Órgão público').slice(0,100);
        showToast({kicker:`Nova oportunidade • ${uf}`,title:modality,text:`${org} — ${object}`,url:officialUrl(x)});
      }
      if(unique.length>3){
        const scope=ufs.size?[...ufs].join(', '):'Brasil';
        showToast({kicker:'Radar atualizado',title:`+${unique.length-3} novas oportunidades`,text:`Há outras licitações novas nas regiões monitoradas (${scope}), independentemente da modalidade.`,summary:true});
      }
      localStorage.setItem(storageKey,String(now));
      lastPollAt=now;
    }catch(e){
      console.warn('regional notification poll:',e?.message||e);
    }finally{regionalBusy=false}
  }

  function startRegionalNotifications(){
    if(regionalTimer)clearInterval(regionalTimer);
    setTimeout(()=>pollRegionalNotifications({baseline:true}),12000);
    regionalTimer=setInterval(()=>pollRegionalNotifications(),POLL_MS);
    window.addEventListener('focus',()=>{if(Date.now()-lastPollAt>90000)pollRegionalNotifications()});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-lastPollAt>90000)pollRegionalNotifications()});
  }

  function install(){
    installQuickSearch();
    startRegionalNotifications();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
