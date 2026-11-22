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

test('frontend script cache keys are refreshed with the performance fix',()=>{
  const html=read('app-v2.html');
  assert.match(html,/app-v2\.js\?v=20261122-performance-1/);
  assert.match(html,/stability-ui-v1\.js\?v=20261122-performance-1/);
});
