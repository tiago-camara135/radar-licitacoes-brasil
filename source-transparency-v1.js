(()=>{
'use strict';
if(window.__rlbSourceTransparencyV1)return;
window.__rlbSourceTransparencyV1=true;

const nativeFetch=window.fetch.bind(window);
let searchItems=[];
let liveItems=[];
let queued=false;

const clean=v=>String(v??'').trim();
const digits=v=>String(v??'').replace(/\D/g,'');
function urlOf(value){
  const raw=clean(value);
  if(!raw||raw==='#'||!/^https?:\/\//i.test(raw))return '';
  try{
    const u=new URL(raw);
    if(!['http:','https:'].includes(u.protocol))return '';
    return u.href;
  }catch{return ''}
}
function pncpUrl(item){
  const direct=urlOf(item?._pncpUrl);
  if(direct)return direct;
  const c=digits(item?.orgaoEntidade?.cnpj),year=Number(item?.anoCompra),seq=Number(item?.sequencialCompra);
  if(c.length!==14||!Number.isInteger(year)||!Number.isInteger(seq)||seq<1)return '';
  return `https://pncp.gov.br/app/editais/${c}/${year}/${seq}`;
}
function originUrl(item){
  const candidate=urlOf(item?._originUrl||item?.linkSistemaOrigem||item?.linkProcessoEletronico);
  if(!candidate)return '';
  try{
    const host=new URL(candidate).hostname.replace(/^www\./,'').toLowerCase();
    if(host==='pncp.gov.br'||host.endsWith('.pncp.gov.br'))return '';
  }catch{return ''}
  return candidate;
}
function platformInfo(item){
  const origin=originUrl(item);
  let host='';
  try{host=origin?new URL(origin).hostname.replace(/^www\./,'').toLowerCase():''}catch{}
  const direct=clean(item?._sourcePlatform||item?.usuarioNome||item?.nomeSistemaOrigem||item?.sistemaOrigem);
  const source=(direct+' '+host).toLowerCase();
  if(host.includes('portaldecompraspublicas.com.br')||source.includes('ecustomize'))return{name:'Portal de Compras Públicas',known:true};
  if(host.includes('licitardigital.com.br')||source.includes('licitar digital'))return{name:'Licitar Digital',known:true};
  if(host.includes('licitanet.com.br')||source.includes('licitanet'))return{name:'Licitanet',known:true};
  if(source.includes('bll compras')||host.includes('bll.org.br')||host.includes('bllcompras'))return{name:'BLL Compras',known:true};
  if(source.includes('bolsa nacional')||source.includes(' - bnc')||host.includes('bnc.org.br')||host.includes('bnccompras'))return{name:'Bolsa Nacional de Compras - BNC',known:true};
  if(source.includes('bbmnet')||host.includes('bbmnet'))return{name:'BBMNET',known:true};
  if(source.includes('compras.gov.br')||host.includes('compras.gov.br')||host.includes('comprasnet')||host.includes('cnetmobile.estaleiro.serpro.gov.br'))return{name:'Compras.gov.br',known:true};
  if(direct)return{name:direct,known:false};
  if(host)return{name:host,known:false};
  return{name:'Não informada pelo PNCP',known:false};
}
function sourceChip(text,{official=false,known=false,title=''}={}){
  const span=document.createElement('span');
  span.className='rlb-source-chip'+(official?' official':'')+(known?' known':'');
  span.textContent=text;
  if(title)span.title=title;
  return span;
}
function actionLink(label,href,kind='ghost',aria=''){
  const a=document.createElement('a');
  a.className=`btn ${kind} compact rlb-source-btn`;
  a.href=href;
  a.target='_blank';
  a.rel='noopener noreferrer';
  a.referrerPolicy='no-referrer';
  a.textContent=label;
  if(aria)a.setAttribute('aria-label',aria);
  a.title=aria||label.replace(' ↗','');
  return a;
}
function unavailableNote(){
  const note=document.createElement('span');
  note.className='rlb-source-unavailable';
  note.textContent='Acesso direto à plataforma não informado pelo PNCP.';
  return note;
}
function searchTransparency(item){
  const info=platformInfo(item),official=pncpUrl(item),origin=originUrl(item);
  const block=document.createElement('div');
  block.className='rlb-source-transparency';
  block.setAttribute('aria-label','Transparência da fonte da oportunidade');

  const identity=document.createElement('div');
  identity.className='rlb-source-identity';
  const caption=document.createElement('span');
  caption.className='rlb-source-caption';
  caption.textContent='Transparência da oportunidade';
  const chips=document.createElement('div');
  chips.className='rlb-source-chips';
  chips.append(
    sourceChip(`Origem: ${info.name}`,{known:info.known,title:'Plataforma de origem informada nos dados da contratação'}),
    sourceChip('Fonte oficial: PNCP',{official:true,title:'Registro oficial consultado no Portal Nacional de Contratações Públicas'})
  );
  identity.append(caption,chips);
  block.appendChild(identity);

  const actions=document.createElement('div');
  actions.className='rlb-source-actions';
  if(official)actions.appendChild(actionLink('Ver no PNCP ↗',official,'ghost','Abrir esta contratação no PNCP em nova aba'));
  if(origin)actions.appendChild(actionLink('Ir para plataforma ↗',origin,'primary','Abrir a plataforma de origem da disputa em nova aba'));
  else actions.appendChild(unavailableNote());
  block.appendChild(actions);
  return block;
}
function liveTransparency(item){
  const info=platformInfo(item),official=pncpUrl(item),origin=originUrl(item);
  const wrap=document.createElement('div');
  wrap.className='rlb-live-source';
  wrap.setAttribute('aria-label','Origem e acessos da oportunidade');

  const chip=document.createElement('span');
  chip.className='rlb-live-source-chip'+(info.known?' known':'');
  chip.textContent=`Origem: ${info.name}`;
  wrap.appendChild(chip);

  const actions=document.createElement('span');
  actions.className='rlb-live-source-actions';
  if(official)actions.appendChild(actionLink('PNCP ↗',official,'ghost','Abrir esta contratação no PNCP em nova aba'));
  if(origin)actions.appendChild(actionLink('Plataforma ↗',origin,'ghost','Abrir a plataforma de origem da disputa em nova aba'));
  if(actions.childElementCount)wrap.appendChild(actions);
  return wrap;
}
function enhanceSearch(){
  const root=document.getElementById('searchResults');
  if(!root||!searchItems.length)return;
  const cards=[...root.querySelectorAll('.result-item')];
  cards.forEach((card,index)=>{
    const item=searchItems[index];
    if(!item)return;
    card.querySelector('.rlb-source-transparency')?.remove();
    const block=searchTransparency(item);
    const legacy=[...card.querySelectorAll('.item-meta')].find(el=>el.querySelector('a[href*="pncp.gov.br"]'));
    if(legacy)legacy.replaceWith(block);else card.appendChild(block);
  });
}
function enhanceLive(){
  const root=document.getElementById('liveList');
  if(!root||!liveItems.length)return;
  const rows=[...root.querySelectorAll('.live-item')];
  rows.forEach((row,index)=>{
    const item=liveItems[index];
    if(!item)return;
    row.querySelector('.rlb-live-source')?.remove();
    const block=liveTransparency(item);
    const copy=row.querySelector('.item-meta');
    if(copy)copy.insertAdjacentElement('afterend',block);else row.appendChild(block);
  });
}
function enhance(){queued=false;enhanceSearch();enhanceLive()}
function queueEnhance(){
  if(queued)return;queued=true;
  queueMicrotask(()=>{setTimeout(enhance,0)});
}
window.fetch=async function rlbSourceAwareFetch(input,init){
  const response=await nativeFetch(input,init);
  try{
    const raw=typeof input==='string'?input:input?.url||'';
    const url=new URL(raw,location.origin);
    if(url.pathname==='/api/licitacoes'){
      response.clone().json().then(data=>{searchItems=Array.isArray(data?.items)?data.items:[];queueEnhance()}).catch(()=>{});
    }else if(url.pathname==='/api/live-feed'){
      response.clone().json().then(data=>{liveItems=Array.isArray(data?.items)?data.items:[];queueEnhance()}).catch(()=>{});
    }
  }catch{}
  return response;
};

function boot(){
  const search=document.getElementById('searchResults'),live=document.getElementById('liveList');
  if(search)new MutationObserver(queueEnhance).observe(search,{childList:true,subtree:true});
  if(live)new MutationObserver(queueEnhance).observe(live,{childList:true,subtree:true});
  queueEnhance();
  console.info('RLB source transparency v1.1 ready: PNCP + platform origin + direct access');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
