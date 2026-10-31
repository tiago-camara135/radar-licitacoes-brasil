(()=>{
'use strict';
const LOAD_INTERVAL_MS=5*60*1000;
const DISPLAY_MS=7000;
const COOLDOWN_MS=5*60*1000;
const FIRST_LOAD_MS=2600;
const MAX_BATCH=5;
const MAX_SEEN=240;
let queue=[];
let queuedIds=new Set();
let activeCard=null;
let loading=false;
let loadInterval=null;
let nextTimer=null;
let lastLoad=0;

const text=v=>String(v??'').trim();
const idOf=x=>text(x?.numeroControlePNCP||x?._pncpId||[x?.orgaoEntidade?.cnpj,x?.anoCompra,x?.sequencialCompra,x?._modalidadeConsultada||x?.modalidadeId].filter(Boolean).join('-'));
const modality=x=>text(x?.modalidadeNome||x?._modalidadeConsultada||'Licitação pública');
const municipality=x=>text(x?.unidadeOrgao?.municipioNome||x?.unidadeOrgao?.nomeMunicipio||x?.municipioNome||'Brasil');
const uf=x=>text(x?.unidadeOrgao?.ufSigla||x?.ufSigla||'');
const organization=x=>text(x?.orgaoEntidade?.razaoSocial||'Órgão público');
const objectText=x=>text(x?.objetoCompra||'Nova oportunidade disponível no Radar de Licitações.');
function pncpUrl(x){if(x?._pncpUrl)return x._pncpUrl;const c=String(x?.orgaoEntidade?.cnpj||'').replace(/\D/g,''),y=Number(x?.anoCompra),s=Number(x?.sequencialCompra);return c.length===14&&Number.isInteger(y)&&Number.isInteger(s)?`https://pncp.gov.br/app/editais/${c}/${y}/${s}`:''}
function isAvailable(x){const raw=x?.dataEncerramentoProposta||x?.dataFimRecebimentoProposta||x?._closesAt;if(!raw)return true;const d=new Date(raw);return Number.isNaN(d.getTime())||d.getTime()>=Date.now()}
function seenKey(userId){return `rlb-national-notifications-seen-v3:${userId}`}
function nextAllowedKey(userId){return `rlb-national-notifications-next-allowed-v3:${userId}`}
function readSeen(userId){try{const a=JSON.parse(localStorage.getItem(seenKey(userId))||'[]');return new Set(Array.isArray(a)?a:[])}catch{return new Set()}}
function saveSeen(userId,seen){try{localStorage.setItem(seenKey(userId),JSON.stringify([...seen].slice(-MAX_SEEN)))}catch{}}
function readNextAllowed(userId){try{const n=Number(localStorage.getItem(nextAllowedKey(userId))||0);return Number.isFinite(n)?n:0}catch{return 0}}
function saveNextAllowed(userId,at){try{localStorage.setItem(nextAllowedKey(userId),String(at))}catch{}}
function remainingCooldown(userId){return Math.max(0,readNextAllowed(userId)-Date.now())}
function host(){let h=document.getElementById('rlbNationalNoticeHost');if(h)return h;h=document.createElement('div');h.id='rlbNationalNoticeHost';h.setAttribute('aria-live','polite');Object.assign(h.style,{position:'fixed',right:innerWidth<600?'10px':'20px',bottom:innerWidth<600?'68px':'82px',zIndex:'146',width:innerWidth<600?'min(340px, calc(100vw - 20px))':'min(330px, calc(100vw - 40px))',display:'grid',pointerEvents:'none'});document.body.appendChild(h);return h}
function reposition(){const h=document.getElementById('rlbNationalNoticeHost');if(!h)return;h.style.right=innerWidth<600?'10px':'20px';h.style.bottom=innerWidth<600?'68px':'82px';h.style.width=innerWidth<600?'min(340px, calc(100vw - 20px))':'min(330px, calc(100vw - 40px))'}
async function getUser(){const r=await fetch('/api/me',{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});if(!r.ok)return null;const d=await r.json().catch(()=>({}));return d.user||null}
function scheduleNext(userId){if(nextTimer){clearTimeout(nextTimer);nextTimer=null}if(activeCard||!queue.length)return;const uid=userId||queue[0]?.userId;if(!uid)return;const delay=remainingCooldown(uid);nextTimer=setTimeout(()=>{nextTimer=null;if(!activeCard)displayNext()},delay)}
function finishCard(card){if(!card)return;const userId=card.dataset.userId;if(card.isConnected)card.remove();if(activeCard===card)activeCard=null;if(userId)saveNextAllowed(userId,Date.now()+COOLDOWN_MS);scheduleNext(userId)}
function closeCard(card){if(!card||card.dataset.closing==='1')return;card.dataset.closing='1';try{card.__stopClock?.()}catch{}let finished=false;const done=()=>{if(finished)return;finished=true;finishCard(card)};try{if(matchMedia('(prefers-reduced-motion: reduce)').matches){done();return}const a=card.animate([{opacity:1,transform:'translateX(0) scale(1)'},{opacity:0,transform:'translateX(115%) scale(.97)'}],{duration:230,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'});a.onfinish=done;a.oncancel=done}catch{done()}}
function createCard(item,userId){const url=pncpUrl(item);if(!url)return null;const card=document.createElement('article');card.setAttribute('role','status');card.dataset.userId=String(userId);Object.assign(card.style,{pointerEvents:'auto',position:'relative',padding:'10px 11px 11px',border:'1px solid var(--line)',borderRadius:'13px',background:'color-mix(in srgb, var(--surface) 96%, transparent)',color:'var(--text)',boxShadow:'0 16px 38px rgba(0,0,0,.20)',backdropFilter:'blur(16px)',WebkitBackdropFilter:'blur(16px)',cursor:'pointer',overflow:'hidden',transition:'box-shadow .18s ease,border-color .18s ease'});
const accent=document.createElement('span');Object.assign(accent.style,{position:'absolute',left:'0',top:'9px',bottom:'11px',width:'3px',borderRadius:'0 4px 4px 0',background:'linear-gradient(180deg,var(--emerald),var(--cyan))',boxShadow:'0 0 14px color-mix(in srgb,var(--emerald) 45%,transparent)'});
const top=document.createElement('div');Object.assign(top.style,{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',marginBottom:'5px'});
const label=document.createElement('div');label.textContent='● NOVA OPORTUNIDADE • RADAR';Object.assign(label.style,{fontSize:'7px',fontWeight:'950',letterSpacing:'.09em',color:'var(--emerald)'});
const close=document.createElement('button');close.type='button';close.setAttribute('aria-label','Fechar notificação');close.textContent='×';Object.assign(close.style,{width:'23px',height:'23px',borderRadius:'7px',border:'1px solid var(--line)',background:'var(--surface2)',color:'var(--muted)',fontSize:'15px',lineHeight:'1',padding:'0',cursor:'pointer',flex:'0 0 auto'});top.append(label,close);
const title=document.createElement('div');title.textContent=objectText(item);Object.assign(title.style,{fontSize:'10.5px',fontWeight:'850',lineHeight:'1.35',display:'-webkit-box',WebkitLineClamp:'2',WebkitBoxOrient:'vertical',overflow:'hidden',paddingLeft:'2px'});
const meta=document.createElement('div');meta.textContent=`${modality(item)} • ${municipality(item)}${uf(item)?' / '+uf(item):''}`;Object.assign(meta.style,{fontSize:'8.2px',color:'var(--muted)',marginTop:'5px',paddingLeft:'2px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'});
const org=document.createElement('div');org.textContent=organization(item);Object.assign(org.style,{fontSize:'8px',color:'var(--muted)',marginTop:'2px',paddingLeft:'2px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'});
const foot=document.createElement('div');Object.assign(foot.style,{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'8px',marginTop:'8px',paddingTop:'7px',paddingLeft:'2px',borderTop:'1px solid var(--line)'});
const source=document.createElement('span');source.textContent='PNCP • fonte oficial';Object.assign(source.style,{fontSize:'7.3px',color:'var(--muted)'});
const open=document.createElement('a');open.href=url;open.target='_blank';open.rel='noopener';open.textContent='Abrir ↗';Object.assign(open.style,{fontSize:'8.5px',fontWeight:'900',color:'var(--emerald)',textDecoration:'none'});foot.append(source,open);
const track=document.createElement('div');Object.assign(track.style,{position:'absolute',left:'0',right:'0',bottom:'0',height:'3px',background:'color-mix(in srgb,var(--muted) 14%,transparent)',overflow:'hidden'});
const progress=document.createElement('div');Object.assign(progress.style,{width:'100%',height:'100%',transform:'scaleX(1)',transformOrigin:'left center',background:'linear-gradient(90deg,var(--emerald),var(--cyan),var(--purple))',boxShadow:'0 0 10px color-mix(in srgb,var(--emerald) 35%,transparent)',willChange:'transform'});track.appendChild(progress);
card.append(accent,top,title,meta,org,foot,track);
let remaining=DISPLAY_MS,paused=false,lastFrame=performance.now(),raf=0,stopped=false;
function stopClock(){stopped=true;if(raf)cancelAnimationFrame(raf)}
function frame(now){if(stopped||!card.isConnected)return;if(!paused){remaining-=Math.max(0,now-lastFrame);progress.style.transform=`scaleX(${Math.max(0,remaining/DISPLAY_MS)})`;if(remaining<=0){stopClock();closeCard(card);return}}lastFrame=now;raf=requestAnimationFrame(frame)}
card.__stopClock=stopClock;
close.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();closeCard(card)});
open.addEventListener('click',e=>e.stopPropagation());
card.addEventListener('click',()=>window.open(url,'_blank','noopener'));
card.addEventListener('mouseenter',()=>{paused=true;lastFrame=performance.now();card.style.boxShadow='0 18px 46px color-mix(in srgb,var(--emerald) 18%,rgba(0,0,0,.28)),0 0 0 1px color-mix(in srgb,var(--emerald) 30%,transparent)';card.style.borderColor='color-mix(in srgb,var(--emerald) 45%,var(--line))'});
card.addEventListener('mouseleave',()=>{paused=false;lastFrame=performance.now();card.style.boxShadow='0 16px 38px rgba(0,0,0,.20)';card.style.borderColor='var(--line)'});
card.__start=()=>{try{if(!matchMedia('(prefers-reduced-motion: reduce)').matches){card.animate([{opacity:0,transform:'translateX(115%) scale(.98)'},{offset:.78,opacity:1,transform:'translateX(-7px) scale(1.01)'},{opacity:1,transform:'translateX(0) scale(1)'}],{duration:480,easing:'cubic-bezier(.16,1,.3,1)'})}}catch{}raf=requestAnimationFrame(frame)};
return card}
async function displayNext(){if(activeCard||!queue.length)return;const pending=queue[0];const delay=remainingCooldown(pending.userId);if(delay>0){scheduleNext(pending.userId);return}const next=queue.shift();queuedIds.delete(idOf(next.item));const seen=readSeen(next.userId);seen.add(idOf(next.item));saveSeen(next.userId,seen);const card=createCard(next.item,next.userId);if(!card){scheduleNext(next.userId);return}activeCard=card;saveNextAllowed(next.userId,Date.now()+DISPLAY_MS+COOLDOWN_MS);host().appendChild(card);card.__start?.()}
async function loadBatch(){if(loading||document.hidden)return;loading=true;lastLoad=Date.now();try{const user=await getUser();if(!user)return;const r=await fetch('/api/live-feed?limit=100',{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});if(!r.ok)return;const d=await r.json().catch(()=>({}));const seen=readSeen(user.id);const candidates=(d.items||[]).filter(x=>idOf(x)&&pncpUrl(x)&&isAvailable(x)&&!seen.has(idOf(x))&&!queuedIds.has(idOf(x))).slice(0,MAX_BATCH);for(const item of candidates){queue.push({item,userId:user.id});queuedIds.add(idOf(item))}displayNext()}catch(e){console.warn('RLB onsite notification v3:',e?.message||e)}finally{loading=false}}
function start(){setTimeout(loadBatch,FIRST_LOAD_MS);if(loadInterval)clearInterval(loadInterval);loadInterval=setInterval(loadBatch,LOAD_INTERVAL_MS);const shell=document.getElementById('appShell');if(shell){if(!shell.classList.contains('hidden'))setTimeout(loadBatch,1200);new MutationObserver(()=>{if(!shell.classList.contains('hidden')&&Date.now()-lastLoad>2000)setTimeout(loadBatch,1200)}).observe(shell,{attributes:true,attributeFilter:['class']})}addEventListener('resize',reposition,{passive:true});document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-lastLoad>=LOAD_INTERVAL_MS)loadBatch()})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();