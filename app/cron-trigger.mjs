const origin=(process.env.APP_ORIGIN||'').replace(/\/$/,'');
const secret=process.env.CRON_SECRET||'';
if(!origin||!secret)throw new Error('Configure APP_ORIGIN e CRON_SECRET.');
const r=await fetch(`${origin}/api/internal/run-alerts`,{method:'POST',headers:{authorization:`Bearer ${secret}`}});
const text=await r.text();
if(!r.ok)throw new Error(`HTTP ${r.status}: ${text}`);
console.log(text);
