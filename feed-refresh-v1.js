(()=>{
  'use strict';
  if(window.__RLB_FEED_REFRESH_V1__)return;
  window.__RLB_FEED_REFRESH_V1__=true;
  const POLL_MS=90000;
  const $=(s,r=document)=>r.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl=v=>{try{const u=new URL(String(v||''),location.origin);return ['http:','https:'].includes(u.protocol)?u.href:'#'}catch{return'#'}};
  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  const municipality=x=>x?.unidadeOrgao?.municipioNome||x?.unidadeOrgao?.nomeMunicipio||x?.municipioNome||'Município não informado';
  const uf=x=>x?.unidadeOrgao?.ufSigla||x?.ufSigla||'';
  const org=x=>x?.orgaoEntidade?.razaoSocial||'Órgão não informado';
  const modality=x=>x?.modalidadeNome||('Modalidade '+(x?._modalidadeConsultada||'não informada'));
  const link=x=>x?._pncpUrl||x?.linkSistemaOrigem||x?.linkProcessoEletronico||'';
  const detected=x=>x?._detectedAt||x?.dataPublicacaoPncp||null;
  const when=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})};
  const sourceHost=x=>{const raw=x?._originUrl||x?.linkSistemaOrigem||x?.linkProcessoEletronico||'';try{return new URL(raw).hostname.replace(/^www\./,'')}catch{return'PNCP'}};
  function isMunicipal(x){const sphere=norm(x?.orgaoEntidade?.esferaId||x?.orgaoEntidade?.esfera||x?.esferaId||'');if(sphere==='M'||sphere==='MUNICIPAL')return true;return /MUNICIPIO|MUNICIPAL|PREFEITURA|CAMARA MUNICIPAL|FUNDO MUNICIPAL|SECRETARIA MUNICIPAL/.test(norm(org(x)+' '+(x?.unidadeOrgao?.nomeUnidade||'')))}
  function isChamber(x){const power=norm(x?.orgaoEntidade?.poderId||''),sphere=norm(x?.orgaoEntidade?.esferaId||'');if(power==='L'&&sphere==='M')return true;return /CAMARA MUNICIPAL|CAMARA DE VEREADORES|PODER LEGISLATIVO MUNICIPAL/.test(norm(org(x)+' '+(x?.unidadeOrgao?.nomeUnidade||'')))}
  function filtered(items){const scope=$('#rlbLiveScope')?.value||'all';if(scope==='municipal')return items.filter(isMunicipal);if(scope==='chambers')return items.filter(isChamber);return items}
  function render(items){const list=$('#rlbLiveList');if(!list)return;const data=filtered(items).slice(0,16);list.innerHTML=data.map(x=>{const href=safeUrl(link(x)),chamber=isChamber(x),src=sourceHost(x);const inner=`<span class="bar"></span><div><div class="rlb-live-tags"><span class="rlb-live-tag">${esc(modality(x))}</span><span class="rlb-live-tag city">${esc(municipality(x))}${uf(x)?' / '+esc(uf(x)):''}</span>${chamber?'<span class="rlb-live-tag chamber">Câmara Municipal</span>':''}<span class="rlb-live-tag">${esc(src)}</span></div><div class="rlb-live-object">${esc(x?.objetoCompra||'Objeto não informado')}</div><div class="rlb-live-org">${esc(org(x))} • detectada: ${esc(when(detected(x)))}</div></div><span class="rlb-live-open">Abrir ↗</span>`;return href==='#'?`<div class="rlb-live-item">${inner}</div>`:`<a class="rlb-live-item" href="${href}" target="_blank" rel="noopener" title="Abrir dados oficiais da licitação">${inner}</a>`}).join('')||'<div class="rlb-live-empty">Nenhuma licitação encontrada neste filtro ainda. O monitor continuará acompanhando as publicações.</div>'}
  function updateMeta(status,fetchedAt){const meta=$('#rlbLiveMeta'),badge=$('#rlbLiveStatus');if(meta){const last=status?.last_success_at?new Date(status.last_success_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'aguardando';const sync=fetchedAt?new Date(fetchedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';meta.textContent=`Servidor monitorando o PNCP • ciclo 90s • última varredura ${last} • feed sincronizado ${sync} • ${status?.total_stored||0} registros armazenados`}if(badge&&!status?.consecutive_failures){badge.textContent='AO VIVO';badge.className='rlb-live-status'}}
  let busy=false,lastItems=[];
  async function refresh(){if(busy||document.hidden)return;const app=$('#app');if(!app||app.classList.contains('hidden'))return;busy=true;try{const r=await fetch('/api/live-feed?limit=60',{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});const d=await r.json();if(!r.ok)throw new Error(d?.error||'Falha no feed');lastItems=Array.isArray(d.items)?d.items:[];render(lastItems);updateMeta(d.status||{},d.fetched_at);window.dispatchEvent(new CustomEvent('rlb:feed-synced',{detail:{items:lastItems,status:d.status||{},fetched_at:d.fetched_at}}))}catch(e){const meta=$('#rlbLiveMeta');if(meta)meta.textContent='Feed conectado à base local; nova sincronização automática em até 90 segundos.'}finally{busy=false}}
  function start(){if(!$('#rlbLiveFeed'))return false;$('#rlbLiveScope')?.addEventListener('change',()=>{if(lastItems.length)render(lastItems)});refresh();setInterval(refresh,POLL_MS);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});return true}
  function wait(){if(start())return;const t=setInterval(()=>{if(start())clearInterval(t)},1000);setTimeout(()=>clearInterval(t),180000)}
  if(document.readyState==='complete')wait();else window.addEventListener('load',wait,{once:true});
})();
