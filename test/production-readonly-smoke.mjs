import assert from 'node:assert/strict';

const base='https://radar-licitacoes-brasil-app.onrender.com';

async function get(path,{expected=200,accept='application/json'}={}){
  let lastError;
  for(let i=0;i<5;i++){
    try{
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),20000);
      const response=await fetch(base+path,{headers:{accept},cache:'no-store',redirect:'follow',signal:controller.signal});
      clearTimeout(timer);
      const text=await response.text();
      if(response.status!==expected)throw new Error(`${path}: expected ${expected}, got ${response.status}: ${text.slice(0,300)}`);
      return {response,text};
    }catch(error){
      lastError=error;
      if(i<4)await new Promise(r=>setTimeout(r,2500));
    }
  }
  throw lastError;
}

const root=await get('/',{accept:'text/html'});
assert.match(root.response.headers.get('content-type')||'',/text\/html/i);
assert.ok(root.text.length>1000,'home HTML deve ter conteúdo substancial');
assert.match(root.text,/app-v2\.js/,'home deve carregar app-v2.js');

const health=JSON.parse((await get('/api/health')).text);
assert.equal(health.ok,true,'/api/health deve responder ok=true');

const security=JSON.parse((await get('/api/security/origin-health')).text);
assert.equal(security.ok,true);
assert.equal(security.guard,'v1');
assert.equal(security.runtime,'2.11.6');
assert.equal(security.frontend_delivery,'composed-runtime-chain');

const uiBuild=JSON.parse((await get('/api/ui-build')).text);
assert.equal(uiBuild.ok,true);

const publicConfig=JSON.parse((await get('/api/public-config')).text);
assert.equal(typeof publicConfig,'object');

const js=await get('/assets/app-v2.js',{accept:'application/javascript'});
for(const marker of ['__rlbCompanyDocumentsV1','habilitationNav','view-habilitation','__rlbCompanyVerificationV1','__rlbTenderReadinessQuickV1']){
  assert.ok(js.text.includes(marker),`bundle público deve conter ${marker}`);
}

const css=await get('/assets/app-v2.css',{accept:'text/css'});
for(const marker of ['.habilitation-view','.hab-nav-badge'])assert.ok(css.text.includes(marker),`CSS público deve conter ${marker}`);

await get('/api/me',{expected:401});
await get('/api/company-documents/summary',{expected:401});

console.log('production read-only smoke: public Render endpoint, health, security, Habilitação assets and auth guards passed');
