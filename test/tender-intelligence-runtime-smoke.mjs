import assert from 'node:assert/strict';

const base='http://127.0.0.1:10000';
async function get(path,opt={}){return fetch(base+path,{redirect:'manual',...opt})}
async function wait(){for(let i=0;i<40;i++){try{const r=await get('/api/health');if(r.ok)return}catch{}await new Promise(r=>setTimeout(r,250))}throw new Error('Servidor não ficou pronto')}

await wait();
const js=await (await get('/assets/app-v2.js')).text();
const css=await (await get('/assets/app-v2.css')).text();
assert.match(js,/__rlbTenderIntelligenceV1/);
assert.match(js,/Analisar edital com IA/);
assert.match(js,/\/api\/tender-intelligence\/analyze/);
assert.match(css,/\.tender-ai-trigger/);
assert.match(css,/\.tai-modal/);

const unauth=await get('/api/tender-intelligence/analyze',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cnpj:'00000000000000',year:2026,sequence:1})});
assert.equal(unauth.status,401);
const body=await unauth.json();
assert.match(String(body.error||''),/login/i);
console.log('tender intelligence runtime smoke passed');
