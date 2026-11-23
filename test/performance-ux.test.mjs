import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('main app requests time out and live feed refresh is single-flight',()=>{
  const app=read('app-v2.js');
  assert.match(app,/timeoutMs=15000/);
  assert.match(app,/state\.livePromise/);
  assert.match(app,/api\('\/api\/live-feed\?limit=40',\{timeoutMs:12000\}\)/);
  assert.match(app,/state\.sse\.readyState!==EventSource\.OPEN/);
  assert.match(app,/timeoutMs:60000/);
});

test('search renders opportunities in small batches instead of building thousands of cards at once',()=>{
  const ui=read('stability-ui-v1.js');
  assert.match(ui,/SEARCH_PAGE_SIZE=30/);
  assert.match(ui,/searchItems\.slice\(searchVisible,searchVisible\+SEARCH_PAGE_SIZE\)/);
  assert.match(ui,/rlb-search-more/);
  assert.match(ui,/renderSearch\(searchItems,true\)/);
});

test('search requests abort after a bounded wait and display a retry action',()=>{
  const ui=read('stability-ui-v1.js');
  assert.match(ui,/timedOut=true;controller\.abort\(\)/);
  assert.match(ui,/20000/);
  assert.match(ui,/A pesquisa está demorando mais do que o esperado/);
  assert.match(ui,/rlb-search-retry-action/);
  assert.match(ui,/timeoutMs=12000/);
});

test('frontend script cache keys identify the deployed revisions',()=>{
  const html=read('app-v2.html');
  assert.match(html,/app-v2\.js\?v=20261122-live-source-2/);
  assert.match(html,/stability-ui-v1\.js\?v=20261122-performance-1/);
});


test('dashboard loads independent account summaries concurrently',()=>{
  const backend=read('user-dashboard-v1.mjs');
  assert.ok(backend.includes('const [prefs,health,tracked,ai,alertRows,companyRows]=await Promise.all(['));
  assert.ok(backend.includes('recs=await recommendations(uid,health.map,geo)'));
});

test('secondary account and habilitation screens bound API wait time',()=>{
  for(const file of ['user-dashboard-v1.js','admin-user-support-v1.js','company-documents-v1.js','company-verification-v1.js','tender-readiness-v1.js']){
    assert.match(read(file),/timeoutMs=15000/,file);
  }
  assert.ok(read('tender-readiness-quick-v1.js').includes('setTimeout(()=>controller.abort(),12000)'));
  assert.ok(read('tender-readiness-quick-v1.js').includes("$$('.tr-quick-badge.loading')"));
  assert.ok(read('tender-readiness-quick-v1.js').includes("$$('.tr-quick-badge')"));
});

 
test('long-running AI, readiness and document upload operations receive appropriate time budgets',()=>{
  assert.match(read('tender-intelligence-v2.js'),/timeoutMs:90000/);
  assert.match(read('tender-readiness-v1.js'),/timeoutMs:60000/);
  assert.match(read('company-documents-v1.js'),/timeoutMs:60000/);
});
