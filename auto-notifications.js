(()=>{
  const CHECK_MS=120000;
  let timer=null;
  let running=false;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const safeUrl=v=>{try{const u=new URL(v,location.origin);return ['http:','https:'].includes(u.protocol)?u.href:'#'}catch{return '#'}};
  const municipality=x=>x?.unidadeOrgao?.municipioNome||x?.unidadeOrgao?.nomeMunicipio||x?.municipioNome||'Município não informado';
  const closing=x=>x?.dataEncerramentoProposta||x?.dataFimRecebimentoProposta||null;
  const keyOf=x=>x?.numeroControlePNCP||[x?.orgaoEntidade?.cnpj,x?.anoCompra,x?.sequencialCompra,x?._modalidadeConsultada].join('-');
  const when=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})};
  const modality=x=>x?.modalidadeNome||('Modalidade '+(x?._modalidadeConsultada||'não informada'));
  const org=x=>x?.orgaoEntidade?.razaoSocial||'Órgão não informado';
  const unit=x=>x?.unidadeOrgao?.nomeUnidade||'';
  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  const linkOf=x=>x?.linkSistemaOrigem||x?.linkProcessoEletronico||'';
  function isMunicipal(x){
    const esfera=norm(x?.orgaoEntidade?.esferaId||x?.orgaoEntidade?.esfera||x?.esferaId||'');
    if(esfera==='M'||esfera==='MUNICIPAL')return true;
    const txt=norm(org(x)+' '+unit(x));
    return /\bMUNICIPIO\b|\bMUNICIPAL\b|PREFEITURA|CAMARA MUNICIPAL|FUNDO MUNICIPAL|SECRETARIA MUNICIPAL/.test(txt);
  }

  function ensurePanel(){
    const app=document.querySelector('#app');
    if(!app||document.querySelector('#auto-notifications'))return;
    const section=document.createElement('section');
    section.id='auto-notifications';
    section.innerHTML=`<div class="card auto-notify-card">
      <div class="auto-notify-head">
        <div class="auto-notify-title">
          <div class="auto-bell" aria-hidden="true">🔔<span id="autoBellCount" class="auto-bell-count">0</span></div>
          <div><h2>Central de alertas em tempo quase real</h2><div id="autoNotifySub" class="auto-notify-sub">Monitorando novas publicações municipais e seus alertas salvos no PNCP.</div></div>
        </div>
        <div class="auto-notify-actions">
          <span class="auto-notify-status">Monitoramento ativo</span>
          <button id="autoNotifyPermission" class="btn">Ativar avisos</button>
          <button id="autoNotifyRefresh" class="btn">Atualizar agora</button>
        </div>
      </div>

      <div class="auto-section-head"><div><strong>Novas licitações municipais</strong><span>Publicações recentes identificadas no PNCP.</span></div><span id="autoMunicipalCount" class="auto-section-count">0</span></div>
      <div id="autoMunicipalList" class="auto-notify-list"><div class="auto-notify-empty">Aguardando a primeira consulta de novas licitações municipais...</div></div>

      <div class="auto-section-head filtered"><div><strong>Meus alertas filtrados</strong><span>Oportunidades que correspondem aos critérios que você salvou.</span></div><span id="autoFilteredCount" class="auto-section-count">0</span></div>
      <div id="autoFilteredList" class="auto-notify-list"><div class="auto-notify-empty">Aguardando a primeira consulta dos seus alertas...</div></div>

      <div class="auto-notify-footer"><span>A atualização depende da disponibilização dos dados pelo PNCP; o Radar consulta automaticamente a cada 2 minutos.</span><span id="autoNotifyUpdated">—</span></div>
    </div>`;
    app.appendChild(section);
    section.querySelector('#autoNotifyRefresh')?.addEventListener('click',()=>refresh(true));
    section.querySelector('#autoNotifyPermission')?.addEventListener('click',requestNotifications);
  }

  function renderCard(x,{isNew=false,alertName='',source='municipal'}={}){
    const link=linkOf(x);
    const tag=alertName?`<span class="auto-notify-alertname">Alerta: ${esc(alertName)}</span>`:'';
    const inner=`
      <div class="auto-notify-icon">🔔</div>
      <div class="auto-notify-main">
        <div class="auto-notify-topline">
          ${isNew?'<span class="auto-notify-pill new">Nova</span>':''}
          <span class="auto-notify-pill modality">${esc(modality(x))}</span>
          <span class="auto-notify-pill city">${esc(municipality(x))}</span>
          ${tag}
        </div>
        <div class="auto-notify-object">${esc(x.objetoCompra||'Objeto não informado')}</div>
        <div class="auto-notify-meta"><span>${esc(org(x))}</span><span>Publicação: ${esc(when(x.dataPublicacaoPncp))}</span>${closing(x)?`<span>Encerramento: ${esc(when(closing(x)))}</span>`:''}</div>
      </div>
      <div class="auto-notify-open">Abrir licitação <span>↗</span></div>`;
    if(link)return `<a class="auto-notify-item auto-notify-clickable ${isNew?'is-new':''}" data-source="${source}" target="_blank" rel="noopener" href="${safeUrl(link)}" title="Abrir esta licitação">${inner}</a>`;
    return `<article class="auto-notify-item ${isNew?'is-new':''}" data-source="${source}">${inner}</article>`;
  }

  function seenState(key){
    try{return JSON.parse(localStorage.getItem(key)||'[]')}catch{return[]}
  }
  function saveSeen(key,values){localStorage.setItem(key,JSON.stringify(values.slice(0,1200)))}

  function renderMunicipal(items){
    const list=document.querySelector('#autoMunicipalList');
    const badge=document.querySelector('#autoMunicipalCount');
    if(!list)return {fresh:[]};
    const municipal=(items||[]).filter(isMunicipal).slice(0,20);
    const seen=seenState('rlb_municipal_seen');
    const seenSet=new Set(seen);
    const fresh=[];
    list.innerHTML=municipal.map(x=>{
      const k=keyOf(x); const isNew=!seenSet.has(k); if(isNew)fresh.push({k,x});
      return renderCard(x,{isNew,source:'municipal'});
    }).join('')||'<div class="auto-notify-empty">Nenhuma nova licitação municipal foi encontrada na consulta mais recente.</div>';
    badge.textContent=String(municipal.length);
    saveSeen('rlb_municipal_seen',[...fresh.map(f=>f.k),...seen]);
    return {fresh};
  }

  function renderFiltered(items){
    const list=document.querySelector('#autoFilteredList');
    const badge=document.querySelector('#autoFilteredCount');
    if(!list)return {fresh:[]};
    const ordered=(items||[]).slice(0,12);
    const seen=seenState('rlb_auto_seen');
    const seenSet=new Set(seen);
    const fresh=[];
    list.innerHTML=ordered.map(m=>{
      const x=m.item||{}; const k=(m.alert?.id||'a')+':'+keyOf(x); const isNew=!seenSet.has(k); if(isNew)fresh.push({k,m});
      return renderCard(x,{isNew,alertName:m.alert?.name||'Salvo',source:'filtered'});
    }).join('')||'<div class="auto-notify-empty">Nenhuma oportunidade corresponde aos seus alertas ativos neste momento.</div>';
    badge.textContent=String(ordered.length);
    saveSeen('rlb_auto_seen',[...fresh.map(f=>f.k),...seen]);
    return {fresh};
  }

  function notify(municipalFresh,filteredFresh){
    const count=document.querySelector('#autoBellCount');
    const sub=document.querySelector('#autoNotifySub');
    const total=municipalFresh.length+filteredFresh.length;
    if(count)count.textContent=String(total);
    if(sub)sub.textContent=total?`${total} nova(s) oportunidade(s) detectada(s) nesta atualização.`:'Monitorando novas publicações municipais e seus alertas salvos no PNCP.';
    if(!('Notification'in window)||Notification.permission!=='granted'||!total)return;
    municipalFresh.slice(0,3).forEach(({x})=>new Notification('🔔 '+modality(x)+' • '+municipality(x),{body:(x.objetoCompra||'Nova licitação municipal').slice(0,170)}));
    filteredFresh.slice(0,2).forEach(({m})=>{const x=m.item||{};new Notification('🔔 Alerta: '+(m.alert?.name||modality(x)),{body:(municipality(x)+' • '+(x.objetoCompra||'Nova oportunidade')).slice(0,170)})});
  }

  async function requestNotifications(){
    const btn=document.querySelector('#autoNotifyPermission');
    if(!('Notification'in window)){if(btn)btn.textContent='Não suportado';return}
    const p=await Notification.requestPermission();
    if(btn)btn.textContent=p==='granted'?'Avisos ativados':'Ativar avisos';
  }

  async function refresh(manual=false){
    if(running)return;
    const app=document.querySelector('#app');
    if(!app||app.classList.contains('hidden'))return;
    running=true;
    try{
      const [allRes,alertRes]=await Promise.all([
        fetch('/api/licitacoes?days=1&order=newest',{headers:{accept:'application/json'}}),
        fetch('/api/alerts/feed',{headers:{accept:'application/json'}})
      ]);
      if(allRes.status===401||alertRes.status===401){stop();return}
      const [allData,alertData]=await Promise.all([allRes.json().catch(()=>({})),alertRes.json().catch(()=>({}))]);
      if(!allRes.ok)throw new Error(allData.error||'Falha ao consultar novas licitações');
      if(!alertRes.ok)throw new Error(alertData.error||'Falha ao consultar alertas');
      const a=renderMunicipal(allData.items||[]);
      const b=renderFiltered(alertData.items||[]);
      notify(a.fresh,b.fresh);
      const updated=document.querySelector('#autoNotifyUpdated');
      if(updated)updated.textContent='Atualizado às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    }catch(e){
      if(manual){
        const list=document.querySelector('#autoMunicipalList');
        if(list)list.innerHTML='<div class="auto-notify-empty">Não foi possível atualizar agora. Tente novamente em instantes.</div>';
      }
    }finally{running=false}
  }

  function start(){ensurePanel();if(timer)return;refresh(false);timer=setInterval(()=>refresh(false),CHECK_MS)}
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
