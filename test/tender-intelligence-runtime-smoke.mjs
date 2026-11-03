import assert from 'node:assert/strict';

const base='http://127.0.0.1:10000';
async function get(path,opt={}){return fetch(base+path,{redirect:'manual',...opt})}
async function wait(){for(let i=0;i<40;i++){try{const r=await get('/api/health');if(r.ok)return}catch{}await new Promise(r=>setTimeout(r,250))}throw new Error('Servidor não ficou pronto')}

await wait();
const jsRes=await get('/assets/source-transparency-v1.js');
const cssRes=await get('/assets/source-transparency-v1.css');
assert.equal(jsRes.status,200);
assert.equal(cssRes.status,200);
assert.equal(jsRes.headers.get('x-rlb-tender-intelligence'),'v2.2');
assert.equal(jsRes.headers.get('x-rlb-tender-source-resilience'),'v2');
const js=await jsRes.text();
const css=await cssRes.text();
assert.match(js,/__rlbTenderIntelligenceV2/);
assert.match(js,/Análise completa do edital/);
assert.match(js,/Evidências confirmadas/);
assert.match(js,/Revisão dupla/);
assert.match(js,/\/api\/tender-intelligence\/analyze/);
assert.match(js,/__rlbSourceTransparency/);
assert.match(js,/__rlbTenderSourceFallbackV2/);
assert.match(js,/Continuar sem depender do PNCP/);
assert.match(js,/\/api\/tender-intelligence\/upload-source/);
assert.match(js,/__rlbTenderComplianceMatrixV2/);
assert.match(js,/matriz empresa × edital/i);
assert.match(js,/\/api\/tender-compliance-matrix\/analyze/);
assert.match(js,/Confiabilidade/);
assert.match(css,/\.tender-ai-trigger/);
assert.match(css,/\.tai-modal/);
assert.match(css,/html\[data-theme="dark"\] \.tai-modal/);
assert.match(css,/html:not\(\[data-theme="dark"\]\) \.tai-modal/);
assert.match(css,/var\(--surface/);
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

const uploadNoAuth=await get('/api/tender-intelligence/upload-source',{method:'POST',headers:{'content-type':'application/json',origin:base},body:payload});
assert.equal(uploadNoAuth.status,401,'upload temporário exige sessão autenticada');
const uploadCross=await get('/api/tender-intelligence/upload-source',{method:'POST',headers:{'content-type':'application/json',origin:'https://cross-origin.invalid'},body:payload});
assert.equal(uploadCross.status,403,'upload temporário mantém proteção de origem');

const matrixNoAuth=await get('/api/tender-compliance-matrix/analyze',{method:'POST',headers:{'content-type':'application/json',origin:base},body:payload});
assert.equal(matrixNoAuth.status,401,'matriz Empresa × Edital exige sessão autenticada');
const matrixCross=await get('/api/tender-compliance-matrix/analyze',{method:'POST',headers:{'content-type':'application/json',origin:'https://cross-origin.invalid'},body:payload});
assert.equal(matrixCross.status,403,'matriz Empresa × Edital mantém proteção de origem');
console.log('tender intelligence v2.4 runtime smoke passed: report, multifonte, PDF fallback, compliance matrix, precision and origin guards active');
