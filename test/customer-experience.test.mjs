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

test('first-run guide routes to existing alerts and document views',()=>{
  assert.match(html,/class="quick-start"/);
  assert.match(html,/data-view="alerts"/);
  assert.match(html,/data-view="documents"/);
  assert.match(html,/id="documentsNav" data-view="documents"/);
  assert.match(js,/document\.addEventListener\('click',e=>\{const b=e\.target\.closest\('\[data-view\]'\)/);
  assert.match(js,/if\(v==='documents'\)loadDocuments\(\)/);
});

test('authentication tabs expose selected state and password guidance',()=>{
  assert.match(html,/aria-describedby="authPasswordHelp"/);
  assert.match(html,/id="authPasswordHelp"/);
  assert.match(js,/setAttribute\('aria-selected',String\(login\)\)/);
});

test('customer education and onboarding have responsive mobile layouts',()=>{
  assert.match(css,/\.customer-steps\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/@media\(max-width:820px\)/);
  assert.match(css,/@media\(max-width:560px\)/);
  assert.match(css,/\.quick-start-grid\{grid-template-columns:1fr/);
});
