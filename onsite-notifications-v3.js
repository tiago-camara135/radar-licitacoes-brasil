(()=>{
'use strict';
if(window.__rlbOnsiteNotificationsV4)return;window.__rlbOnsiteNotificationsV4=true;
const DISPLAY_MS=8000,COOLDOWN_MS=1200,LOAD_INTERVAL_MS=60000,FIRST_LOAD_MS=2500,MAX_QUEUE=30;
let queue=[],seen=new Set(),active=null,loading=false,epoch=0,nextTimer=null,wasLogged=false,afterId='0',readRevision=0;
const text=v=>String(v??'').trim(),logged=()=>{const shell=document.getElementById('appShell');return !!shell&&!shell.classList.contains('hidden')};
const key=row=>String(row.pncp_id||row.payload?.pncp_id||row.id);
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
 const row=group.rows[0],p=row.payload||{},urgent=urgency(row),url=safeUrl(p.pncp_url)||safeUrl(p.origin_url);
 const card=el('article','radar-notice rp-notice');card.dataset.deliveryId=String(row.id);card.dataset.kind=urgent?'urgent':'new';card.setAttribute('aria-label','Notificação do Radar Pulse');
 const header=el('header','rp-notice-header'),icon=el('span','rp-notice-icon');icon.setAttribute('aria-hidden','true');
 const copy=el('div','rp-notice-heading');copy.append(el('span','rp-notice-brand','RADAR PULSE'),el('strong','rp-notice-type',urgent?'Encerramento em até 24h':'Nova oportunidade detectada'));
 const close=el('button','radar-notice-close','×');close.type='button';close.setAttribute('aria-label','Dispensar notificação sem marcar como lida');header.append(icon,copy,close);
 const title=el('strong','radar-notice-title',text(p.object)||'Oportunidade compatível com seu alerta');title.title=title.textContent;
 const meta=[text(p.modality),[text(p.municipality),text(p.uf)].filter(Boolean).join('/')].filter(Boolean).join(' • ');
 const org=text(p.org);
 const alerts=[...new Set(group.rows.map(r=>text(r.alert_name||r.payload?.alert_name)).filter(Boolean))];
 const footer=el('div','radar-notice-footer'),mark=el('button','rp-notice-mark','Marcar como lida');mark.type='button';
 if(url){const link=el('a','radar-notice-link','Ver oportunidade ↗');link.href=url;link.target='_blank';link.rel='noopener noreferrer';footer.append(link);link.addEventListener('click',()=>{markRows(group.rows).catch(()=>{})})}
 footer.append(mark);
 const progress=el('div','rp-notice-progress'),bar=el('div','rp-notice-progress-bar');progress.setAttribute('aria-hidden','true');progress.append(bar);
 card.append(header,title);if(meta)card.append(el('div','radar-notice-meta',meta));if(org)card.append(el('div','rp-notice-org',org));
 if(alerts.length)card.append(el('span','radar-notice-alert',alerts[0]+(alerts.length>1?' +'+(alerts.length-1)+' alerta(s)':'') ));if(group.rows.length>1)card.append(el('small','rp-notice-group',group.rows.length+' alertas para esta oportunidade'));
 const status=el('small','rp-notice-status');status.setAttribute('role','status');card.append(footer,status,progress);
 return {card,close,mark,bar,status};
}
function overlayOpen(){return Boolean(document.querySelector('#ai-assistant.ai-widget-open,#revNotifPanel:not([hidden]),#radarAccount[open]'))}
function syncOverlay(){const h=document.getElementById('rlbNationalNoticeHost');if(h)h.hidden=overlayOpen();active?.refreshPause();if(!overlayOpen())displayNext()}
function schedule(){clearTimeout(nextTimer);if(logged()&&!document.hidden)nextTimer=setTimeout(()=>{nextTimer=null;displayNext()},COOLDOWN_MS)}
function displayNext(){
 if(active||!queue.length||!logged()||document.hidden||overlayOpen())return;
 const group=queue.shift(),{card,close,mark,bar,status}=createCard(group);
 let remaining=DISPLAY_MS,started=0,timeout=null,paused=false,finished=false,marking=false;const generation=epoch;
 function stopClock(){if(timeout!==null){clearTimeout(timeout);timeout=null;remaining=Math.max(0,remaining-(performance.now()-started));}bar.style.transition='none';bar.style.transform='scaleX('+remaining/DISPLAY_MS+')'}
 function finish(){if(finished)return;finished=true;stopClock();if(active?.card===card)active=null;card.remove();schedule()}
 function resume(){if(finished||timeout!==null||document.hidden||paused||marking||overlayOpen())return;started=performance.now();bar.style.transition=matchMedia('(prefers-reduced-motion: reduce)').matches?'none':'transform '+remaining+'ms linear';bar.style.transform='scaleX(0)';timeout=setTimeout(finish,remaining)}
 function refreshPause(){paused=card.matches(':hover, :focus-within');if(paused||document.hidden||marking||overlayOpen())stopClock();else resume()}
 active={card,group,finish,refreshPause};const region=host();region.hidden=false;region.append(card);chime();
 card.addEventListener('pointerenter',refreshPause);card.addEventListener('pointerleave',()=>{paused=card.matches(':focus-within');if(!paused&&!document.hidden)resume()});card.addEventListener('focusin',refreshPause);card.addEventListener('focusout',()=>setTimeout(refreshPause,0));
 close.addEventListener('click',finish);
 mark.addEventListener('click',async()=>{marking=true;stopClock();mark.disabled=true;try{if(await markRows(group.rows)){if(generation===epoch)finish()}else if(generation===epoch)status.textContent='Não foi possível confirmar toda a leitura. Tente novamente.'}finally{marking=false;mark.disabled=false;if(!finished)refreshPause()}});
 requestAnimationFrame(()=>{if(!finished)refreshPause()});
}
function mergeBatch(rows){
 for(const row of rows){if(row.read_at||row.id==null)continue;const id=String(row.id);if(seen.has(id))continue;const k=key(row);let group=queue.find(x=>x.key===k);if(!group&&queue.length>=MAX_QUEUE)continue;if(!group){group={key:k,rows:[]};queue.push(group)}group.rows.push(row);seen.add(id)}
 while(seen.size>2000)seen.delete(seen.values().next().value);
 queue.sort((a,b)=>Number(urgency(b.rows[0]))-Number(urgency(a.rows[0])));
}
async function loadBatch(){if(loading||document.hidden||!logged())return;const e=epoch,revision=readRevision;loading=true;try{const limit=Math.min(30,MAX_QUEUE-queue.length);if(limit<=0)return;const d=await api('/api/stability/notifications/onsite?limit='+limit+'&after='+encodeURIComponent(afterId));if(e!==epoch||revision!==readRevision||!logged())return;const batch=Array.isArray(d.items)?d.items:[];mergeBatch(batch);if(batch.length)afterId=String(batch[batch.length-1].id);if(!active&&!nextTimer)displayNext()}catch(e){if(!/401/.test(String(e.message)))console.warn('RLB onsite personalized:',e?.message||e)}finally{loading=false}}
function clearRead(event){readRevision++;const ids=new Set((event.detail?.ids||[]).map(String));if(event.detail?.all){queue=[];active?.finish();return}queue=queue.map(g=>({...g,rows:g.rows.filter(r=>!ids.has(String(r.id)))})).filter(g=>g.rows.length);if(active&&active.group.rows.every(r=>ids.has(String(r.id))))active.finish()}
function syncSession(){const current=logged();if(current===wasLogged)return;wasLogged=current;epoch++;afterId='0';readRevision++;clearTimeout(nextTimer);nextTimer=null;queue=[];seen.clear();active?.finish();clearTimeout(nextTimer);nextTimer=null;sound=false;if(current)setTimeout(loadBatch,900)}
function start(){const watcher=new MutationObserver(syncOverlay);for(const selector of ['#ai-assistant','#revNotifPanel','#radarAccount']){const target=document.querySelector(selector);if(target)watcher.observe(target,{attributes:true,attributeFilter:['class','hidden','open']})}wasLogged=logged();setTimeout(loadBatch,FIRST_LOAD_MS);setInterval(loadBatch,LOAD_INTERVAL_MS);const shell=document.getElementById('appShell');if(shell)new MutationObserver(syncSession).observe(shell,{attributes:true,attributeFilter:['class']});document.addEventListener('visibilitychange',()=>{active?.refreshPause();if(!document.hidden){clearTimeout(nextTimer);nextTimer=null;displayNext();loadBatch()}});document.addEventListener('radar:notifications-refresh',loadBatch);document.addEventListener('radar:notification-read',clearRead)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
