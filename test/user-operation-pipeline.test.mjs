import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Pipeline visual não é carregado no runtime ativo',()=>{
  const runtime=read('production-v31.mjs');
  assert.doesNotMatch(runtime,/user-operation-pipeline-v1\.js/);
  assert.doesNotMatch(runtime,/user-operation-pipeline-v1\.css/);
  assert.doesNotMatch(runtime,/user-dashboard-v2\.js/);
  assert.doesNotMatch(runtime,/user-dashboard-v2\.css/);
});

test('backend de acompanhamento continua preservado',()=>{
  const runtime=read('production-v31.mjs');
  const backend=read('user-dashboard-v1.mjs');
  assert.match(runtime,/handleUserDashboardRoute/);
  assert.match(runtime,/initUserDashboard/);
  for(const status of ['analisar','preparando_documentacao','proposta_pronta','participando','recurso','vencida','perdida','arquivada'])assert.match(backend,new RegExp(status));
  assert.match(backend,/user_tender_tracking/);
  assert.match(backend,/user_dashboard_preferences/);
});
