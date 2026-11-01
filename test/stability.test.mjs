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

test('subscription entitlements are authoritative for alerts, documents and AI',()=>{
  const s=read('production-v21.mjs');
  assert.match(s,/alert_limit_reached/);
  assert.match(s,/document_limit_reached/);
  assert.match(s,/ai_daily_limit_reached/);
  assert.match(s,/subscription_inactive/);
  assert.match(s,/createAlertWithPlan/);
  assert.match(s,/company_documents WHERE user_id=\$1 AND is_current=TRUE/);
  assert.match(s,/alert_limit_source:'subscription'/);
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

test('document upload hardening validates signatures and blocks executables',()=>{
  const s=read('production-v23.mjs');
  assert.match(s,/%PDF-/);
  assert.match(s,/0xff&&buf\[1\]===0xd8/);
  assert.match(s,/0x89,0x50,0x4e,0x47/);
  assert.match(s,/executable_upload_blocked/);
  assert.match(s,/invalid_upload_signature/);
});
