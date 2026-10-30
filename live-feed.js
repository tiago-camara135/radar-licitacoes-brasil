(()=>{
  let source=null;
  let items=[];
  let started=false;
  let reconnectTimer=null;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl=v=>{try{const u=new URL(String(v||''),location.origin);return ['http:','https:'].includes(u.protocol)?u.href:'#'}catch{return'#'}};
  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  const key=x=>x?.numeroControlePNCP||[x?.orgaoEntidade?.cnpj,x?.anoCompra,x?.sequencialCompra,x?._modalidadeConsultada].join('-');
  const municipality=x=>x?.unidadeOrgao?.municipioNome||x?.unidadeOrgao?.nomeMunicipio||x?.municipioNome||'Município não informado';
  const uf=x=>x?.unidadeOrgao?.ufSigla||x?.ufSigla||'';
  const org=x=>x?.orgaoEntidade?.razaoSocial||'Órgão não informado';
  const modality=x=>x?.modalidadeNome||('Modalidade '+(x?._modalidadeConsultada||'não informada'));
  const link=x=>x?._pncpUrl||x?.linkSistemaOrigem||x?.linkProcessoEletronico||'';
  const detected=x=>x?._detectedAt||x?.dataPublicacaoPncp||null;
  const when=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})};

  function isMunicipal(x){
    const sphere=norm(x?.orgaoEntidade?.esferaId||x?.orgaoEntidade?.esfera||x?.esferaId||'');
    if(sphere==='M'||sphere==='MUNICIPAL')return true;
    const t=norm(org(x)+' '+(x?.unidadeOrgao?.nomeUnidade||''));
    return /MUNICIPIO|MUNICIPAL|PREFEITURA|CAMARA MUNICIPAL|FUNDO MUNICIPAL|SECRETARIA MUNICIPAL/.test(t);
  }
  function isChamber(x){
    const power=norm(x?.orgaoEntidade?.poderId||'');
    const sphere=norm(x?.orgaoEntidade?.esferaId||'');
    if(power==='L'&&sphere==='M')return true;
    const t=norm(org(x)+' '+(x?.unidadeOrgao?.nomeUnidade||''));
    return /CAMARA MUNICIPAL|CAMARA DE VEREADORES|PODER LEGISLATIVO MUNICIPAL/.test(t);
  }

  function addStyle(){
    if(document.querySelector('#rlb-live-style'))return;
    const s=document.createElement('style');
    s.id='rlb-live-style';
    s.textContent=`
      .rlb-live-card{margin-bottom:14px;border:1px solid #cfe6d9;background:linear-gradient(180deg,#ffffff,#fbfffc);box-shadow:0 10px 28px rgba(0,120,65,.06)}
      .rlb-live-head{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}
      .rlb-live-title{display:flex;gap:10px;align-items:center}.rlb-live-title h2{margin:0;font-size:18px}.rlb-live-dot{width:10px;height:10px;border-radius:50%;background:#13a65b;box-shadow:0 0 0 5px rgba(19,166,91,.12);animation:rlbPulse 1.7s infinite}
      @keyframes rlbPulse{50%{box-shadow:0 0 0 9px rgba(19,166,91,0)}}
      .rlb-live-status{font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;padding:6px 9px;border-radius:999px;background:#e9f8ef;color:#087442;border:1px solid #caead6}
      .rlb-live-status.warn{background:#fff6df;color:#7b5c08;border-color:#eddcae}.rlb-live-status.off{background:#fff0f3;color:#a13a4d;border-color:#edcad1}
      .rlb-live-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.rlb-live-toolbar select{width:auto;min-width:190px;min-height:36px;padding:7px 9px;font-size:11px}
      .rlb-live-meta{margin-top:5px;font-size:11px;color:#6c8294}
      .rlb-live-list{display:grid;gap:8px;margin-top:12px;max-height:380px;overflow:auto;padding-right:2px}
      .rlb-live-item{display:grid;grid-template-columns:8px 1fr auto;gap:10px;align-items:center;padding:11px 12px;border:1px solid #dde9e2;border-radius:11px;background:#fff;color:inherit;text-decoration:none!important;transition:.15s ease}
      .rlb-live-item:hover{border-color:#9fd0b4;box-shadow:0 6px 18px rgba(0,112,60,.07);transform:translateY(-1px)}
      .rlb-live-item .bar{width:8px;height:100%;min-height:54px;border-radius:8px;background:linear-gradient(180deg,#00a857,#f4d719)}
      .rlb-live-tags{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:5px}.rlb-live-tag{font-size:9px;font-weight:850;padding:4px 6px;border-radius:999px;background:#edf5fb;color:#355f7e}.rlb-live-tag.city{background:#edf8f1;color:#087a47}.rlb-live-tag.chamber{background:#fff6d7;color:#725700}
      .rlb-live-object{font-size:12px;font-weight:800;color:#173b55;line-height:1.35}.rlb-live-org{margin-top:4px;font-size:10px;color:#718597}
      .rlb-live-open{font-size:10px;font-weight:900;color:#087a47;white-space:nowrap}
      .rlb-live-empty{padding:16px;text-align:center;border:1px dashed #cddfd5;border-radius:10px;color:#73899a;background:#fbfefc;font-size:11px}
      .rlb-live-toast{position:fixed;right:18px;top:86px;z-index:9999;width:min(330px,calc(100vw - 24px));padding:12px;border-radius:14px;background:#fff;border:1px solid #b9ddc8;box-shadow:0 18px 44px rgba(17,54,39,.18);transform:translateY(-16px);opacity:0;pointer-events:none;transition:.22s ease}
      .rlb-live-toast.show{transform:translateY(0);opacity:1;pointer-events:auto}.rlb-live-toast b{display:block;font-size:12px;color:#0a7042;margin-bottom:4px}.rlb-live-toast span{display:block;font-size:10px;color:#6b8191;line-height:1.4}.rlb-live-toast a{display:inline-block;margin-top:8px;font-size:10px;font-weight:900;color:#087a47}
      @media(max-width:760px){.rlb-live-item{grid-template-columns:6px 1fr}.rlb-live-open{grid-column:2}.rlb-live-toolbar{width:100%}.rlb-live-toolbar select{width:100%}.rlb-live-toast{right:12px;top:70px}}
    `;
    document.head.appendChild(s);
  }

  function ensureUI(){
    const view=document.querySelector('#view-radar');
    if(!view||document.querySelector('#rlbLiveFeed'))return false;
    const stats=view.querySelector('.stats');
    const card=document.createElement('div');
    card.id='rlbLiveFeed';
    card.className='card rlb-live-card';
    card.innerHTML=`
      <div class="rlb-live-head">
        <div class="rlb-live-title"><span class="rlb-live-dot"></span><div><h2>Feed ao Vivo</h2><div class="rlb-live-meta" id="rlbLiveMeta">Conectando ao monitor do servidor...</div></div></div>
        <div class="rlb-live-toolbar"><select id="rlbLiveScope"><option value="all">Todas as novas licitações</option><option value="municipal">Somente municipais</option><option value="chambers">Somente Câmaras Municipais</option></select><span id="rlbLiveStatus" class="rlb-live-status warn">Conectando</span></div>
      </div>
      <div id="rlbLiveList" class="rlb-live-list"><div class="rlb-live-empty">Preparando monitoramento contínuo...</div></div>`;
    if(stats)stats.insertAdjacentElement('afterend',card);else view.prepend(card);
    card.querySelector('#rlbLiveScope')?.addEventListener('change',render);

    const toast=document.createElement('div');
    toast.id='rlbLiveToast';
    toast.className='rlb-live-toast';
    document.body.appendChild(toast);
    return true;
  }

  function filtered(){
    const scope=document.querySelector('#rlbLiveScope')?.value||'all';
    if(scope==='municipal')return items.filter(isMunicipal);
    if(scope==='chambers')return items.filter(isChamber);
    return items;
  }

  function render(){
    const list=document.querySelector('#rlbLiveList');
    if(!list)return;
    const data=filtered().slice(0,16);
    list.innerHTML=data.map(x=>{
      const href=safeUrl(link(x));
      const chamber=isChamber(x);
      const inner=`<span class="bar"></span><div><div class="rlb-live-tags"><span class="rlb-live-tag">${esc(modality(x))}</span><span class="rlb-live-tag city">${esc(municipality(x))}${uf(x)?' / '+esc(uf(x)):''}</span>${chamber?'<span class="rlb-live-tag chamber">Câmara Municipal</span>':''}</div><div class="rlb-live-object">${esc(x?.objetoCompra||'Objeto não informado')}</div><div class="rlb-live-org">${esc(org(x))} • detectada: ${esc(when(detected(x)))}</div></div><span class="rlb-live-open">Abrir ↗</span>`;
      return href==='#'?`<div class="rlb-live-item">${inner}</div>`:`<a class="rlb-live-item" href="${href}" target="_blank" rel="noopener" title="Abrir dados oficiais da licitação">${inner}</a>`;
    }).join('')||'<div class="rlb-live-empty">Nenhuma licitação encontrada neste filtro ainda. O monitor continuará acompanhando as publicações.</div>';
  }

  function merge(newItems){
    const map=new Map(items.map(x=>[key(x),x]));
    for(const x of newItems||[])map.set(key(x),x);
    items=[...map.values()].sort((a,b)=>Date.parse(detected(b)||0)-Date.parse(detected(a)||0)).slice(0,100);
    render();
  }

  function setStatus(label,kind=''){
    const el=document.querySelector('#rlbLiveStatus');
    if(!el)return;
    el.textContent=label;
    el.className='rlb-live-status'+(kind?' '+kind:'');
  }

  function updateStatus(s){
    const meta=document.querySelector('#rlbLiveMeta');
    if(!s)return;
    if(s.last_success_at){
      const last=new Date(s.last_success_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
      if(meta)meta.textContent=`Servidor monitorando o PNCP • ciclo ${s.interval_seconds||60}s • última varredura ${last} • ${s.total_stored||0} registros armazenados`;
    }else if(meta){meta.textContent='Monitor inicializando e criando a base de licitações...'}
    if(s.consecutive_failures)setStatus('PNCP instável','warn');else if(s.baseline_completed)setStatus('AO VIVO');else setStatus('Preparando','warn');
  }

  function showToast(x){
    const app=document.querySelector('#app');
    const radar=document.querySelector('.nav button[data-view="radar"]');
    if(!app||app.classList.contains('hidden')||!radar?.classList.contains('active'))return;
    const box=document.querySelector('#rlbLiveToast');
    if(!box)return;
    const href=safeUrl(link(x));
    box.innerHTML=`<b>🔔 Nova licitação detectada</b><span>${esc(modality(x))} • ${esc(municipality(x))}${uf(x)?' / '+esc(uf(x)):''}</span><span>${esc((x?.objetoCompra||'').slice(0,150))}</span>${href==='#'?'':`<a href="${href}" target="_blank" rel="noopener">Abrir licitação ↗</a>`}`;
    box.classList.add('show');
    clearTimeout(box._hideTimer);
    box._hideTimer=setTimeout(()=>box.classList.remove('show'),14000);
  }

  function notifyNative(newItems){
    if(!('Notification'in window)||Notification.permission!=='granted')return;
    newItems.slice(0,3).forEach(x=>{
      const n=new Notification('🔔 '+modality(x)+' • '+municipality(x),{body:(x?.objetoCompra||'Nova licitação').slice(0,170)});
      const href=safeUrl(link(x));
      n.onclick=()=>{if(href!=='#')window.open(href,'_blank','noopener')};
    });
  }

  async function loadInitial(){
    try{
      const r=await fetch('/api/live-feed?limit=60',{headers:{accept:'application/json'}});
      const d=await r.json();
      if(!r.ok)throw new Error(d?.error||'Falha no feed ao vivo');
      merge(d.items||[]);
      updateStatus(d.status||{});
    }catch{
      setStatus('Sem conexão','off');
      const meta=document.querySelector('#rlbLiveMeta');if(meta)meta.textContent='Não foi possível carregar o feed agora. O sistema tentará reconectar automaticamente.';
    }
  }

  function connect(){
    if(source)source.close();
    source=new EventSource('/api/live-events');
    source.addEventListener('status',e=>{try{updateStatus(JSON.parse(e.data))}catch{}});
    source.addEventListener('procurement',e=>{
      try{
        const d=JSON.parse(e.data);const fresh=Array.isArray(d.items)?d.items:[];
        if(!fresh.length)return;
        merge(fresh);
        showToast(fresh[0]);
        notifyNative(fresh);
        window.dispatchEvent(new CustomEvent('rlb:live-procurements',{detail:{items:fresh}}));
      }catch{}
    });
    source.onopen=()=>setStatus('AO VIVO');
    source.onerror=()=>{
      setStatus('Reconectando','warn');
      clearTimeout(reconnectTimer);
      reconnectTimer=setTimeout(()=>{if(source?.readyState===EventSource.CLOSED)connect()},7000);
    };
  }

  async function start(){
    if(started)return;
    const app=document.querySelector('#app');
    if(!app||app.classList.contains('hidden'))return;
    started=true;
    addStyle();ensureUI();
    await loadInitial();
    connect();
  }

  function waitForLogin(){
    if(document.querySelector('#app')&&!document.querySelector('#app').classList.contains('hidden')){start();return}
    const t=setInterval(()=>{
      if(document.querySelector('#app')&&!document.querySelector('#app').classList.contains('hidden')){clearInterval(t);start()}
    },1000);
    setTimeout(()=>clearInterval(t),120000);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',waitForLogin,{once:true});else waitForLogin();
})();