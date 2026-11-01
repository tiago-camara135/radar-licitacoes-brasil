import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('stability UI does not use global propagation blockers',()=>{
  const s=read('stability-ui-v1.js');
  assert.equal(s.includes('stopImmediatePropagation'),false);
  assert.equal(s.includes("document.addEventListener('click'"),true);
});

test('personalized onsite notifications use delivery queue, not national live feed',()=>{
  const s=read('onsite-notifications-v3.js');
  assert.match(s,/api\/stability\/notifications\/onsite/);
  assert.equal(s.includes('/api/live-feed'),false);
});

test('subscription entitlements enforce alerts, documents and AI',()=>{
  const s=read('production-v21.mjs');
  assert.match(s,/alert_limit_reached/);
  assert.match(s,/document_limit_reached/);
  assert.match(s,/ai_daily_limit_reached/);
  assert.match(s,/subscription_inactive/);
});

test('readiness button remains in normal document flow',()=>{
  const s=read('tender-readiness-v1.css');
  assert.match(s,/has-readiness-trigger>\.tender-ready-trigger\{position:static/);
});

test('live monitor uses resilient PNCP client',()=>{
  const s=read('live-monitor-v5.mjs');
  assert.match(s,/fetchPncpRange/);
  assert.match(s,/pncp-client-v3-resilient/);
});
