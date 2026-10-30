(()=>{
  let searchContext=null;
  let lastItems=[];
  const originalFetch=window.fetch.bind(window);
  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const safeUrl=v=>{try{const u=new URL(String(v||''),location.origin);return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return''}};
  const hostOf=v=>{try{return new URL(v).hostname.toLowerCase().replace(/^www\./,'')}catch{return''}};

  const isChamber=x=>{
    const power=String(x?.orgaoEntidade?.poderId||'').trim().toUpperCase();
    const sphere=String(x?.orgaoEntidade?.esferaId||'').trim().toUpperCase();
    if(power==='L'&&sphere==='M')return true;
    const text=norm([
      x?.orgaoEntidade?.razaoSocial,
      x?.unidadeOrgao?.nomeUnidade,
      x?.unidadeOrgao?.nomeOrgao
    ].filter(Boolean).join(' '));
    return /\bcamara municipal\b|\bcamara de vereadores\b|\bpoder legislativo municipal\b/.test(text);
  };

  function sourceInfo(x){
    const origin=safeUrl(x?._rlbOriginUrl||'');
    const process=safeUrl(x?._rlbProcessUrl||'');
    const host=hostOf(origin||process);
    const txt=norm([x?.usuarioNome,origin,process,host].filter(Boolean).join(' '));

    if(/portaldecompraspublicas\.com\.br|portal de compras publicas|ecustomize/.test(txt))
      return {key:'portal_publicas',label:'Portal de Compras Públicas',origin:origin||process};
    if(/compras\.gov\.br|comprasnet\.gov\.br|comprasnet|compras\.gov/.test(txt))
      return {key:'comprasgov',label:'Compras.gov.br / Comprasnet',origin:origin||process};

    const looksMunicipal=!!host&&(
      host.endsWith('.gov.br')||
      /(^|\.)camara\.|(^|\.)prefeitura\.|municipio|camara|legislativo|transparencia/.test(host)
    );
    if(looksMunicipal)return {key:'municipal',label:'Portal/site oficial municipal',origin:origin||process};
    if(origin||process)return {key:'other',label:host?`Outro portal: ${host}`:'Outro portal de origem',origin:origin||process};
    return {key:'pncp',label:'PNCP • sem link externo informado',origin:''};
  }

  function matchesSource(x,key){
    if(!key||key==='all')return true;
    return sourceInfo(x).key===key;
  }

  window.fetch=async function(input,init){
    const res=await originalFetch(input,init);
    try{
      const url=typeof input==='string'?input:(input?.url||'');
      if(!url.includes('/api/licitacoes')||!searchContext)return res;
      const ctx=searchContext;
      searchContext=null;
      const clone=res.clone();
      const data=await clone.json();
      if(!res.ok||!data||!Array.isArray(data.items))return res;

      let items=data.items;
      if(ctx.orgType==='chambers')items=items.filter(isChamber);
      if(ctx.source!=='all')items=items.filter(x=>matchesSource(x,ctx.source));
      lastItems=items;

      const breakdown={};
      items.forEach(x=>{const s=sourceInfo(x);breakdown[s.key]=(breakdown[s.key]||0)+1});
      data.items=items;
      data.chamber_filter=ctx.orgType==='chambers';
      data.source_filter=ctx.source;
      data.source_breakdown=breakdown;
      queueMicrotask(()=>updateScopeNote(ctx,items));
      return new Response(JSON.stringify(data),{status:res.status,statusText:res.statusText,headers:new Headers(res.headers)});
    }catch{
      searchContext=null;
      return res;
    }
  };

  function currentContext(){
    return {
      orgType:document.querySelector('#orgType')?.value||'all',
      source:document.querySelector('#sourceScope')?.value||'all'
    };
  }

  function updateScopeNote(ctx,items=[]){
    const note=document.querySelector('#chamberFilterNote');
    if(!note)return;
    const active=ctx?.orgType==='chambers';
    note.classList.toggle('hidden',!active);
    if(!active)return;
    const sourceSelect=document.querySelector('#sourceScope');
    const sourceLabel=sourceSelect?.options[sourceSelect.selectedIndex]?.text||'Todas as fontes públicas disponíveis';
    note.innerHTML=`<strong>Filtro profissional ativo:</strong> Câmaras Municipais (Poder Legislativo + esfera municipal). <span>${items.length} registro(s) real(is) encontrado(s).</span><br><span>Fonte selecionada: ${escapeHtml(sourceLabel)}. O Radar usa os registros oficiais do PNCP e identifica o portal/sistema de origem informado pelo órgão.</span>`;
  }

  function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]))}

  function patchResultCards(){
    const box=document.querySelector('#results');
    if(!box||!lastItems.length)return;
    const cards=[...box.querySelectorAll('.lic')];
    cards.forEach((card,i)=>{
      const x=lastItems[i];
      if(!x)return;
      const info=sourceInfo(x);
      let pill=card.querySelector('.rlb-source-pill');
      if(!pill){
        pill=document.createElement('span');
        pill.className='pill rlb-source-pill';
        card.querySelector('.meta')?.appendChild(pill);
      }
      pill.textContent='Fonte: '+info.label;
      pill.dataset.source=info.key;

      const actions=card.querySelector('.actions');
      if(actions&&info.origin&&!actions.querySelector('.rlb-origin-link')){
        const link=document.createElement('a');
        link.className='btn tiny rlb-origin-link';
        link.target='_blank';
        link.rel='noopener';
        link.href=info.origin;
        link.textContent='Abrir portal de origem ↗';
        link.title='Abrir o sistema/portal de origem informado no registro oficial do PNCP';
        actions.appendChild(link);
      }
    });
  }

  function ensureUI(){
    if(document.querySelector('#orgType'))return;
    const org=document.querySelector('#org');
    const search=document.querySelector('#search');
    if(!org||!search)return;

    const holder=document.createElement('div');
    holder.id='orgTypeHolder';
    holder.innerHTML=`<label>Tipo de órgão</label><select id="orgType"><option value="all">Todos os órgãos</option><option value="chambers">Câmaras Municipais</option></select>`;
    org.parentElement?.insertAdjacentElement('afterend',holder);

    const sourceHolder=document.createElement('div');
    sourceHolder.id='sourceScopeHolder';
    sourceHolder.innerHTML=`<label>Fonte / plataforma</label><select id="sourceScope">
      <option value="all">Todas as fontes públicas disponíveis</option>
      <option value="portal_publicas">Portal de Compras Públicas</option>
      <option value="comprasgov">Compras.gov.br / Comprasnet</option>
      <option value="municipal">Sites/portais oficiais municipais</option>
      <option value="other">Outros portais integrados ao PNCP</option>
      <option value="pncp">PNCP sem link externo informado</option>
    </select>`;
    holder.insertAdjacentElement('afterend',sourceHolder);

    const quick=document.createElement('button');
    quick.type='button';
    quick.id='searchChambersBrazil';
    quick.className='btn section-gap rlb-chamber-btn';
    quick.innerHTML='🏛 Câmaras Municipais — Brasil / todas as fontes';
    search.insertAdjacentElement('afterend',quick);

    const note=document.createElement('div');
    note.id='chamberFilterNote';
    note.className='rlb-chamber-note hidden';
    note.innerHTML='<strong>Filtro profissional ativo:</strong> Câmaras Municipais.';
    quick.insertAdjacentElement('afterend',note);

    document.addEventListener('click',e=>{
      const target=e.target.closest('#search');
      if(!target)return;
      searchContext=currentContext();
      if(searchContext.orgType==='chambers')note.classList.remove('hidden');
      else note.classList.add('hidden');
    },true);

    quick.addEventListener('click',()=>{
      const sel=document.querySelector('#orgType'); if(sel)sel.value='chambers';
      const source=document.querySelector('#sourceScope'); if(source)source.value='all';
      const uf=document.querySelector('#uf'); if(uf)uf.value='';
      const mun=document.querySelector('#municipality'); if(mun)mun.value='';
      const ibge=document.querySelector('#municipalityIbge'); if(ibge)ibge.value='';
      searchContext=currentContext();
      note.classList.remove('hidden');
      search.click();
    });

    document.querySelector('#clearFilters')?.addEventListener('click',()=>{
      const sel=document.querySelector('#orgType'); if(sel)sel.value='all';
      const source=document.querySelector('#sourceScope'); if(source)source.value='all';
      searchContext=null;
      lastItems=[];
      note.classList.add('hidden');
    });
  }

  function addStyles(){
    if(document.querySelector('#rlb-chamber-style'))return;
    const style=document.createElement('style');
    style.id='rlb-chamber-style';
    style.textContent=`
      #orgTypeHolder select,#sourceScopeHolder select{border-color:#b8d9ca;background:linear-gradient(180deg,#fff,#f8fffb)}
      .rlb-chamber-btn{margin-left:8px;border-color:#b8d9ca!important;color:#087a47!important;background:linear-gradient(135deg,#effbf4,#fff8d9)!important;box-shadow:0 6px 16px rgba(0,145,77,.08)}
      .rlb-chamber-btn:hover{border-color:#69b68e!important;background:linear-gradient(135deg,#e4f8ec,#fff3b7)!important}
      .rlb-chamber-note{display:block;margin:12px 0 0;padding:10px 12px;border-radius:10px;background:linear-gradient(90deg,#eaf8f0,#fff9dd);color:#24543c;border:1px solid #c8e8d7;font-size:11px;line-height:1.55}
      .rlb-chamber-note.hidden{display:none!important}
      .rlb-source-pill{background:#eef7ff!important;color:#155d90!important;border:1px solid #d2e6f5}
      .rlb-source-pill[data-source="portal_publicas"]{background:#eef8f0!important;color:#087a47!important;border-color:#cce8d6}
      .rlb-source-pill[data-source="comprasgov"]{background:#eaf2ff!important;color:#164f9b!important;border-color:#ccdcef}
      .rlb-source-pill[data-source="municipal"]{background:#fff6d7!important;color:#725700!important;border-color:#efdfaa}
      .rlb-origin-link{border-color:#bed7c8!important;color:#087a47!important;background:#f6fcf8!important}
      @media(max-width:760px){.rlb-chamber-btn{margin-left:0;width:100%;margin-top:8px}.rlb-chamber-note{margin-left:0}}
    `;
    document.head.appendChild(style);
  }

  function start(){
    addStyles();
    ensureUI();
    const results=document.querySelector('#results');
    if(results)new MutationObserver(()=>queueMicrotask(patchResultCards)).observe(results,{childList:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();