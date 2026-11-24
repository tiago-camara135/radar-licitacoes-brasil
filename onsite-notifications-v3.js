(()=>{
'use strict';
if(window.__rlbOnsiteNotificationsV4)return;window.__rlbOnsiteNotificationsV4=true;
const DISPLAY_MS=8000,COOLDOWN_MS=300000,LOAD_INTERVAL_MS=60000,FIRST_LOAD_MS=2500;
let active=null,loading=false,epoch=0,wasLogged=false,afterId='0',readRevision=0,accountScope='',lastPopupAt=0;
const text=v=>String(v??'').trim(),logged=()=>{const shell=document.getElementById('appShell');return !!shell&&!shell.classList.contains('hidden')};
const urgency=(row,now=Date.now())=>{const v=row.payload?.closes_at;if(!v)return false;const t=Date.parse(v);return Number.isFinite(t)&&t>=now&&t-now<=86400000};
function host(){let h=document.getElementById('rlbNationalNoticeHost');if(!h){h=document.createElement('div');h.id='rlbNationalNoticeHost';h.setAttribute('aria-live','polite');h.setAttribute('aria-relevant','additions');document.body.append(h)}return h}
function el(tag,cls,value=''){const e=document.createElement(tag);e.className=cls;e.textContent=value;return e}
function safeUrl(v){try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:''}catch{return''}}
async function api(path,opt={}){const r=await fetch(path,{signal:AbortSignal.timeout(12000),credentials:'same-origin',cache:'no-store',...opt,headers:{accept:'application/json',...(opt.body?{'content-type':'application/json'}:{}),...(opt.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Erro '+r.status);return d}
async function markRows(rows){const e=epoch;const results=await Promise.allSettled(rows.map(r=>api('/api/stability/notifications/onsite/'+encodeURIComponent(r.id)+'/read',{method:'POST',body:'{}'})));if(e!==epoch||!logged())return false;const ids=rows.filter((r,i)=>results[i].status==='fulfilled').map(r=>String(r.id));if(ids.length)document.dispatchEvent(new CustomEvent('radar:notification-read',{detail:{ids}}));return ids.length===rows.length}
let audio=null,sound=false;
document.addEventListener('radar:notification-sound',e=>{
 sound=Boolean(e.detail?.enabled);
 if(sound){try{audio??=new (window.AudioContext||window.webkitAudioContext)();audio.resume().catch(()=>{})}catch{}}
});
function chime(){if(!sound||!audio||audio.state!=='running')return;try{const o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime;o.type='sine';o.frequency.setValueAtTime(660,t);o.frequency.setValueAtTime(880,t+.09);g.gain.setValueAtTime(.035,t);g.gain.exponentialRampToValueAtTime(.001,t+.22);o.connect(g);g.connect(audio.destination);o.start(t);o.stop(t+.23)}catch{}}
function createCard(group){
 const summary=group.count>1;
 const row=group.rows[0],p=row.payload||{},urgent=!summary&&urgency(row),url=safeUrl(p.pncp_url)||safeUrl(p.origin_url);
 const card=el('article','radar-notice rp-notice');card.dataset.deliveryId=String(row.id);card.dataset.kind=urgent?'urgent':'new';card.setAttribute('aria-label','Notificação do Radar Pulse');
 const header=el('header','rp-notice-header'),icon=el('span','rp-notice-icon');icon.setAttribute('aria-hidden','true');
 const copy=el('div','rp-notice-heading');copy.append(el('span','rp-notice-brand','RADAR PULSE'),el('strong','rp-notice-type',summary?'Novos alertas de licitações':urgent?'Encerramento em até 24h':'Nova oportunidade detectada'));
 const close=el('button','radar-notice-close','×');close.type='button';close.setAttribute('aria-label','Dispensar notificação sem marcar como lida');header.append(icon,copy,close);
 const title=el('strong','radar-notice-title',summary?group.count.toLocaleString('pt-BR')+' novos alertas para sua conta':text(p.object)||'Oportunidade compatível com seu alerta');title.title=title.textContent;
 const meta=[text(p.modality),[text(p.municipality),text(p.uf)].filter(Boolean).join('/')].filter(Boolean).join(' • ');
 const org=text(p.org);
 const alerts=[...new Set(group.rows.map(r=>text(r.alert_name||r.payload?.alert_name)).filter(Boolean))];
 const footer=el('div','radar-notice-footer'),mark=el('button','rp-notice-mark','Marcar como lida');mark.type='button';
 if(!summary&&url){const link=el('a','radar-notice-link','Ver oportunidade ↗');link.href=url;link.target='_blank';link.rel='noopener noreferrer';footer.append(link);link.addEventListener('click',()=>{markRows(group.rows).catch(()=>{})})}
 if(summary){const open=el('button','radar-notice-link','Ver notificações');open.type='button';open.addEventListener('click',()=>{active?.finish();document.dispatchEvent(new CustomEvent('radar:open-notifications'))});footer.append(open)}else footer.append(mark);
 const progress=el('div','rp-notice-progress'),bar=el('div','rp-notice-progress-bar');progress.setAttribute('aria-hidden','true');progress.append(bar);
 card.append(header,title);if(summary)card.append(el('div','radar-notice-meta','Consulte as oportunidades na central. Os alertas permanecem não lidos.'));else{if(meta)card.append(el('div','radar-notice-meta',meta));if(org)card.append(el('div','rp-notice-org',org));if(alerts.length)card.append(el('span','radar-notice-alert',alerts[0]))}
 const status=el('small','rp-notice-status');status.setAttribute('role','status');card.append(footer,status,progress);
 return {card,close,mark,bar,status};
}
function overlayOpen(){return Boolean(document.querySelector('#ai-assistant.ai-widget-open,#revNotifPanel:not([hidden]),#radarAccount[open]'))}
function syncOverlay(){const h=document.getElementById('rlbNationalNoticeHost');if(h)h.hidden=overlayOpen();active?.refreshPause()}
function laterId(a,b){try{return BigInt(a)>BigInt(b)?String(a):String(b)}catch{return String(b||'0')}}
function storageKey(){return 'rlb-popup-digest-v1:'+accountScope}
function restorePopupState(){
 if(!accountScope)return;
 try{const saved=JSON.parse(localStorage.getItem(storageKey())||'null');if(!saved)return;afterId=laterId(saved.afterId||'0',afterId);const t=Number(saved.lastPopupAt);if(Number.isFinite(t)&&t>=0&&t<=Date.now()+COOLDOWN_MS)lastPopupAt=Math.max(lastPopupAt,t)}catch{}
}
function rememberPopup(id){afterId=laterId(id,afterId);lastPopupAt=Date.now();try{if(accountScope)localStorage.setItem(storageKey(),JSON.stringify({afterId,lastPopupAt}))}catch{}}
function canDisplay(now=Date.now()){return !lastPopupAt||now-lastPopupAt>=COOLDOWN_MS}
function displayNext(group){
 restorePopupState();
 if(active||!group||!logged()||document.hidden||overlayOpen()||!canDisplay()||laterId(group.lastId,afterId)===afterId)return false;
 const {card,close,mark,bar,status}=createCard(group);
 // Reserve the whole digest on display, never drain a queue of unread notices.
 rememberPopup(group.lastId);
 let remaining=DISPLAY_MS,started=0,timeout=null,paused=false,finished=false,marking=false;const generation=epoch;
 function stopClock(){if(timeout!==null){clearTimeout(timeout);timeout=null;remaining=Math.max(0,remaining-(performance.now()-started));}bar.style.transition='none';bar.style.transform='scaleX('+remaining/DISPLAY_MS+')'}
 function finish(){if(finished)return;finished=true;stopClock();if(active?.card===card)active=null;card.remove()}
 function resume(){if(finished||timeout!==null||document.hidden||paused||marking||overlayOpen())return;started=performance.now();bar.style.transition=matchMedia('(prefers-reduced-motion: reduce)').matches?'none':'transform '+remaining+'ms linear';bar.style.transform='scaleX(0)';timeout=setTimeout(finish,remaining)}
 function refreshPause(){paused=card.matches(':hover, :focus-within');if(paused||document.hidden||marking||overlayOpen())stopClock();else resume()}
 active={card,group,finish,refreshPause};const region=host();region.hidden=false;region.append(card);chime();
 card.addEventListener('pointerenter',refreshPause);card.addEventListener('pointerleave',()=>{paused=card.matches(':focus-within');if(!paused&&!document.hidden)resume()});card.addEventListener('focusin',refreshPause);card.addEventListener('focusout',()=>setTimeout(refreshPause,0));
 close.addEventListener('click',finish);
 mark.addEventListener('click',async()=>{marking=true;stopClock();mark.disabled=true;try{if(await markRows(group.rows)){if(generation===epoch)finish()}else if(generation===epoch)status.textContent='Não foi possível confirmar toda a leitura. Tente novamente.'}finally{marking=false;mark.disabled=false;if(!finished)refreshPause()}});
 requestAnimationFrame(()=>{if(!finished)refreshPause()});return true;
}
function digestFrom(items){
 const row=Array.isArray(items)?items[0]:null;
 if(!row||row.read_at||row.id==null)return null;
 const count=Number(row.batch_count);
 if(!Number.isSafeInteger(count)||count<1)return null;
 return {rows:[row],count,lastId:String(row.batch_last_id||row.id)};
}
async function loadBatch(){
 if(loading||active||document.hidden||!logged()||overlayOpen())return;
 restorePopupState();if(!canDisplay())return;
 const e=epoch,revision=readRevision;loading=true;
 try{
   const query=cursor=>api('/api/stability/notifications/onsite?popup=1&after='+encodeURIComponent(cursor));
   let requested=afterId,d=await query(requested);
   if(e!==epoch||revision!==readRevision||!logged())return;
   const scope=String(d.user_id||'');if(!/^\d+$/.test(scope))return;
   if(accountScope&&scope!==accountScope){afterId='0';lastPopupAt=0}
   accountScope=scope;restorePopupState();
   if(!canDisplay())return;
   if(requested!==afterId){d=await query(afterId);if(e!==epoch||revision!==readRevision||!logged()||String(d.user_id)!==scope)return}
   const group=digestFrom(d.items);if(!group)return;
   // Serialize across tabs when supported; reread shared state inside the lock.
   if(navigator.locks?.request){await navigator.locks.request('rlb-popup:'+scope,()=>{if(e===epoch&&revision===readRevision)displayNext(group)})}
   else if(e===epoch&&revision===readRevision)displayNext(group);
 }catch(error){if(!/401/.test(String(error.message)))console.warn('RLB onsite digest:',error?.message||error)}finally{loading=false}
}
function clearRead(event){readRevision++;const ids=new Set((event.detail?.ids||[]).map(String));if(event.detail?.all||active?.group.rows.every(r=>ids.has(String(r.id))))active?.finish()}
function syncSession(){const current=logged();if(current===wasLogged)return;wasLogged=current;epoch++;afterId='0';readRevision++;accountScope='';lastPopupAt=0;active?.finish();sound=false;if(current)setTimeout(loadBatch,900)}
function start(){const watcher=new MutationObserver(syncOverlay);for(const selector of ['#ai-assistant','#revNotifPanel','#radarAccount']){const target=document.querySelector(selector);if(target)watcher.observe(target,{attributes:true,attributeFilter:['class','hidden','open']})}wasLogged=logged();setTimeout(loadBatch,FIRST_LOAD_MS);setInterval(loadBatch,LOAD_INTERVAL_MS);const shell=document.getElementById('appShell');if(shell)new MutationObserver(syncSession).observe(shell,{attributes:true,attributeFilter:['class']});document.addEventListener('visibilitychange',()=>{active?.refreshPause();if(!document.hidden)loadBatch()});document.addEventListener('radar:notifications-refresh',loadBatch);document.addEventListener('radar:notification-read',clearRead)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
