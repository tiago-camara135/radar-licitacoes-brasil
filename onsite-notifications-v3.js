(()=>{
'use strict';
if(window.__rlbOnsiteNotificationsV4)return;window.__rlbOnsiteNotificationsV4=true;
const DISPLAY_MS=7000,COOLDOWN_MS=30000,LOAD_INTERVAL_MS=60000,FIRST_LOAD_MS=2500;
let queue=[],queued=new Set(),active=null,loading=false,timer=null;
const text=v=>String(v??'').trim();
function host() {
  let region = document.getElementById('rlbNationalNoticeHost');
  if (!region) {
    region = document.createElement('div');
    region.id = 'rlbNationalNoticeHost';
    region.setAttribute('aria-live', 'polite');
    document.body.appendChild(region);
  }
  return region;
}
async function api(path,opt={}){const r=await fetch(path,{credentials:'same-origin',cache:'no-store',...opt,headers:{accept:'application/json',...(opt.body?{'content-type':'application/json'}:{}),...(opt.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`Erro ${r.status}`);return d}
async function markRead(id){try{await api(`/api/stability/notifications/onsite/${id}/read`,{method:'POST',body:'{}'})}catch{}}
function noticeText(tag, className, value) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = value;
  return element;
}

function noticeUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

function createCard(row) {
  const p = row.payload || {};
  const url = noticeUrl(p.pncp_url) || noticeUrl(p.origin_url);
  const card = document.createElement('article');
  card.className = 'radar-notice';
  card.dataset.deliveryId = String(row.id);

  const icon = noticeText('span', 'radar-notice-icon', '');
  icon.setAttribute('aria-hidden','true');
  icon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 6-3 7-3 9h18c0-2-3-3-3-9ZM10 21h4"/></svg>';
  const eyebrow = noticeText('span', 'radar-notice-label', 'Oportunidade compatível');
  const close = noticeText('button', 'radar-notice-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label','Fechar notificação');
  const title = noticeText('strong', 'radar-notice-title', text(p.object) || 'Nova oportunidade compatível com seu alerta.');
  const meta = [text(p.org), [text(p.municipality),text(p.uf)].filter(Boolean).join('/')].filter(Boolean).join(' · ');
  const alertName = text(row.alert_name || p.alert_name);
  card.append(icon, eyebrow, close, title);
  if (meta) card.append(noticeText('div', 'radar-notice-meta', meta));
  if (alertName || url) {
    const footer = noticeText('footer', 'radar-notice-footer', '');
    if (alertName) footer.append(noticeText('span', 'radar-notice-alert', alertName));
    if (url) {
      const link = noticeText('a', 'radar-notice-link', 'Ver oportunidade ↗');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      footer.append(link);
    }
    card.append(footer);
  }
  return { card, close };
}

function displayNext() {
  if (active || !queue.length) return;
  const row = queue.shift();
  queued.delete(String(row.id));
  const { card, close } = createCard(row);
  active = card;
  host().appendChild(card);
  markRead(row.id);

  const finish = () => {
    if (active !== card) return;
    active = null;
    card.remove();
    setTimeout(displayNext, COOLDOWN_MS);
  };
  const expire = () => {
    if (active !== card) return;
    if (card.matches(':hover, :focus-within')) setTimeout(expire, 1000);
    else finish();
  };
  close.addEventListener('click', finish);
  setTimeout(expire, DISPLAY_MS);
}
async function loadBatch(){if(loading||document.hidden)return;loading=true;try{const shell=document.getElementById('appShell');if(!shell||shell.classList.contains('hidden'))return;const d=await api('/api/stability/notifications/onsite?limit=30');for(const row of d.items||[]){const k=String(row.id);if(!queued.has(k)&&String(active?.dataset.deliveryId||'')!==k){queue.push(row);queued.add(k)}}displayNext()}catch(e){if(!/401/.test(String(e.message)))console.warn('RLB onsite personalized:',e?.message||e)}finally{loading=false}}
function start(){setTimeout(loadBatch,FIRST_LOAD_MS);timer=setInterval(loadBatch,LOAD_INTERVAL_MS);const shell=document.getElementById('appShell');if(shell)new MutationObserver(()=>{if(!shell.classList.contains('hidden'))setTimeout(loadBatch,900)}).observe(shell,{attributes:true,attributeFilter:['class']});document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadBatch()})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
