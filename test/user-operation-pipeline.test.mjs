import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('operation pipeline patch removes dashboard analyze action and exposes every operational stage',()=>{
  const runtime=read('production-v31.mjs');
  const patch=read('user-operation-pipeline-v1.js');
  const css=read('user-operation-pipeline-v1.css');
  assert.match(runtime,/user-operation-pipeline-v1\.js/);
  assert.match(runtime,/user-operation-pipeline-v1\.css/);
  assert.match(patch,/\[data-db-analyze\]/);
  assert.match(patch,/\.remove\(\)/);
  for(const status of ['analisar','preparando_documentacao','proposta_pronta','participando','recurso','vencida','perdida','arquivada'])assert.match(patch,new RegExp(status));
  assert.match(patch,/classList\.toggle\('active'/);
  assert.match(patch,/Etapa atual/);
  assert.match(css,/\.op-funnel button\.active/);
  assert.match(css,/\[data-db-analyze\]\{display:none!important\}/);
});

test('operation pipeline observer is idempotent and cannot self-trigger continuously',()=>{
  const patch=read('user-operation-pipeline-v1.js');
  assert.match(patch,/foot&&foot\.textContent!==PIPELINE_HINT/,'footer DOM write must be conditional');
  assert.match(patch,/enhanceScheduled/,'observer work must be coalesced');
  assert.match(patch,/requestAnimationFrame/,'enhancement must be scheduled outside the mutation callback');
  assert.match(patch,/new MutationObserver\(scheduleEnhance\)/);
  assert.doesNotMatch(patch,/new MutationObserver\(\(\)=>enhance\(\)\)/,'direct recursive observer callback is forbidden');
});
