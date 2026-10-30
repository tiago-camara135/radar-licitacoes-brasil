(()=>{
  const originalFetch=window.fetch.bind(window);
  const digits=v=>String(v??'').replace(/\D/g,'');
  const safeExternal=v=>{try{const u=new URL(String(v||''),location.origin);return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return''}};

  function parts(x){
    let cnpj=digits(x?.orgaoEntidade?.cnpj);
    let ano=Number(x?.anoCompra);
    let seq=Number(x?.sequencialCompra);
    const id=String(x?.numeroControlePNCP||'').trim();
    const m=id.match(/^(\d{14})-\d-(\d{1,9})\/(\d{4})$/);
    if(m){
      if(cnpj.length!==14)cnpj=m[1];
      if(!Number.isInteger(seq)||seq<1)seq=Number(m[2]);
      if(!Number.isInteger(ano)||ano<2000)ano=Number(m[3]);
    }
    if(cnpj.length!==14||!Number.isInteger(ano)||ano<2000||!Number.isInteger(seq)||seq<1)return null;
    return {cnpj,ano,seq,id};
  }

  function officialUrl(x){
    const p=parts(x);
    return p?`https://pncp.gov.br/app/editais/${p.cnpj}/${p.ano}/${p.seq}`:'';
  }

  function verified(x){
    if(!parts(x))return false;
    if(!String(x?.numeroControlePNCP||'').trim())return false;
    if(!String(x?.objetoCompra||'').trim())return false;
    if(!String(x?.modalidadeNome||x?._modalidadeConsultada||'').trim())return false;
    if(!String(x?.orgaoEntidade?.razaoSocial||'').trim())return false;
    if(!String(x?.dataPublicacaoPncp||'').trim())return false;
    return true;
  }

  function normalizeItem(x){
    if(!verified(x))return null;
    const pncp=officialUrl(x);
    const origin=safeExternal(x?.linkSistemaOrigem||'');
    const process=safeExternal(x?.linkProcessoEletronico||'');
    return {...x,_rlbOriginUrl:origin,_rlbProcessUrl:process,_rlbPncpUrl:pncp,linkSistemaOrigem:pncp,_rlbVerifiedPncp:true};
  }

  function patchSearchButtons(){
    const box=document.querySelector('#results');
    if(!box)return;
    box.querySelectorAll('a[href^="https://pncp.gov.br/app/editais/"]').forEach(a=>{
      if(a.dataset.rlbPncpPatched==='1')return;
      a.dataset.rlbPncpPatched='1';
      a.textContent='Abrir licitação';
      a.classList.add('btn','primary','tiny');
      a.title='Abrir dados oficiais da licitação no PNCP';
    });
  }

  function schedulePatch(){
    requestAnimationFrame(()=>patchSearchButtons());
    setTimeout(patchSearchButtons,80);
    setTimeout(patchSearchButtons,250);
  }

  window.fetch=async function(input,init){
    const res=await originalFetch(input,init);
    try{
      const url=typeof input==='string'?input:(input?.url||'');
      const isSearch=url.includes('/api/licitacoes');
      const isAlerts=url.includes('/api/alerts/feed');
      if(!isSearch&&!isAlerts)return res;
      const clone=res.clone();
      const data=await clone.json();
      if(!res.ok||!data||!Array.isArray(data.items))return res;
      if(isAlerts){
        data.items=data.items.map(m=>{const item=normalizeItem(m?.item);return item?{...m,item}:null}).filter(Boolean);
      }else{
        data.items=data.items.map(normalizeItem).filter(Boolean);
        schedulePatch();
      }
      data.verified_only=true;
      return new Response(JSON.stringify(data),{status:res.status,statusText:res.statusText,headers:new Headers(res.headers)});
    }catch{return res}
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',patchSearchButtons,{once:true});
  else patchSearchButtons();

  window.RLBVerifiedPNCP={verified,officialUrl};
})();