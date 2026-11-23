import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../app-v2.html',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../app-v2.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../app-v2.css',import.meta.url),'utf8');

test('public entry explains product use and official-source boundaries',()=>{
  assert.match(html,/customer-education/);
  assert.match(html,/O Radar substitui o PNCP/);
  assert.match(html,/A IA-RLB é assistiva/);
  assert.match(html,/https:\/\/pncp\.gov\.br\//);
  assert.match(html,/A preparação e o envio de propostas continuam sob responsabilidade da empresa/);
});

test('dashboard first-steps guide is removed while document navigation remains',()=>{
  assert.doesNotMatch(html,/class="quick-start"/);
  assert.doesNotMatch(html,/Primeiros passos no Radar/);
  assert.match(html,/id="documentsNav" data-view="documents"/);
  assert.match(js,/document\.addEventListener\('click',e=>\{const b=e\.target\.closest\('\[data-view\]'\)/);
  assert.match(js,/if\(v==='documents'\)loadDocuments\(\)/);
});

test('authentication tabs expose selected state and password guidance',()=>{
  assert.match(html,/aria-describedby="authPasswordHelp"/);
  assert.match(html,/id="authPasswordHelp"/);
  assert.match(js,/setAttribute\('aria-selected',String\(login\)\)/);
});

test('public customer education retains responsive mobile layouts without dashboard guide styles',()=>{
  assert.match(css,/\.customer-steps\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/@media\(max-width:820px\)/);
  assert.match(css,/@media\(max-width:560px\)/);
  assert.doesNotMatch(css,/quick-start/);
});

test('brand palette is unified across light and dark themes and key accents',()=>{
  const marker='/* RADAR BRAND PALETTE 1.0';
  const start=css.lastIndexOf(marker);
  assert.ok(start>=0,'final palette override must exist');
  const palette=css.slice(start);
  for(const token of ['--bg:','#f4f7f9','--emerald:#176b62','--cyan:#3f788e','--muted:#5f7482','--action-bg:#155e58','--action-bg2:#2c6d80']) assert.ok(palette.includes(token),token);
  assert.ok(palette.includes('html[data-theme="dark"]'));
  for(const token of ['--bg:#0b1721','--emerald:#68b7a7','--cyan:#82b5c6']) assert.ok(palette.includes(token),token);
  assert.match(palette,/\.auth-copy\{/);
  assert.match(palette,/\.btn\.primary\{/);
  assert.match(palette,/\.ai-fab\{/);
  assert.doesNotMatch(palette,/#00f5a0|#00d9f5|#a855f7/);
  assert.match(html,/app-v2\.css\?v=20261122-radar-unified-colors-11/);
});
