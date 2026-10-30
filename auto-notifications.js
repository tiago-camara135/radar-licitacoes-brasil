(()=>{
  const CHECK_MS=120000;
  let timer=null;
  let running=false;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl=v=>{try{const u=new URL(v,location.origin);return ['http:','https:'].includes(u.protocol)?u.href:'#'}catch{return '#'}};
  const municipality=x=>x?.unidadeOrgao?.municipioNome||x?.unidadeOrgao?.nomeMunicipio||x?.municipioNome||'Município não informado';
  const closing=x=>x?.dataEncerramentoProposta||x?.dataFimRecebimentoProposta||null;
  const keyOf=x=>x?.numeroControlePNCP||[x?.orgaoEntidade?.cnpj,x?.anoCompra,x?.sequencialCompra,x?._modalidadeConsultada].join('-');
  const when=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})};
  const modality=x=>x?.modalidadeNome||('Modalidade '+(x?._modalidadeConsultada||'não informada'));
  const org=x=>x?.orgaoEntidade?.razaoSocial||'Órgão não informado';

  function ensurePanel(){
    const app=document.querySelector('#app');
    if(!app||document.querySelector('#auto-notifications'))return;
    const section=document.createElement('section');
    section.id='auto-notifications';
    section.innerHTML=`<div class="card auto-notify-card">
      <div class="auto-notify-head">
        <div class="auto-notify-title">
          <div class="auto-bell" aria-hidden="true">🔔<span id="autoBellCount" class="auto-bell-count">0</span></div>
          <div><h2>Notificações automáticas</h2><div id="autoNotifySub" class="auto-notify-sub">Monitorando seus alertas salvos no PNCP.</div></div>
        </div>
        <div class="auto-notify-actions">
          <span class="auto-notify-status">Monitoramento ativo</span>
          <button id="autoNotifyRefresh" class="btn">Atualizar agora</button>
        </div>
      </div>
      <div id="autoNotifyList" class="auto-notify-list"><div class="auto-notify-empty">Aguardando a primeira consulta dos seus alertas...</div></div>
      <div class="auto-notify-footer"><span>As notificações são geradas a partir dos alertas que você salvou.</span><span id="autoNotifyUpdated">—</span></div>
    </div>`;
    app.appendChild(section);
    section.querySelector('#autoNotifyRefresh')?.addEventListener('click',()=>refresh(true));
  }

  function render(items){
    const list=document.querySelector('#autoNotifyList');
    const count=document.querySelector('#autoBellCount');
    const sub=document.querySelector('#autoNotifySub');
    const updated=document.querySelector('#autoNotifyUpdated');
    if(!list)return;

    const seen=JSON.parse(localStorage.getItem('rlb_auto_seen')||'[]');
    const seenSet=new Set(seen);
    const fresh=[];
    const ordered=(items||[]).slice(0,12);

    list.innerHTML=ordered.map(m=>{
      const x=m.item||{};
      const k=(m.alert?.id||'a')+':'+keyOf(x);
      const isNew=!seenSet.has(k);
      if(isNew)fresh.push({k,m});
      const link=x.linkSistemaOrigem||x.linkProcessoEletronico||'';
      return `<article class="auto-notify-item ${isNew?'is-new':''}">
        <div class="auto-notify-icon">🔔</div>
        <div class="auto-notify-main">
          <div class="auto-notify-topline">
            ${isNew?'<span class="auto-notify-pill new">Nova</span>':''}
            <span class="auto-notify-pill modality">${esc(modality(x))}</span>
            <span class="auto-notify-pill city">${esc(municipality(x))}</span>
            <span class="auto-notify-alertname">Alerta: ${esc(m.alert?.name||'Salvo')}</span>
          </div>
          <div class="auto-notify-object">${esc(x.objetoCompra||'Objeto não informado')}</div>
          <div class="auto-notify-meta"><span>${esc(org(x))}</span><span>Publicação: ${esc(when(x.dataPublicacaoPncp))}</span>${closing(x)?`<span>Encerramento: ${esc(when(closing(x)))}</span>`:''}</div>
        </div>
        ${link?`<a class="auto-notify-link" target="_blank" rel="noopener" href="${safeUrl(link)}">Abrir licitação</a>`:''}
      </article>`;
    }).join('')||'<div class="auto-notify-empty">Nenhuma oportunidade corresponde aos seus alertas ativos neste momento. Quando surgir uma correspondência, ela aparecerá aqui automaticamente.</div>';

    count.textContent=String(fresh.length);
    sub.textContent=(items?.length||0)+' oportunidade(s) correspondente(s) aos seus alertas.';
    updated.textContent='Atualizado às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});

    const next=[...fresh.map(f=>f.k),...seen].slice(0,600);
    localStorage.setItem('rlb_auto_seen',JSON.stringify(next));

    if(fresh.length&&'Notification'in window&&Notification.permission==='granted'){
      fresh.slice(0,3).forEach(({m})=>{
        const x=m.item||{};
        new Notification('🔔 '+modality(x)+' • '+municipality(x),{body:(x.objetoCompra||'Nova oportunidade').slice(0,160)});
      });
    }
  }

  async function refresh(manual=false){
    if(running)return;
    const app=document.querySelector('#app');
    if(!app||app.classList.contains('hidden'))return;
    running=true;
    try{
      const r=await fetch('/api/alerts/feed',{headers:{accept:'application/json'}});
      if(r.status===401){stop();return}
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||'Falha ao consultar alertas');
      render(d.items||[]);
    }catch(e){
      if(manual){const list=document.querySelector('#autoNotifyList');if(list)list.innerHTML='<div class="auto-notify-empty">Não foi possível atualizar agora. Tente novamente em instantes.</div>'}
    }finally{running=false}
  }

  function start(){
    ensurePanel();
    if(timer)return;
    refresh(false);
    timer=setInterval(()=>refresh(false),CHECK_MS);
  }
  function stop(){if(timer){clearInterval(timer);timer=null}}

  function watchAuth(){
    ensurePanel();
    const app=document.querySelector('#app');
    if(!app)return;
    const sync=()=>{if(app.classList.contains('hidden'))stop();else start()};
    new MutationObserver(sync).observe(app,{attributes:true,attributeFilter:['class']});
    sync();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watchAuth);else watchAuth();
})();
