import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const brand=fs.readFileSync('brand-logo-v1.css','utf8');
const header=fs.readFileSync('header-model1.css','utf8');
const runtime=fs.readFileSync('production-v3.mjs','utf8');
const html=fs.readFileSync('app-v2.html','utf8');

test('login, header interno e rodape usam a mesma identidade visual',()=>{
  assert.match(brand,/\.brand-line \.brand-mark/);
  assert.match(brand,/\.sidebar-brand \.brand-mark\.small/);
  assert.match(brand,/\.auth-home-footer-brand \.brand-mark\.small/);
  assert.match(brand,/background:var\(--rlb-brand-icon\)/);
  assert.match(html,/rel="icon" type="image\/svg\+xml"/);
});

test('navegacao superior segue o modelo 1 com icones consistentes e acessiveis',()=>{
  assert.match(runtime,/headerModel1Css/);
  assert.match(runtime,/finalCss=source\+'\\n'\+runtimeCss\+'\\n'\+aiUiCss\+'\\n'\+headerModel1Css/);
  assert.match(header,/\.app-shell \.main-nav button\.active::after/);
  assert.match(header,/\.app-shell \.main-nav \.nav-icon svg/);
  assert.match(header,/button:focus-visible/);
  assert.match(header,/Inteligência para compras públicas/);
});
