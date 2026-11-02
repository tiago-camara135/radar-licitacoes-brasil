import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {__test} from '../user-dashboard-v1.mjs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Dashboard e Minha Operação deixam de ser injetados sem remover backend e isolamento',()=>{
  const pkg=JSON.parse(read('package.json'));
  const runtime=read('production-v31.mjs');
  const backend=read('user-dashboard-v1.mjs');
  assert.equal(pkg.scripts.start,'node production-v31.mjs');
  assert.match(runtime,/await import\('\.\/production-v29\.mjs'\)/);
  assert.match(runtime,/handleUserDashboardRoute/);
  assert.match(runtime,/await initUserDashboard\(\)/);
  assert.doesNotMatch(runtime,/user-dashboard-v1\.js/);
  assert.doesNotMatch(runtime,/user-dashboard-v2\.js/);
  assert.doesNotMatch(runtime,/user-dashboard-v2\.css/);
  assert.doesNotMatch(runtime,/user-operation-pipeline-v1/);
  assert.match(backend,/saved_alerts a ON a\.user_id=\$1/);
  assert.match(backend,/WHERE t\.user_id=\$1/);
  assert.match(backend,/tender_intelligence_analyses WHERE user_id=\$1/);
  assert.match(backend,/company_documents WHERE user_id=\$1/);
  assert.match(backend,/DELETE FROM user_tender_tracking WHERE id=\$1 AND user_id=\$2/);
});

test('tracking statuses remain constrained and preserved in backend',()=>{
  for(const x of ['analisar','preparando_documentacao','proposta_pronta','participando','recurso','vencida','perdida','arquivada'])assert.equal(__test.STATUSES.has(x),true);
  assert.equal(__test.STATUSES.has('admin'),false);
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

test('geographic scope remains available in preserved backend',()=>{
  const brasil=__test.normalizeGeo({scope:'brasil',ufs:['RN']});
  assert.deepEqual(brasil,{scope:'brasil',region:null,ufs:[]});
  const nordeste=__test.normalizeGeo({scope:'regiao',region:'Nordeste'});
  assert.equal(nordeste.scope,'regiao');
  assert.ok(nordeste.ufs.includes('RN'));
  const ufs=__test.normalizeGeo({scope:'ufs',ufs:['rn','PB','SP','XX','RN']});
  assert.deepEqual(ufs,{scope:'ufs',region:null,ufs:['RN','PB','SP']});
});

test('recommendation and tracking backend remains deterministic and user-scoped',()=>{
  const backend=read('user-dashboard-v1.mjs');
  assert.match(backend,/m\.closes_at>=NOW\(\)/);
  assert.match(backend,/m\.object_text ILIKE '%'\|\|a\.keyword\|\|'%'/);
  assert.match(backend,/UPPER\(m\.uf\)=UPPER\(a\.uf\)/);
  assert.match(backend,/\$2::text\[\] IS NULL OR UPPER\(m\.uf\)=ANY\(\$2::text\[\]\)/);
  assert.match(backend,/geo:normalizeGeo\(config\.geo\)/);
  assert.doesNotMatch(backend,/Math\.random\(/);
});
