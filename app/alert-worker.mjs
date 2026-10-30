import { readFile, writeFile, rename, chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { searchOpportunities } from './server.mjs';

const DATA_DIR=process.env.DATA_DIR||fileURLToPath(new URL('./data/',import.meta.url));
const files={alerts:join(DATA_DIR,'alerts.json'),users:join(DATA_DIR,'users.json'),notifications:join(DATA_DIR,'notifications.json'),settings:join(DATA_DIR,'settings.json')};
const read=async(u,f=[])=>{try{return JSON.parse(await readFile(u,'utf8'))}catch{return structuredClone(f)}};
const write=async(u,v)=>{const tmp=`${u}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;await writeFile(tmp,JSON.stringify(v,null,2),{mode:0o600});await rename(tmp,u);try{await chmod(u,0o600)}catch{}};
const API=process.env.RESEND_API_KEY||'';
const FROM=process.env.ALERT_FROM||'Radar Licitações Brasil <onboarding@resend.dev>';
const SITE_URL=process.env.APP_ORIGIN||'';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>v?Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'Valor não informado';
async function sendEmail(to,subject,html){if(!API){console.log('[ALERTA SEM ENVIO - configure RESEND_API_KEY]',to,subject);return false}const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${API}`,'content-type':'application/json'},body:JSON.stringify({from:FROM,to:[to],subject,html})});if(!r.ok)throw new Error(`Resend HTTP ${r.status}: ${await r.text()}`);return true}

export async function runDailyAlerts(){
  const now=new Date();const [alerts,users,notifications,settings]=await Promise.all([read(files.alerts),read(files.users),read(files.notifications),read(files.settings,{dailyAlertsEnabled:true})]);
  if(settings.dailyAlertsEnabled===false)return{ok:true,skipped:true,reason:'disabled'};
  let processed=0,found=0,emails=0,errors=0;
  for(const a of alerts){
    if(!a.enabled)continue;const user=users.find(u=>u.id===a.userId&&u.active);if(!user)continue;processed++;
    const from=a.lastRun?a.lastRun.slice(0,10):new Date(now.getTime()-86400000).toISOString().slice(0,10);const filters={...(a.filters||{}),status:'published',from,to:now.toISOString().slice(0,10),pages:a.filters?.pages||2};
    try{const r=await searchOpportunities(filters),seen=new Set(a.seenIds||[]),fresh=r.items.filter(x=>!seen.has(x.id)).slice(0,50);found+=fresh.length;
      if(fresh.length){const cards=fresh.map(x=>`<div style="padding:16px 0;border-bottom:1px solid #e5e7eb"><div style="font-size:12px;color:#2563eb;font-weight:700">${esc(x.modality||'Contratação')} · ${esc([x.city,x.uf].filter(Boolean).join('/'))}</div><h3 style="margin:6px 0 8px;font-size:16px;color:#0f172a">${esc(x.object||x.title)}</h3><div style="font-size:13px;color:#475569">${esc(x.agency)} · ${money(x.estimatedValue)}</div><div style="margin-top:10px"><a href="${esc(x.detailUrl)}" style="color:#2563eb;font-weight:700">Abrir fonte oficial</a>${SITE_URL?` · <a href="${esc(SITE_URL)}" style="color:#7c3aed;font-weight:700">Abrir Radar</a>`:''}</div></div>`).join('');const html=`<div style="font-family:Arial,sans-serif;max-width:720px;margin:auto"><div style="background:linear-gradient(135deg,#071429,#113a77);padding:24px;border-radius:18px 18px 0 0;color:white"><div style="font-size:12px;letter-spacing:.12em;color:#5eead4;font-weight:700">RADAR LICITAÇÕES BRASIL</div><h2 style="margin:8px 0 0">${fresh.length} nova(s) oportunidade(s)</h2><p style="color:#cbd5e1">Alerta: ${esc(a.name)}</p></div><div style="padding:0 24px 24px;background:#fff">${cards}</div></div>`;const sent=await sendEmail(user.email,`Radar Licitações: ${fresh.length} nova(s) oportunidade(s)`,html);if(sent)emails++;notifications.unshift({id:randomUUID(),userId:user.id,alertId:a.id,createdAt:now.toISOString(),read:false,title:`${fresh.length} nova(s) oportunidade(s)`,message:`O alerta “${a.name}” encontrou novas licitações.`,items:fresh.slice(0,15),emailSent:sent});a.seenIds=[...fresh.map(x=>x.id),...(a.seenIds||[])].slice(0,500)}a.lastRun=now.toISOString();a.lastError=null;
    }catch(e){errors++;a.lastError=e.message;console.error('Falha alerta',a.id,e.message)}
  }
  await Promise.all([write(files.alerts,alerts),write(files.notifications,notifications.slice(0,3000))]);return{ok:true,processed,found,emails,errors,at:now.toISOString()};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){const r=await runDailyAlerts();console.log(JSON.stringify(r));}
