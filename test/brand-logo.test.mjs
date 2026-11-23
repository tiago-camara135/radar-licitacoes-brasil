import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const runtime=fs.readFileSync(new URL('../production-v4.mjs',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../brand-logo-v1.css',import.meta.url),'utf8');
const svg=fs.readFileSync(new URL('../rlb-brand-icon-v1.svg',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../app-v2.html',import.meta.url),'utf8');

test('simbolo oficial minimalista de radar e aplicado como identidade da marca',()=>{
  assert.match(runtime,/brandLogoCss/);
  assert.match(runtime,/companyDocumentsCss\+'\\n\\n'\+brandLogoCss/);
  assert.match(css,/data:image\/svg\+xml;base64/);
  assert.match(css,/--rlb-brand-icon/);
  assert.match(css,/\.brand-line \.brand-mark/);
  assert.match(css,/\.sidebar-brand \.brand-mark\.small/);
  assert.match(css,/\.auth-home-footer-brand \.brand-mark\.small/);
  assert.match(svg,/<svg/);
  assert.match(svg,/Radar de Licitacoes Brasil/);
  assert.match(svg,/ondas concentricas e feixe de varredura/);
  assert.doesNotMatch(svg,/Documento com radar/);
  assert.match(html,/rel="icon" type="image\/svg\+xml" href="data:image\/svg\+xml;base64,/);
  assert.match(html,/app-v2\.css\?v=20261122-radar-palette-3/);
});

test('marca interna preserva dimensoes responsivas do header modelo 1',()=>{
  assert.doesNotMatch(css,/width:42px!important|height:42px!important|border-radius:13px!important/);
});
