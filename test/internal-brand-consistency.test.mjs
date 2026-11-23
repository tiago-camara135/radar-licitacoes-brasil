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

test('header and Radar share the theme surfaces and action colors',()=>{
  const css=fs.readFileSync('app-v2.css','utf8');
  assert.match(header,/--hdr-bg:[^;]*var\(--surface\)[^;]*var\(--surface3\)/);
  assert.match(header,/--hdr-nav-title:var\(--text\)/);
  assert.match(header,/\.nav-icon\{[^}]*color:var\(--emerald\)/);
  assert.match(css,/html\[data-theme="dark"\] \.live-terminal\{[^}]*--rlb-panel-bg:var\(--terminal\)/);
  assert.match(css,/#view-radar \.search-console,\s*#view-radar \.results-panel\{[^}]*var\(--surface\)/);
  assert.match(html,/id="liveScope"[^>]*aria-label="Abrangência do Radar Nacional"/);
});
