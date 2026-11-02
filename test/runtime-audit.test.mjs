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

test('PNCP document requests use bounded retries for transient upstream failures',()=>{
  const runtime=read('production-v31.mjs');
  assert.match(runtime,/PNCP_MAX_ATTEMPTS=3/);
  assert.match(runtime,/PNCP_RETRYABLE=new Set\(\[408,425,429,500,502,503,504\]\)/);
  assert.match(runtime,/u\.hostname==='pncp\.gov\.br'/);
  assert.match(runtime,/u\.pathname\.startsWith\('\/api\/pncp\/'\)/);
  assert.match(runtime,/u\.pathname\.includes\('\/arquivos'\)/);
  assert.match(runtime,/retry-after/);
  assert.match(runtime,/AbortSignal\.timeout\(22000\)/);
});

test('deployment configuration is aligned with the active Node runtime and health endpoint',()=>{
  const pkg=JSON.parse(read('package.json'));
  const render=read('render.yaml');
  assert.equal(pkg.engines.node,'24.x');
  assert.match(render,/healthCheckPath: \/api\/health/);
  assert.match(render,/key: NODE_VERSION\s+value: 24/);
  assert.doesNotMatch(render,/key: NODE_VERSION\s+value: 22/);
});
