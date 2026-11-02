import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('production starts through tender intelligence precision and reviewer resilience layers',()=>{
  const pkg=JSON.parse(read('package.json'));
  const runtime=read('production-v25.mjs');
  const precision=read('tender-intelligence-precision-v1.mjs');
  const resilience=read('gemini-reviewer-resilience-v1.mjs');
  const guard=read('production-v24.mjs');
  assert.equal(pkg.version,'2.13.2');
  assert.equal(pkg.scripts.start,'node production-v25.mjs');
  assert.match(runtime,/await import\('\.\/production-v24\.mjs'\)/);
  assert.match(runtime,/handleTenderIntelligencePrecisionRoute/);
  assert.match(runtime,/installGeminiReviewerResilience/);
  assert.match(runtime,/gemini-reviewer-resilience-v1\.mjs/);
  assert.match(runtime,/tender-intelligence-precision-v1\.mjs/);
  assert.match(runtime,/tender-intelligence-v2\.js/);
  assert.match(runtime,/tender-intelligence-v2\.css/);
  assert.match(precision,/handleTenderIntelligenceV2Route/);
  assert.match(precision,/authoritative_reconciliation/);
  assert.match(resilience,/SEGUNDA PASSAGEM DE AUDITORIA/);
  assert.match(resilience,/RETRYABLE_STATUS/);
  assert.match(resilience,/reviewerFallbackModels/);
  assert.match(runtime,/normalizeTenderOrigin/);
  assert.match(runtime,/configuredOrigins/);
  assert.match(runtime,/requestOrigin/);
  assert.match(runtime,/origin_not_authorized/);
  assert.match(guard,/await import\('\.\/production-v23\.mjs'\)/);
  assert.match(guard,/origin_not_authorized/);
  assert.match(guard,/x-forwarded-proto/);
  assert.match(guard,/req\.headers\.host/);
  assert.match(guard,/trustedByHost/);
  assert.match(guard,/trustedByConfig/);
  assert.match(guard,/process\.env\.APP_ORIGIN=primaryConfiguredOrigin/);
  assert.match(guard,/req\.headers\.origin=primaryConfiguredOrigin/);
  assert.match(guard,/\/api\/security\/origin-health/);
  assert.match(guard,/frontend_delivery:'composed-runtime-chain'/);
});

test('browser-origin smoke covers the real Chrome regression',()=>{
  const smoke=read('test/browser-origin-smoke.mjs');
  assert.match(smoke,/headers\.origin=requestOrigin/);
  assert.match(smoke,/origin_not_authorized/);
  assert.match(smoke,/\/api\/company-documents/);
  assert.match(smoke,/\/api\/tender-readiness-quick\/score/);
  assert.match(smoke,/\/api\/tender-readiness\/analyze/);
});
