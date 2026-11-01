import assert from 'node:assert/strict';

const base=String(process.env.RLB_TEST_BASE_URL||'http://127.0.0.1:10000').replace(/\/$/,'');

async function waitForServer(){
  for(let i=0;i<40;i++){
    try{
      const r=await fetch(base+'/api/health',{headers:{accept:'application/json'}});
      if(r.ok)return;
    }catch{}
    await new Promise(r=>setTimeout(r,500));
  }
  throw new Error('Servidor não ficou disponível para o smoke do frontend.');
}

await waitForServer();

const jsResponse=await fetch(base+'/assets/app-v2.js',{headers:{accept:'application/javascript'},cache:'no-store'});
assert.equal(jsResponse.status,200,'app-v2.js deve ser servido');
const js=await jsResponse.text();
for(const marker of ['__rlbCompanyDocumentsV1','habilitationNav','view-habilitation','__rlbCompanyVerificationV1','__rlbTenderReadinessQuickV1']){
  assert.ok(js.includes(marker),`bundle servido deve conter ${marker}`);
}

const cssResponse=await fetch(base+'/assets/app-v2.css',{headers:{accept:'text/css'},cache:'no-store'});
assert.equal(cssResponse.status,200,'app-v2.css deve ser servido');
const css=await cssResponse.text();
for(const marker of ['.habilitation-view','.hab-nav-badge']){
  assert.ok(css.includes(marker),`CSS servido deve conter ${marker}`);
}

const healthResponse=await fetch(base+'/api/security/origin-health',{headers:{accept:'application/json'},cache:'no-store'});
assert.equal(healthResponse.status,200);
const health=await healthResponse.json();
assert.equal(health.runtime,'2.11.6');
assert.equal(health.frontend_delivery,'composed-runtime-chain');

console.log('frontend runtime smoke: composed Habilitação, verification and readiness assets passed');
