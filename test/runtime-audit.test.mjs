import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('health endpoint performs a real PostgreSQL probe and fails closed',()=>{
  const runtime=read('production-v31.mjs');
  assert.match(runtime,/healthPool\.query\('SELECT 1 AS ok'\)/);
  assert.match(runtime,/database\.ok\?200:503/);
  assert.match(runtime,/postgresql-unavailable/);
  assert.match(runtime,/connectionTimeoutMillis:5000/);
  assert.match(runtime,/url\.pathname==='\/api\/health'/);
});

test('PNCP document requests use bounded retries and backend failover',()=>{
  const runtime=read('production-v31.mjs');
  const resilience=read('pncp-document-resilience-v1.mjs');
  assert.match(runtime,/installPncpDocumentResilience\(\)/);
  assert.match(resilience,/DEFAULT_PRIMARY_ATTEMPTS=3/);
  assert.match(resilience,/DEFAULT_FALLBACK_ATTEMPTS=2/);
  assert.match(resilience,/RETRYABLE_STATUSES=new Set\(\[408,425,429,500,502,503,504\]\)/);
  assert.match(resilience,/u\.hostname==='pncp\.gov\.br'/);
  assert.match(resilience,/u\.pathname\.startsWith\('\/api\/pncp\/'\)/);
  assert.match(resilience,/u\.pathname\.includes\('\/arquivos'\)/);
  assert.match(resilience,/replace\(\/\^\\\/api\\\/pncp\\\/\/,'\/pncp-api\/'\)/);
  assert.match(resilience,/pncp document fallback: gateway unavailable/);
  assert.match(resilience,/retry-after/);
  assert.match(resilience,/AbortSignal\.timeout\(ms\)/);
});

test('deployment configuration is aligned with the active Node runtime and health endpoint',()=>{
  const pkg=JSON.parse(read('package.json'));
  const render=read('render.yaml');
  assert.equal(pkg.engines.node,'24.x');
  assert.match(render,/healthCheckPath: \/api\/health/);
  assert.match(render,/key: NODE_VERSION\s+value: 24/);
  assert.doesNotMatch(render,/key: NODE_VERSION\s+value: 22/);
});
