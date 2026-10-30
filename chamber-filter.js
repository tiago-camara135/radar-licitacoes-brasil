(()=>{
  let chamberSearchPending=false;
  const originalFetch=window.fetch.bind(window);
  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const isChamber=x=>{
    const text=norm([
      x?.orgaoEntidade?.razaoSocial,
      x?.orgaoEntidade?.nomeUnidade,
      x?.unidadeOrgao?.nomeUnidade,
      x?.unidadeOrgao?.nomeOrgao
    ].filter(Boolean).join(' '));
    return /\bcamara municipal\b|\bcamara de vereadores\b|\bpoder legislativo municipal\b/.test(text);
  };

  window.fetch=async function(input,init){
    const res=await originalFetch(input,init);
    try{
      const url=typeof input==='string'?input:(input?.url||'');
      if(!url.includes('/api/licitacoes')||!chamberSearchPending)return res;
      chamberSearchPending=false;
      const clone=res.clone();
      const data=await clone.json();
      if(!res.ok||!data||!Array.isArray(data.items))return res;
      data.items=data.items.filter(isChamber);
      data.chamber_filter=true;
      data.chamber_filter_label='Câmaras Municipais';
      return new Response(JSON.stringify(data),{status:res.status,statusText:res.statusText,headers:new Headers(res.headers)});
    }catch{
      chamberSearchPending=false;
      return res;
    }
  };

  function ensureUI(){
    if(document.querySelector('#orgType'))return;
    const org=document.querySelector('#org');
    const search=document.querySelector('#search');
    if(!org||!search)return;

    const holder=document.createElement('div');
    holder.id='orgTypeHolder';
    holder.innerHTML=`<label>Tipo de órgão</label><select id="orgType"><option value="all">Todos os órgãos</option><option value="chambers">Câmaras Municipais</option></select>`;
    org.parentElement?.insertAdjacentElement('afterend',holder);

    const quick=document.createElement('button');
    quick.type='button';
    quick.id='searchChambersBrazil';
    quick.className='btn section-gap rlb-chamber-btn';
    quick.innerHTML='🏛 Câmaras Municipais — Brasil';
    search.insertAdjacentElement('afterend',quick);

    const note=document.createElement('div');
    note.id='chamberFilterNote';
    note.className='rlb-chamber-note hidden';
    note.textContent='Filtro ativo: somente licitações reais de Câmaras Municipais identificadas nos registros oficiais do PNCP.';
    quick.insertAdjacentElement('afterend',note);

    document.addEventListener('click',e=>{
      const target=e.target.closest('#search');
      if(!target)return;
      const selected=document.querySelector('#orgType')?.value==='chambers';
      chamberSearchPending=selected;
      note.classList.toggle('hidden',!selected);
    },true);

    quick.addEventListener('click',()=>{
      const sel=document.querySelector('#orgType');
      if(sel)sel.value='chambers';
      const uf=document.querySelector('#uf'); if(uf)uf.value='';
      const mun=document.querySelector('#municipality'); if(mun)mun.value='';
      const ibge=document.querySelector('#municipalityIbge'); if(ibge)ibge.value='';
      chamberSearchPending=true;
      note.classList.remove('hidden');
      search.click();
    });

    document.querySelector('#clearFilters')?.addEventListener('click',()=>{
      const sel=document.querySelector('#orgType'); if(sel)sel.value='all';
      chamberSearchPending=false;
      note.classList.add('hidden');
    });
  }

  function addStyles(){
    if(document.querySelector('#rlb-chamber-style'))return;
    const style=document.createElement('style');
    style.id='rlb-chamber-style';
    style.textContent=`
      #orgTypeHolder select{border-color:#b8d9ca;background:linear-gradient(180deg,#fff,#f8fffb)}
      .rlb-chamber-btn{margin-left:8px;border-color:#b8d9ca!important;color:#087a47!important;background:linear-gradient(135deg,#effbf4,#fff8d9)!important;box-shadow:0 6px 16px rgba(0,145,77,.08)}
      .rlb-chamber-btn:hover{border-color:#69b68e!important;background:linear-gradient(135deg,#e4f8ec,#fff3b7)!important}
      .rlb-chamber-note{display:inline-flex;margin:12px 0 0 10px;padding:8px 10px;border-radius:9px;background:#eaf8f0;color:#087443;border:1px solid #c8e8d7;font-size:10px;font-weight:800;vertical-align:middle}
      .rlb-chamber-note.hidden{display:none!important}
      @media(max-width:760px){.rlb-chamber-btn{margin-left:0;width:100%;margin-top:8px}.rlb-chamber-note{margin-left:0;display:flex}}
    `;
    document.head.appendChild(style);
  }

  function start(){addStyles();ensureUI();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();