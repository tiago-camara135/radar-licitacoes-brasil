import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../source-transparency-v1.css', import.meta.url), 'utf8');

test('Radar Nacional não permite overflow horizontal', () => {
  assert.match(css, /\.live-list\{[^}]*overflow-y:auto!important;[^}]*overflow-x:hidden!important/);
  assert.match(css, /\.live-list \.live-item\{[^}]*grid-template-columns:minmax\(0,1fr\) auto/);
  assert.match(css, /\.live-list \.live-item>\*\{min-width:0;max-width:100%\}/);
});

test('textos e origem do Radar Nacional quebram dentro do card', () => {
  assert.match(css, /\.live-list \.item-title,\.live-list \.item-meta\{[^}]*white-space:normal;[^}]*overflow-wrap:anywhere/);
  assert.match(css, /\.live-list \.rlb-live-source\{width:100%;min-width:0;max-width:100%/);
  assert.match(css, /\.live-list \.rlb-live-source-chip\{[^}]*white-space:normal;[^}]*overflow-wrap:anywhere/);
});

test('Radar Nacional reorganiza o card em uma coluna em telas menores', () => {
  assert.match(css, /@media\(max-width:700px\)[\s\S]*\.live-list \.live-item\{grid-template-columns:minmax\(0,1fr\)\}/);
});
