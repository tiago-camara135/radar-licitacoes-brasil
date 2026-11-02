import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {__test} from '../user-dashboard-v1.mjs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('dashboard v1 preserves runtime chain and is isolated by user',()=>{
  const pkg=JSON.parse(read('package.json'));
  const runtime=read('production-v30.mjs');
  const backend=read('user-dashboard-v1.mjs');
  const frontend=read('user-dashboard-v1.js');
  const css=read('user-dashboard-v1.css');
  assert.equal(pkg.version,'2.16.0');
  assert.equal(pkg.scripts.start,'node production-v30.mjs');
  assert.match(runtime,/await import\('\.\/production-v29\.mjs'\)/);
  assert.match(runtime,/handleUserDashboardRoute/);
  assert.match(runtime,/combinedStabilityJs/);
  assert.match(runtime,/X-RLB-User-Dashboard/);
  assert.match(backend,/saved_alerts a ON a\.user_id=\$1/);
  assert.match(backend,/WHERE t\.user_id=\$1/);
  assert.match(backend,/tender_intelligence_analyses WHERE user_id=\$1/);
  assert.match(backend,/company_documents WHERE user_id=\$1/);
  assert.match(backend,/DELETE FROM user_tender_tracking WHERE id=\$1 AND user_id=\$2/);
  assert.match(frontend,/data-view='dashboard'|data\.view='dashboard'|dataset\.view='dashboard'/);
  assert.match(frontend,/Oportunidades recomendadas/);
  assert.match(frontend,/Ações prioritárias/);
  assert.match(frontend,/Minhas licitações/);
  assert.match(frontend,/Análises recentes da IA-RLB/);
  assert.match(frontend,/Relatório assistivo\. Confirme requisitos críticos/);
  assert.match(css,/html:not\(\[data-theme="dark"\]\)/);
  assert.match(css,/html\[data-theme="dark"\]/);
  assert.match(css,/@media\(max-width:620px\)/);
});

test('tracking statuses and widgets are constrained',()=>{
  for(const x of ['analisar','preparando_documentacao','proposta_pronta','participando','recurso','vencida','perdida','arquivada'])assert.equal(__test.STATUSES.has(x),true);
  for(const x of ['recommendations','priorities','agenda','habilitation','tracking','funnel','ai'])assert.equal(__test.WIDGETS.has(x),true);
  assert.equal(__test.STATUSES.has('admin'),false);
  assert.equal(__test.WIDGETS.has('passwords'),false);
});

test('deterministic readiness penalizes missing and expired documents',()=>{
  const complete=new Map(__test.BASELINE.map(([type])=>[type,{doc_type:type,expiry_date:type==='cartao_cnpj'||type==='contrato_social'?null:'2099-12-31'}]));
  const all=__test.readinessFor(complete,'2026-11-02');
  assert.equal(all.score,100);assert.equal(all.blockers,0);
  const partial=new Map(complete);partial.delete('fgts');
  const p=__test.readinessFor(partial,'2026-11-02');
  assert.ok(p.score<100);assert.equal(p.missing,1);assert.equal(p.blockers,1);
  partial.set('fgts',{doc_type:'fgts',expiry_date:'2026-10-01'});
  const expired=__test.readinessFor(partial,'2026-11-02');
  assert.equal(expired.expired,1);assert.equal(expired.blockers,1);
});

test('recommendations remain grounded in real saved alerts and active procurement metadata',()=>{
  const backend=read('user-dashboard-v1.mjs');
  assert.match(backend,/m\.closes_at>=NOW\(\)/);
  assert.match(backend,/m\.object_text ILIKE '%'\|\|a\.keyword\|\|'%'/);
  assert.match(backend,/UPPER\(m\.uf\)=UPPER\(a\.uf\)/);
  assert.match(backend,/m\.municipality ILIKE '%'\|\|a\.municipality\|\|'%'/);
  assert.match(backend,/m\.modality_code=a\.modality_code/);
  assert.match(backend,/m\.estimated_value>=a\.min_value/);
  assert.match(backend,/m\.estimated_value<=a\.max_value/);
  assert.doesNotMatch(backend,/Math\.random\(/);
});
