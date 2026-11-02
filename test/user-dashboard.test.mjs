import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {__test} from '../user-dashboard-v1.mjs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('dashboard v2 preserves backend isolation and moves detailed operation out of the home dashboard',()=>{
  const pkg=JSON.parse(read('package.json'));
  const runtime=read('production-v31.mjs');
  const previousRuntime=read('production-v30.mjs');
  const backend=read('user-dashboard-v1.mjs');
  const frontend=read('user-dashboard-v2.js');
  const css=read('user-dashboard-v2.css');
  assert.equal(pkg.version,'2.17.0');
  assert.equal(pkg.scripts.start,'node production-v31.mjs');
  assert.match(runtime,/await import\('\.\/production-v30\.mjs'\)/);
  assert.match(runtime,/user-dashboard-v2\.js/);
  assert.match(runtime,/X-RLB-User-Dashboard','v2/);
  assert.match(previousRuntime,/handleUserDashboardRoute/);
  assert.match(backend,/saved_alerts a ON a\.user_id=\$1/);
  assert.match(backend,/WHERE t\.user_id=\$1/);
  assert.match(backend,/tender_intelligence_analyses WHERE user_id=\$1/);
  assert.match(backend,/company_documents WHERE user_id=\$1/);
  assert.match(backend,/DELETE FROM user_tender_tracking WHERE id=\$1 AND user_id=\$2/);
  assert.match(frontend,/Dashboard','Prioridades e decisões/);
  assert.match(frontend,/Minha Operação','Licitações em andamento/);
  assert.match(frontend,/O que precisa da sua atenção/);
  assert.match(frontend,/Oportunidades para você/);
  assert.match(frontend,/Próximos prazos/);
  assert.match(frontend,/Habilitação/);
  assert.match(frontend,/\.slice\(0,3\)/,'dashboard must limit recommendations to three');
  assert.match(frontend,/\.slice\(0,4\)/,'dashboard must limit priorities and agenda');
  assert.match(frontend,/Pipeline/);
  assert.match(frontend,/Licitações acompanhadas/);
  assert.match(frontend,/Sinais da IA-RLB/);
  assert.match(frontend,/Relatório assistivo\. Confirme requisitos críticos/);
  assert.doesNotMatch(frontend,/Personalizar/,'default dashboard should not depend on personalization to be clean');
  assert.match(css,/html:not\(\[data-theme="dark"\]\)/);
  assert.match(css,/html\[data-theme="dark"\]/);
  assert.match(css,/@media\(max-width:520px\)/);
});

test('tracking statuses remain constrained',()=>{
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

test('geographic scope accepts Brazil, regions and validated multiple UFs',()=>{
  const brasil=__test.normalizeGeo({scope:'brasil',ufs:['RN']});
  assert.deepEqual(brasil,{scope:'brasil',region:null,ufs:[]});

  const nordeste=__test.normalizeGeo({scope:'regiao',region:'Nordeste'});
  assert.equal(nordeste.scope,'regiao');
  assert.equal(nordeste.region,'Nordeste');
  assert.ok(nordeste.ufs.includes('RN'));
  assert.ok(nordeste.ufs.includes('PE'));
  assert.equal(nordeste.ufs.includes('SP'),false);

  const ufs=__test.normalizeGeo({scope:'ufs',ufs:['rn','PB','SP','XX','RN']});
  assert.deepEqual(ufs,{scope:'ufs',region:null,ufs:['RN','PB','SP']});

  const invalid=__test.normalizeGeo({scope:'regiao',region:'Inexistente'});
  assert.deepEqual(invalid,{scope:'brasil',region:null,ufs:[]});
});

test('recommendations remain grounded in real saved alerts, active metadata and selected geography',()=>{
  const backend=read('user-dashboard-v1.mjs');
  assert.match(backend,/m\.closes_at>=NOW\(\)/);
  assert.match(backend,/m\.object_text ILIKE '%'\|\|a\.keyword\|\|'%'/);
  assert.match(backend,/UPPER\(m\.uf\)=UPPER\(a\.uf\)/);
  assert.match(backend,/m\.municipality ILIKE '%'\|\|a\.municipality\|\|'%'/);
  assert.match(backend,/m\.modality_code=a\.modality_code/);
  assert.match(backend,/m\.estimated_value>=a\.min_value/);
  assert.match(backend,/m\.estimated_value<=a\.max_value/);
  assert.match(backend,/\$2::text\[\] IS NULL OR UPPER\(m\.uf\)=ANY\(\$2::text\[\]\)/);
  assert.match(backend,/geo:normalizeGeo\(config\.geo\)/);
  assert.match(backend,/const geo=b\.geo===undefined\?current\.geo:normalizeGeo\(b\.geo\)/);
  assert.doesNotMatch(backend,/Math\.random\(/);
});

test('dashboard UI exposes geographic selector and explainable opportunity fit',()=>{
  const frontend=read('user-dashboard-v2.js');
  assert.match(frontend,/FILTRAR OPORTUNIDADES/);
  assert.match(frontend,/Brasil inteiro/);
  assert.match(frontend,/Por região/);
  assert.match(frontend,/Estados específicos/);
  assert.match(frontend,/A preferência fica salva nesta conta/);
  assert.match(frontend,/Por que esta oportunidade\?/);
  assert.match(frontend,/\/api\/dashboard\/preferences/);
});