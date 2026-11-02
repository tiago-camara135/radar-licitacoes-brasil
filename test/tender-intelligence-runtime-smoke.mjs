import assert from 'node:assert/strict';

const base='http://127.0.0.1:10000';
async function get(path,opt={}){return fetch(base+path,{redirect:'manual',...opt})}
async function wait(){for(let i=0;i<40;i++){try{const r=await get('/api/health');if(r.ok)return}catch{}await new Promise(r=>setTimeout(r,250))}throw new Error('Servidor não ficou pronto')}

await wait();
const jsRes=await get('/assets/source-transparency-v1.js');
const cssRes=await get('/assets/source-transparency-v1.css');
assert.equal(jsRes.status,200);
assert.equal(cssRes.status,200);
assert.equal(jsRes.headers.get('x-rlb-tender-intelligence'),'v1');
const js=await jsRes.text();
const css=await cssRes.text();
assert.match(js,/__rlbTenderIntelligenceV1/);
assert.match(js,/Analisar edital com IA/);
assert.match(js,/\/api\/tender-intelligence\/analyze/);
assert.match(js,/__rlbSourceTransparency/);
assert.match(css,/\.tender-ai-trigger/);
assert.match(css,/\.tai-modal/);
assert.match(css,/source-transparency/i);

const payload=JSON.stringify({cnpj:'00000000000000',year:2026,sequence:1});
const browserOrigin=await get('/api/tender-intelligence/analyze',{method:'POST',headers:{'content-type':'application/json',origin:base},body:payload});
assert.equal(browserOrigin.status,401,'origem do host real deve passar pelo guard e chegar à autenticação');
const browserBody=await browserOrigin.json();
assert.match(String(browserBody.error||''),/login/i);

const crossOrigin=await get('/api/tender-intelligence/analyze',{method:'POST',headers:{'content-type':'application/json',origin:'https://cross-origin.invalid'},body:payload});
assert.equal(crossOrigin.status,403,'origem externa deve permanecer bloqueada');
const crossBody=await crossOrigin.json();
assert.equal(crossBody.code,'origin_not_authorized');

const noOrigin=await get('/api/tender-intelligence/analyze',{method:'POST',headers:{'content-type':'application/json'},body:payload});
assert.equal(noOrigin.status,401,'cliente interno sem Origin continua compatível e autenticado pelo handler final');
console.log('tender intelligence runtime smoke passed: host real aceito, cross-origin bloqueado');
