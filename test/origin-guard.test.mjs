import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('production starts through global origin guard',()=>{
  const pkg=JSON.parse(read('package.json'));
  const guard=read('production-v24.mjs');
  assert.equal(pkg.version,'2.11.5');
  assert.equal(pkg.scripts.start,'node production-v24.mjs');
  assert.match(guard,/await import\('\.\/production-v23\.mjs'\)/);
  assert.match(guard,/origin_not_authorized/);
  assert.match(guard,/x-forwarded-proto/);
  assert.match(guard,/req\.headers\.host/);
  assert.match(guard,/trustedByHost/);
  assert.match(guard,/trustedByConfig/);
  assert.match(guard,/process\.env\.APP_ORIGIN=primaryConfiguredOrigin/);
  assert.match(guard,/req\.headers\.origin=primaryConfiguredOrigin/);
  assert.match(guard,/\/api\/security\/origin-health/);
});

test('browser-origin smoke covers the real Chrome regression',()=>{
  const smoke=read('test/browser-origin-smoke.mjs');
  assert.match(smoke,/headers\.origin=requestOrigin/);
  assert.match(smoke,/origin_not_authorized/);
  assert.match(smoke,/\/api\/company-documents/);
  assert.match(smoke,/\/api\/tender-readiness-quick\/score/);
  assert.match(smoke,/\/api\/tender-readiness\/analyze/);
});
