(()=>{
  'use strict';
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const state={installed:false,metricsBusy:false,lastMetricsAt:0,resultCardWrapped:false,docsWrapped:false};

  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl=v=>{try{const u=new URL(String(v||''),location.origin);return /^https?:$/.test(u.protocol)?u.href:'#'}catch{return'#'}};
  const brl=v=>{const n=Number(v);return Number.isFinite(n)?n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'Valor não informado'};
  const dateTime=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})};
  const timeOnly=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})};
  const isAuthenticated=()=>{const auth=$('#auth');return Boolean(auth&&(auth.classList.contains('hidden')||getComputedStyle(auth).display==='none'))};

  function icon(name){
    const paths={
      radar:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 12 18.5 6.5"/><circle cx="18.5" cy="6.5" r="1.2"/>',
      bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
      doc:'<path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/>',
      brain:'<path d="M9.5 4.5A3 3 0 0 0 4 6v1.2A3.5 3.5 0 0 0 3 14a3 3 0 0 0 4 4.7V20h2.5zM14.5 4.5A3 3 0 0 1 20 6v1.2a3.5 3.5 0 0 1 1 6.8 3 3 0 0 1-4 4.7V20h-2.5z"/><path d="M9.5 9H7.8M14.5 9h1.7M9.5 14H7.8M14.5 14h1.7M12 4v16"/>',
      more:'<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
      refresh:'<path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M6.1 9A7 7 0 0 1 18 6l2 5M18 15a7 7 0 0 1-12 3l-2-5"/>',
      spark:'<path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1L6.5 8.5l4.1-1.4z"/><path d="m18 14 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z"/>',
      shield:'<path d="M12 3 5 6v5c0 4.7 2.8 8 7 10 4.2-2 7-5.3 7-10V6z"/><path d="m9 12 2 2 4-5"/>',
      sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
      logout:'<path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9"/>'
    };
    return `<svg class="rlb-v6-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]||paths.spark}</svg>`;
  }

  async function json(path){
    const r=await fetch(path,{credentials:'same-origin',headers:{accept:'application/json'}});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||'Falha temporária');
    return d;
  }

  function navBadge(button,id){
    if(!button)return null;
    let badge=button.querySelector('.rlb-nav-badge');
    if(!badge){badge=document.createElement('span');badge.className='rlb-nav-badge';badge.id=id;button.appendChild(badge)}
    return badge;
  }

  function groupSidebar(){
    const nav=$('.nav');
    if(!nav||nav.dataset.rlbV6==='1')return;
    const radar=nav.querySelector('[data-view="radar"]');
    const alerts=nav.querySelector('[data-view="alerts"]');
    const docs=nav.querySelector('[data-view="docs"]');
    const admin=nav.querySelector('[data-view="admin"]');
    const logout=$('#logout');
    if(!radar||!alerts||!docs)return;

    const makeGroup=(label,items)=>{
      const group=document.createElement('div');group.className='rlb-nav-section';
      const title=document.createElement('div');title.className='rlb-nav-section-title';title.textContent=label;group.appendChild(title);
      items.filter(Boolean).forEach(x=>group.appendChild(x));return group;
    };

    nav.insertBefore(makeGroup('Monitoramento',[radar,alerts]),logout||null);
    const ai=document.createElement('button');ai.type='button';ai.id='rlbSidebarAi';ai.className='rlb-sidebar-ai';
    ai.innerHTML=`<span class="rlb-nav-v6-icon">${icon('brain')}</span><span class="rlb-nav-copy"><strong>IA RLB</strong><small>Análise e apoio em licitações</small></span><span class="rlb-ai-nav-live" title="Gemini"></span>`;
    ai.addEventListener('click',()=>openAiContext('',null,false));
    nav.insertBefore(makeGroup('Inteligência',[ai]),logout||null);
    nav.insertBefore(makeGroup('Acervo',[docs]),logout||null);
    if(admin){const g=makeGroup('Gestão',[admin]);g.id='rlbAdminNavGroup';nav.insertBefore(g,logout||null)}
    if(logout){logout.innerHTML=`<span class="rlb-nav-v6-icon">${icon('logout')}</span><span class="rlb-nav-copy"><strong>Sair</strong><small>Encerrar sessão</small></span>`}

    [radar,alerts,docs,admin].filter(Boolean).forEach(btn=>{
      const view=btn.dataset.view;btn.setAttribute('aria-controls','view-'+view);btn.setAttribute('aria-current',btn.classList.contains('active')?'page':'false');
    });
    navBadge(alerts,'rlbAlertNavBadge');navBadge(docs,'rlbDocsNavBadge');
    nav.dataset.rlbV6='1';
  }

  function installSystemStrip(){
    const view=$('#view-radar');const stats=view?.querySelector('.stats');if(!view||!stats)return;
    if(!$('#rlbSystemStrip')){
      const strip=document.createElement('section');strip.id='rlbSystemStrip';strip.className='rlb-system-strip';strip.setAttribute('aria-label','Status operacional da plataforma');
      strip.innerHTML=`
        <div class="rlb-system-item"><span class="rlb-system-dot" id="rlbPncpDot"></span><span><b>PNCP</b><small id="rlbPncpStatus">Verificando...</small></span></div>
        <div class="rlb-system-item"><span class="rlb-system-dot" id="rlbAiDot"></span><span><b>IA RLB</b><small id="rlbAiSystemStatus">Verificando Gemini...</small></span></div>
        <div class="rlb-system-item"><span class="rlb-system-dot" id="rlbDbDot"></span><span><b>Dados</b><small id="rlbDbStatus">Verificando...</small></span></div>
        <div class="rlb-system-item rlb-system-sync"><span>${icon('refresh')}</span><span><b>Última sincronização</b><small id="rlbSystemSync">—</small></span></div>
        <button id="rlbRefreshSystem" class="rlb-system-refresh" type="button" aria-label="Atualizar status da plataforma" title="Atualizar status">${icon('refresh')}</button>`;
      stats.insertAdjacentElement('beforebegin',strip);
      strip.querySelector('#rlbRefreshSystem')?.addEventListener('click',()=>refreshExecutive(true));
    }
  }

  function repurposeStats(){
    const stats=$('#view-radar .stats');if(!stats||stats.dataset.rlbV6==='1')return;
    const cards=Array.from(stats.children);if(cards.length<6)return;
    cards[0].innerHTML='<span class="sub">Base monitorada</span><b id="rlbMetricStored" class="rlb-kpi-value">—</b><small>registros acompanhados</small>';
    cards[1].innerHTML='<span class="sub">Novas no ciclo</span><b id="rlbMetricNew" class="rlb-kpi-value">—</b><small>última varredura PNCP</small>';
    cards[2].innerHTML='<span class="sub">Alertas ativos</span><b id="rlbMetricAlerts" class="rlb-kpi-value">—</b><small>filtros estratégicos</small>';
    cards[3].querySelector('.sub').textContent='Resultados da busca';
    cards[4].querySelector('.sub').textContent='Propostas abertas';
    cards[5].querySelector('.sub').textContent='Busca atualizada';
    cards.forEach((c,i)=>{c.classList.add('rlb-exec-stat');c.dataset.metricIndex=String(i)});
    stats.dataset.rlbV6='1';
  }

  function setDot(id,kind){const d=$(id);if(d)d.className='rlb-system-dot '+(kind||'')}
  function setText(id,value){const e=$(id);if(e)e.textContent=value}

  async function refreshExecutive(force=false){
    if(!isAuthenticated()||state.metricsBusy)return;
    if(!force&&Date.now()-state.lastMetricsAt<15000)return;
    state.metricsBusy=true;
    const btn=$('#rlbRefreshSystem');btn?.classList.add('spinning');
    try{
      const [liveR,alertsR,docsR,aiR]=await Promise.allSettled([json('/api/live-status'),json('/api/alerts'),json('/api/documents'),json('/api/ai-rlb/status')]);
      const live=liveR.status==='fulfilled'?liveR.value?.status:null;
      const alerts=alertsR.status==='fulfilled'?(alertsR.value?.items||[]):[];
      const docs=docsR.status==='fulfilled'?(docsR.value?.items||[]):[];
      const ai=aiR.status==='fulfilled'?aiR.value:null;

      setText('#rlbMetricStored',live?Number(live.total_stored||0).toLocaleString('pt-BR'):'—');
      setText('#rlbMetricNew',live?Number(live.last_new_count||0).toLocaleString('pt-BR'):'—');
      const activeAlerts=alerts.filter(x=>x.enabled).length;
      setText('#rlbMetricAlerts',String(activeAlerts));
      const ab=$('#rlbAlertNavBadge');if(ab){ab.textContent=String(activeAlerts);ab.hidden=activeAlerts===0}
      const db=$('#rlbDocsNavBadge');if(db){db.textContent=String(docs.length);db.hidden=docs.length===0}

      if(live){
        const pncpOk=!live.consecutive_failures&&Boolean(live.last_success_at||live.baseline_completed);
        setDot('#rlbPncpDot',pncpOk?'ok':'warn');
        setText('#rlbPncpStatus',pncpOk?'Operacional':live.consecutive_failures?'Instabilidade detectada':'Inicializando');
        setDot('#rlbDbDot',live.storage==='postgresql'?'ok':'warn');
        setText('#rlbDbStatus',live.storage==='postgresql'?'PostgreSQL online':'Armazenamento temporário');
        setText('#rlbSystemSync',live.last_success_at?timeOnly(live.last_success_at):'Aguardando primeira leitura');
      }else{
        setDot('#rlbPncpDot','off');setText('#rlbPncpStatus','Status indisponível');setDot('#rlbDbDot','off');setText('#rlbDbStatus','Status indisponível');
      }
      if(ai){
        const gemini=ai.provider==='gemini'&&(ai.hybrid_ai||ai.configured||ai.gemini_forced);
        setDot('#rlbAiDot',gemini?'ok':'warn');
        setText('#rlbAiSystemStatus',gemini?`Gemini • ${String(ai.provider_model||ai.model||'ativo').replace(/^gemini-/,'')}`:'Configuração requer atenção');
      }else{setDot('#rlbAiDot','off');setText('#rlbAiSystemStatus','Status indisponível')}
      state.lastMetricsAt=Date.now();
    }finally{state.metricsBusy=false;btn?.classList.remove('spinning')}
  }

  function priorityFlags(x,extra=''){
    const flags=[];const pub=Date.parse(x?.dataPublicacaoPncp||0);const close=Date.parse(x?.dataEncerramentoProposta||x?.dataFimRecebimentoProposta||0);
    if(extra.includes('new'))flags.push(['new','Novo no alerta']);
    else if(pub&&Date.now()-pub<24*3600000)flags.push(['new','Nova publicação']);
    if(close&&close>=Date.now()){
      const diff=close-Date.now();
      if(diff<=24*3600000)flags.push(['urgent','Encerra em até 24h']);
      else if(diff<=72*3600000)flags.push(['soon','Prazo próximo']);
    }
    return flags;
  }

  function opportunityPrompt(x){
    const org=x?.orgaoEntidade?.razaoSocial||'não informado';
    const mun=x?.unidadeOrgao?.municipioNome||x?.unidadeOrgao?.nomeMunicipio||x?.municipioNome||'';
    const uf=x?.unidadeOrgao?.ufSigla||x?.ufSigla||'';
    const official=window.RLBVerifiedPNCP?.officialUrl?.(x)||x?._rlbPncpUrl||x?.linkSistemaOrigem||'';
    return `Faça uma análise preliminar desta oportunidade de licitação com foco prático para participação. Não presuma exigências que não estejam nos dados abaixo. Separe: resumo, pontos de atenção, documentos/itens que devo conferir no edital, prazos e riscos que precisam de validação.\n\nÓrgão: ${org}\nModalidade: ${x?.modalidadeNome||x?._modalidadeConsultada||'não informada'}\nLocal: ${[mun,uf].filter(Boolean).join(' / ')||'não informado'}\nObjeto: ${x?.objetoCompra||'não informado'}\nValor estimado: ${brl(x?.valorTotalEstimado)}\nPublicação: ${dateTime(x?.dataPublicacaoPncp)}\nEncerramento: ${dateTime(x?.dataEncerramentoProposta||x?.dataFimRecebimentoProposta)}\nControle PNCP: ${x?.numeroControlePNCP||'não informado'}\nLink oficial: ${official||'não informado'}`;
  }

  function installResultCards(){
    if(state.resultCardWrapped||typeof window.resultCard!=='function')return;
    window.resultCard=function(x,extra=''){
      const org=x?.orgaoEntidade?.razaoSocial||'Órgão não informado';
      const mun=x?.unidadeOrgao?.municipioNome||x?.unidadeOrgao?.nomeMunicipio||x?.municipioNome||'';
      const uf=x?.unidadeOrgao?.ufSigla||x?.ufSigla||'';
      const close=x?.dataEncerramentoProposta||x?.dataFimRecebimentoProposta||null;
      const official=safeUrl(window.RLBVerifiedPNCP?.officialUrl?.(x)||x?._rlbPncpUrl||x?.linkSistemaOrigem||x?.linkProcessoEletronico||'');
      const origin=safeUrl(x?._rlbOriginUrl||x?._rlbProcessUrl||'');
      const flags=priorityFlags(x,extra);
      const flagHtml=flags.map(([k,t])=>`<span class="rlb-priority ${k}">${esc(t)}</span>`).join('');
      const prompt=encodeURIComponent(opportunityPrompt(x));
      const id=x?.numeroControlePNCP||'PNCP';
      return `<article class="lic rlb-opportunity-card ${esc(extra)}">
        <div class="rlb-opportunity-head"><div class="rlb-opportunity-kicker"><span class="rlb-modality">${esc(x?.modalidadeNome||('Modalidade '+(x?._modalidadeConsultada||'não informada')))}</span><span class="rlb-process-id">${esc(id)}</span></div><div class="rlb-priority-wrap">${flagHtml}</div></div>
        <div class="rlb-org-name">${esc(org)}</div>
        <h3>${esc(x?.objetoCompra||'Objeto não informado')}</h3>
        <div class="rlb-opportunity-grid">
          <div><span>Local</span><b>${esc([mun,uf].filter(Boolean).join(' / ')||'Não informado')}</b></div>
          <div><span>Valor estimado</span><b class="rlb-money-v6">${esc(brl(x?.valorTotalEstimado))}</b></div>
          <div><span>Publicação</span><b class="rlb-date">${esc(dateTime(x?.dataPublicacaoPncp))}</b></div>
          <div><span>Encerramento</span><b class="rlb-date">${esc(dateTime(close))}</b></div>
        </div>
        <div class="rlb-opportunity-actions">
          ${official!=='#'?`<a class="btn primary tiny" target="_blank" rel="noopener" href="${esc(official)}">Abrir no PNCP</a>`:''}
          ${origin!=='#'&&origin!==official?`<a class="btn tiny" target="_blank" rel="noopener" href="${esc(origin)}">Portal de origem</a>`:''}
          <button type="button" class="btn tiny rlb-ai-context-btn" data-rlb-ai-prompt="${prompt}">${icon('spark')} Analisar com IA RLB</button>
        </div>
      </article>`;
    };
    window.resultCard.__rlbV6=true;state.resultCardWrapped=true;
  }

  function skeletonCards(count=4){return Array.from({length:count},()=>'<div class="rlb-skeleton-card"><i></i><span></span><span></span><span class="short"></span></div>').join('')}
  function skeletonRows(count=4,cols=5){return Array.from({length:count},()=>`<tr class="rlb-skeleton-table-row">${Array.from({length:cols},()=>'<td><span></span></td>').join('')}</tr>`).join('')}

  function installLoadingUX(){
    const search=$('#search');if(search&&!search.dataset.rlbV6Loading){
      search.addEventListener('click',()=>{const box=$('#results');if(search.disabled&&box&&!box.children.length)box.innerHTML=skeletonCards(4)});
      search.dataset.rlbV6Loading='1';
    }
    const feed=$('#refreshFeed');if(feed&&!feed.dataset.rlbV6Loading){feed.dataset.rlbV6Loading='1';feed.addEventListener('click',()=>{const box=$('#alertFeed');if(box)box.innerHTML=skeletonCards(3)})}
    const docsNav=$('.nav [data-view="docs"]');if(docsNav&&!docsNav.dataset.rlbV6Loading){docsNav.dataset.rlbV6Loading='1';docsNav.addEventListener('click',()=>{const box=$('#docsList');if(box)box.innerHTML=skeletonCards(3);setTimeout(decorateDocuments,450)})}
    const alertsNav=$('.nav [data-view="alerts"]');if(alertsNav&&!alertsNav.dataset.rlbV6Loading){alertsNav.dataset.rlbV6Loading='1';alertsNav.addEventListener('click',()=>{const box=$('#alertList');if(box&&!box.children.length)box.innerHTML=skeletonCards(2)})}
    const adminNav=$('.nav [data-view="admin"]');if(adminNav&&!adminNav.dataset.rlbV6Loading){adminNav.dataset.rlbV6Loading='1';adminNav.addEventListener('click',()=>{const u=$('#users'),a=$('#audit');if(u)u.innerHTML=skeletonRows(4,6);if(a)a.innerHTML=skeletonRows(4,5)})}
  }

  function decorateDocuments(){
    $$('#docsList .doc').forEach(row=>{
      if(row.dataset.rlbV6==='1')return;
      const del=row.querySelector('[data-doc-delete]');const id=del?.dataset.docDelete;if(!id)return;
      const filename=row.querySelector('b')?.textContent?.trim()||'documento';
      const actions=row.querySelector('.actions');if(!actions)return;
      const analyze=document.createElement('button');analyze.type='button';analyze.className='btn tiny rlb-doc-ai';analyze.dataset.rlbDocAi=id;analyze.dataset.rlbDocName=filename;analyze.innerHTML=`${icon('spark')} Analisar com IA`;
      const summarize=document.createElement('button');summarize.type='button';summarize.className='btn tiny rlb-doc-summary';summarize.dataset.rlbDocSummary=id;summarize.dataset.rlbDocName=filename;summarize.textContent='Resumir';
      actions.insertBefore(analyze,actions.firstChild);actions.insertBefore(summarize,analyze.nextSibling);row.dataset.rlbV6='1';
    });
  }

  function wrapDocs(){
    if(state.docsWrapped)return;
    if(typeof window.loadDocs==='function'){
      const original=window.loadDocs;
      const wrapped=async function(...args){const out=await original.apply(this,args);decorateDocuments();refreshExecutive(true).catch(()=>{});return out};
      wrapped.__rlbV6=true;window.loadDocs=wrapped;state.docsWrapped=true;
    }
  }

  function waitFor(test,tries=12,delay=140){return new Promise(resolve=>{let n=0;const run=()=>{let value=null;try{value=test()}catch{}if(value||n++>=tries){resolve(value);return}setTimeout(run,delay)};run()})}
  async function openAiContext(prompt='',documentId=null,autoSend=false){
    if(!isAuthenticated())return;
    const launcher=await waitFor(()=>$('#rlbAiLauncher'),10,100);const panel=$('#rlbAiPanel');
    if(!launcher||!panel)return;
    if(panel.hidden)launcher.click();
    const input=await waitFor(()=>$('#rlbAiInput'),12,120);if(!input)return;
    if(documentId){
      const sel=$('#rlbAiDoc');await waitFor(()=>sel&&Array.from(sel.options).some(o=>o.value===String(documentId)),15,150);if(sel)sel.value=String(documentId);
    }
    if(prompt){input.value=prompt;input.dispatchEvent(new Event('input',{bubbles:true}))}
    input.focus();
    if(autoSend&&prompt){await waitFor(()=>$('.rlb-ai-status-dot')?.getAttribute('title'),20,150);await new Promise(r=>setTimeout(r,80));$('#rlbAiSend')?.click()}
  }

  function installAiContextEvents(){
    if(document.documentElement.dataset.rlbV6AiEvents==='1')return;
    document.documentElement.dataset.rlbV6AiEvents='1';
    document.addEventListener('click',e=>{
      const ai=e.target.closest('[data-rlb-ai-prompt]');
      if(ai){e.preventDefault();const prompt=decodeURIComponent(ai.dataset.rlbAiPrompt||'');openAiContext(prompt,null,true);return}
      const doc=e.target.closest('[data-rlb-doc-ai]');
      if(doc){e.preventDefault();const name=doc.dataset.rlbDocName||'documento';openAiContext(`Analise integralmente o documento “${name}” com foco em licitações. Identifique finalidade, pontos críticos, riscos de inabilitação ou impugnação, prazos, exigências, inconsistências e providências recomendadas. Não invente informações ausentes.`,doc.dataset.rlbDocAi,true);return}
      const sum=e.target.closest('[data-rlb-doc-summary]');
      if(sum){e.preventDefault();const name=sum.dataset.rlbDocName||'documento';openAiContext(`Resuma o documento “${name}” de forma objetiva e profissional. Explique para que serve, os pontos principais, prazos, valores, exigências e qualquer item que mereça atenção em um processo licitatório.`,sum.dataset.rlbDocSummary,true);return}
    });
  }

  function installMobileNav(){
    if($('#rlbMobileNav'))return;
    const nav=document.createElement('nav');nav.id='rlbMobileNav';nav.className='rlb-mobile-nav';nav.setAttribute('aria-label','Navegação principal móvel');
    nav.innerHTML=`
      <button type="button" data-mobile-view="radar" class="active">${icon('radar')}<span>Radar</span></button>
      <button type="button" data-mobile-view="alerts">${icon('bell')}<span>Alertas</span></button>
      <button type="button" data-mobile-view="docs">${icon('doc')}<span>Documentos</span></button>
      <button type="button" data-mobile-ai>${icon('brain')}<span>IA RLB</span></button>
      <button type="button" data-mobile-more aria-expanded="false">${icon('more')}<span>Mais</span></button>`;
    const more=document.createElement('div');more.id='rlbMobileMore';more.className='rlb-mobile-more';more.hidden=true;
    more.innerHTML=`<button type="button" data-mobile-admin>${icon('shield')}<span>Administração</span></button><button type="button" data-mobile-theme>${icon('sun')}<span>Alternar tema</span></button><button type="button" data-mobile-logout>${icon('logout')}<span>Sair</span></button>`;
    document.body.append(more,nav);

    nav.addEventListener('click',e=>{
      const view=e.target.closest('[data-mobile-view]');if(view){$('.nav [data-view="'+view.dataset.mobileView+'"]')?.click();syncMobileActive();more.hidden=true;return}
      if(e.target.closest('[data-mobile-ai]')){openAiContext('',null,false);more.hidden=true;return}
      const mb=e.target.closest('[data-mobile-more]');if(mb){more.hidden=!more.hidden;mb.setAttribute('aria-expanded',String(!more.hidden));syncMobileMore();return}
    });
    more.addEventListener('click',e=>{
      if(e.target.closest('[data-mobile-admin]')){$('.nav [data-view="admin"]')?.click();more.hidden=true;syncMobileActive();return}
      if(e.target.closest('[data-mobile-theme]')){const current=document.documentElement.dataset.theme==='dark'?'dark':'light';$(`[data-rlb-theme="${current==='dark'?'light':'dark'}"]`)?.click();more.hidden=true;return}
      if(e.target.closest('[data-mobile-logout]')){$('#logout')?.click();}
    });
    document.addEventListener('click',e=>{if(!more.hidden&&!e.target.closest('#rlbMobileMore,#rlbMobileNav'))more.hidden=true});
    syncMobileMore();
  }

  function syncMobileMore(){const admin=$('[data-mobile-admin]');const native=$('.nav [data-view="admin"]');if(admin)admin.hidden=!native||native.classList.contains('hidden')}
  function syncMobileActive(){
    const active=$('.nav [data-view].active')?.dataset.view;
    $$('[data-mobile-view]').forEach(b=>b.classList.toggle('active',b.dataset.mobileView===active));
    $$('.nav [data-view]').forEach(b=>b.setAttribute('aria-current',b.classList.contains('active')?'page':'false'));
    syncMobileMore();
  }

  function installNavigationSync(){
    $$('.nav [data-view]').forEach(b=>{if(b.dataset.rlbV6Sync)return;b.dataset.rlbV6Sync='1';b.addEventListener('click',()=>{syncMobileActive();if(b.dataset.view==='radar')refreshExecutive();if(b.dataset.view==='docs')setTimeout(decorateDocuments,450)})});
  }

  function installAccessibility(){
    $('#results')?.setAttribute('aria-live','polite');$('#searchMsg')?.setAttribute('aria-live','polite');$('#docMsg')?.setAttribute('aria-live','polite');$('#feedMsg')?.setAttribute('aria-live','polite');
    $('#q')?.setAttribute('aria-label','Palavra-chave ou objeto da licitação');$('#search')?.setAttribute('aria-label','Buscar oportunidades no PNCP');
    const strip=$('#rlbSystemStrip');strip?.setAttribute('role','status');strip?.setAttribute('aria-live','polite');
  }

  function installRefreshHooks(){
    $('#authBtn')?.addEventListener('click',()=>{setTimeout(installAuthenticated,300);setTimeout(()=>refreshExecutive(true),900)});
    window.addEventListener('focus',()=>{if(Date.now()-state.lastMetricsAt>30000)refreshExecutive()});
    window.addEventListener('rlb:live-procurements',()=>refreshExecutive(true));
    $('#upload')?.addEventListener('click',()=>{setTimeout(()=>{decorateDocuments();refreshExecutive(true)},900)});
    $('#createAlert')?.addEventListener('click',()=>setTimeout(()=>refreshExecutive(true),700));
    $('#alertList')?.addEventListener('click',()=>setTimeout(()=>refreshExecutive(true),650));
  }

  function installAuthenticated(){
    if(!isAuthenticated())return false;
    groupSidebar();installSystemStrip();repurposeStats();installResultCards();wrapDocs();installLoadingUX();installAiContextEvents();installMobileNav();installNavigationSync();installAccessibility();
    decorateDocuments();refreshExecutive(true);syncMobileActive();
    document.body.classList.add('rlb-v6-ready');
    return true;
  }

  function install(){
    if(state.installed)return;state.installed=true;
    [0,80,260,700,1500,2800].forEach(ms=>setTimeout(installAuthenticated,ms));
    installRefreshHooks();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
