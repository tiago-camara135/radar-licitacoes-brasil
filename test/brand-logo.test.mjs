import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const runtime=fs.readFileSync(new URL('../production-v4.mjs',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../brand-logo-v1.css',import.meta.url),'utf8');
const svg=fs.readFileSync(new URL('../rlb-brand-icon-v1.svg',import.meta.url),'utf8');

test('nova identidade visual permanece isolada da lógica da aplicação',()=>{
  assert.match(runtime,/brandLogoCss/);
  assert.match(runtime,/companyDocumentsCss\+'\\n\\n'\+brandLogoCss/);
  assert.match(css,/rlb-brand-icon-v1\.svg/);
  assert.match(css,/\.brand-mark/);
  assert.match(svg,/<svg/);
  assert.match(svg,/Radar de Licitações Brasil/);
  assert.match(svg,/Documento com radar/);
});
