import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src=fs.readFileSync(new URL('../tender-readiness-matrix-v3.js',import.meta.url),'utf8');

test('pre-habilitacao apresenta navegacao por secoes em vez de uma coluna unica',()=>{
  assert.match(src,/data-view="overview"/);
  assert.match(src,/data-view="requirements"/);
  assert.match(src,/data-view="documents"/);
  assert.match(src,/data-view="actions"/);
  assert.match(src,/mx3-nav-btn/);
});

test('exigencias usam resumo compacto com detalhes expansivos',()=>{
  assert.match(src,/<details class="mx3-req/);
  assert.match(src,/mx3-req-summary/);
  assert.match(src,/Critérios verificados/);
  assert.match(src,/Documentos comparados/);
});

test('interface remove rotulo tecnico v3 do texto exibido e usa linguagem de produto',()=>{
  assert.match(src,/Análise de Habilitação/);
  assert.match(src,/Diagnóstico Empresa × Edital/);
  assert.doesNotMatch(src,/>Matriz de Pré-Habilitação v3</);
});

test('filtros de exigencias exibem contadores e preservam estados existentes',()=>{
  assert.match(src,/data-filter="problem"/);
  assert.match(src,/data-filter="review"/);
  assert.match(src,/data-filter="verified"/);
  assert.match(src,/filterCount/);
  assert.match(src,/expired_at_reference/);
  assert.match(src,/conditional_pending/);
});
