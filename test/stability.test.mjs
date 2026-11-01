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

test('live Radar feed excludes expired and unknown-deadline opportunities',()=>{
  const s=read('live-monitor-v5.mjs');
  assert.match(s,/closes_at IS NOT NULL AND closes_at>=NOW\(\)/);
  assert.match(s,/active_feed_only:true/);
  assert.match(s,/fetchPncpRange/);
});

test('search is active-only, local-first and refreshes official PNCP open proposals in background',()=>{
  const router=read('search-router-v3.mjs');
  const client=read('pncp-client-v3.mjs');
  assert.match(router,/closes_at IS NOT NULL/);
  assert.match(router,/closes_at >= NOW\(\)/);
  assert.match(router,/strategy:'active-local-first'/);
  assert.match(router,/refreshOpenIndex\(f\)\.catch/);
  assert.match(router,/active_only:true/);
  assert.match(client,/\/v1\/contratacoes\/proposta/);
  assert.match(client,/fetchPncpOpenSearch/);
});

test('search UI defaults to active opportunities and does not offer expired results mode',()=>{
  const html=read('app-v2.html');
  const ui=read('search-results-v2.js');
  assert.match(html,/value="0" selected>Todas as ativas/);
  assert.match(html,/Somente oportunidades com prazo vigente/);
  assert.equal(html.includes('id="searchOpenOnly"'),false);
  assert.match(ui,/não exibe processos cujo prazo já terminou/);
});

test('source transparency distinguishes PNCP from external platform links',()=>{
  const html=read('app-v2.html');
  const source=read('source-transparency-v1.js');
  const css=read('source-transparency-v1.css');
  const server=read('production-v17.mjs');
  assert.match(html,/source-transparency-v1\.css\?v=2114/);
  assert.match(html,/source-transparency-v1\.js\?v=2114/);
  assert.match(html,/app-v2\.js\?v=20261101-1/);
  assert.match(source,/Fonte oficial: PNCP/);
  assert.match(source,/Ir para plataforma ↗/);
  assert.match(source,/Ver no PNCP ↗/);
  assert.match(source,/host==='pncp\.gov\.br'/);
  assert.equal(source.includes("!/^https?:\\/\\//i.test(raw)"),true);
  assert.match(source,/Portal de Compras Públicas/);
  assert.match(source,/Compras\.gov\.br/);
  assert.match(source,/Transparência da oportunidade/);
  assert.match(source,/Acesso direto à plataforma não informado pelo PNCP/);
  assert.match(source,/rlb-live-source-actions/);
  assert.match(source,/referrerPolicy='no-referrer'/);
  assert.match(source,/dataset\.rlbSourceKey/);
  assert.match(source,/existing\?\.dataset\.rlbSourceKey===key/);
  assert.match(source,/a\.addEventListener\('click',event=>event\.stopPropagation\(\)\)/);
  assert.match(source,/a\.addEventListener\('pointerdown',event=>event\.stopPropagation\(\)\)/);
  assert.equal(source.includes('legacy.replaceWith(block)'),false);
  assert.match(source,/legacyOfficialLink/);
  assert.match(source,/link\.remove\(\)/);
  assert.equal(source.includes("card.querySelector('.rlb-source-transparency')?.remove()"),false);
  assert.equal(source.includes("row.querySelector('.rlb-live-source')?.remove()"),false);
  assert.match(css,/pointer-events:auto!important/);
  assert.match(css,/z-index:5/);
  assert.match(css,/transform:none!important/);
  assert.match(css,/\.tr-quick-badge:hover/);
  assert.match(css,/\.tender-ready-trigger:hover/);
  assert.match(server,/frontend:'2\.11\.4'/);
  assert.match(server,/source_transparency:'v1\.3'/);
  assert.match(server,/card_integration:'non-destructive-self-healing'/);
});

test('readiness controls self-heal after other card modules mutate the DOM',()=>{
  const full=read('tender-readiness-v1.js');
  const quick=read('tender-readiness-quick-v1.js');
  assert.match(full,/const existing=card\.querySelector\('\.tender-ready-trigger'\)/);
  assert.match(full,/delete card\.dataset\.readinessEnhanced/);
  assert.match(full,/card\.appendChild\(trigger\)/);
  assert.match(quick,/const current=\[\.\.\.card\.querySelectorAll\('\.tr-quick-badge'\)\]/);
  assert.match(quick,/delete card\.dataset\.quickReadinessEnhanced/);
  assert.match(quick,/cache\.has\(key\.key\).*renderBadge/);
  assert.match(quick,/markLoadingForRetry/);
});

test('document upload hardening validates signatures and blocks executables',()=>{
  const s=read('production-v23.mjs');
  assert.match(s,/%PDF-/);
  assert.match(s,/0xff&&buf\[1\]===0xd8/);
  assert.match(s,/0x89,0x50,0x4e,0x47/);
  assert.match(s,/executable_upload_blocked/);
  assert.match(s,/invalid_upload_signature/);
});
