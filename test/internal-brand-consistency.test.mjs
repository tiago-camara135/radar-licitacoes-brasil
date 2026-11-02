import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const brand=fs.readFileSync('brand-logo-v1.css','utf8');

test('header interno replica a identidade visual externa',()=>{
  assert.match(brand,/\.sidebar-brand \.brand-mark\.small/);
  assert.match(brand,/background:var\(--rlb-brand-icon\)/);
  assert.match(brand,/Radar de Licitações Brasil/);
  assert.match(brand,/Inteligência para compras públicas/);
});
