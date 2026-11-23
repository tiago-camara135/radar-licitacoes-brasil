import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css=fs.readFileSync(new URL('../app-v2.css',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../app-v2.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app-v2.js',import.meta.url),'utf8');
const sourceCss=fs.readFileSync(new URL('../source-transparency-v1.css',import.meta.url),'utf8');
const readinessCss=fs.readFileSync(new URL('../tender-readiness-quick-v1.css',import.meta.url),'utf8');
const intelligenceCss=fs.readFileSync(new URL('../tender-intelligence-v2.css',import.meta.url),'utf8');

const marker='/* RADAR NATIONAL PREMIUM 1.0';
const start=css.lastIndexOf(marker);
const premium=css.slice(start);

test('Radar Nacional premium palette improves contrast while preserving navy and teal identity',()=>{
  assert.ok(start>=0,'premium presentation layer must be present');
  for(const token of ['--rlb-panel-bg:#102b3a','--rlb-card-bg:#193b4c','--rlb-ink:#f4f8fa','--rlb-muted:#bfd0d7','--rlb-teal:#58cbb5','--rlb-amber:#e8b85d','--rlb-red:#e87983']) assert.ok(premium.includes(token),token);
  assert.match(premium,/color-scheme:dark/);
  assert.match(premium,/\.live-terminal \.item-title/);
  assert.match(premium,/\.live-terminal \.item-meta/);
  assert.match(premium,/\.live-terminal \.terminal-meta/);
});

test('live toolbar and action buttons have consistent hierarchy and visible keyboard focus',()=>{
  assert.match(premium,/\.live-terminal #liveScope/);
  assert.match(premium,/\.live-terminal #refreshLive::before/);
  assert.match(premium,/\.live-terminal #refreshLive:hover:not\(:disabled\)/);
  assert.match(premium,/\.live-terminal #refreshLive:focus-visible/);
  assert.match(premium,/\.live-terminal \.rlb-source-btn:focus-visible/);
  assert.match(premium,/\.live-terminal \.tender-ready-trigger:focus-visible/);
  assert.match(premium,/\.live-terminal \.tender-ai-trigger:focus-visible/);
});

test('official source links remain distinct from the two analysis actions',()=>{
  assert.match(premium,/\.rlb-live-source-actions \.rlb-source-btn:first-child/);
  assert.match(premium,/\.live-item>\.tender-ready-trigger/);
  assert.match(premium,/\.live-item>\.tender-ai-trigger/);
  assert.match(premium,/background:linear-gradient\(115deg,#e0f2ee,#d6e9eb\)/);
  assert.match(sourceCss,/\.rlb-live-source-actions/);
  assert.match(readinessCss,/\.tr-quick-badge\.high/);
  assert.match(intelligenceCss,/\.tender-ai-trigger/);
});

test('document compatibility states use consistent green, amber and red semantics',()=>{
  assert.match(premium,/\.tr-quick-badge\.high\{--trq-accent:#58cba7\}/);
  assert.match(premium,/\.tr-quick-badge\.attention\{--trq-accent:#e8b85d\}/);
  assert.match(premium,/\.tr-quick-badge\.low\{--trq-accent:#e87983\}/);
  assert.match(premium,/\.trq-title/);
  assert.match(premium,/\.trq-detail/);
  assert.match(premium,/\.trq-score/);
});

test('Radar Nacional cards preserve readable mobile layout and reduced-motion preference',()=>{
  assert.match(premium,/@media\(max-width:700px\)/);
  assert.match(premium,/@media\(max-width:420px\)/);
  assert.match(premium,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(premium,/grid-template-columns:minmax\(0,1fr\)/);
  assert.match(premium,/overflow-wrap:anywhere/);
});

test('Radar Nacional functionality and existing selectors remain intact',()=>{
  for(const id of ['liveList','liveScope','refreshLive','liveMeta','statusDot','monitorStatusText']) assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(app,/function renderLive\(\)/);
  assert.match(app,/async function refreshLive\(\)/);
  assert.match(app,/\$\('#refreshLive'\)\?\.addEventListener\('click',refreshLive\)/);
  assert.match(app,/\$\('#liveScope'\)\?\.addEventListener\('change',renderLive\)/);
  assert.match(html,/app-v2\.css\?v=20261123-pulse-palette-adaptive-2/);
});

test('final readability pass raises secondary information to a more legible size',()=>{
  const finish=css.slice(css.lastIndexOf('/* RADAR NATIONAL PREMIUM FINISH 1.1'));
  assert.match(finish,/\.live-terminal \.terminal-meta\{[\s\S]*?font-size:10\.5px/);
  assert.match(finish,/\.live-terminal \.item-title\{[\s\S]*?font-size:14px/);
  assert.match(finish,/\.live-terminal \.item-meta\{[\s\S]*?font-size:10px/);
  assert.match(finish,/\.live-terminal \.trq-detail\{[\s\S]*?font-size:10px/);
});
test('compatibility colors have explicit high, attention and critical semantic states',()=>{
  const finish=css.slice(css.lastIndexOf('/* RADAR NATIONAL PREMIUM FINISH 1.1'));
  assert.match(finish,/\.tr-quick-badge\.high\{--trq-accent:#58cba7!important\}/);
  assert.match(finish,/\.tr-quick-badge\.attention\{--trq-accent:#e8b85d!important\}/);
  assert.match(finish,/\.tr-quick-badge\.low\{--trq-accent:#e87983!important\}/);
});
test('interactive controls include keyboard focus and pressed states',()=>{
  const finish=css.slice(css.lastIndexOf('/* RADAR NATIONAL PREMIUM FINISH 1.1'));
  assert.match(finish,/\.tr-quick-badge:focus-visible/);
  assert.match(finish,/\.rlb-live-source-actions \.rlb-source-btn:focus-visible/);
  assert.match(finish,/\.live-item>\.tender-ready-trigger:focus-visible/);
  assert.match(finish,/\.live-item>\.tender-ai-trigger:focus-visible/);
  assert.match(finish,/:active/);
});
test('mobile controls use larger touch targets and readable card text',()=>{
  const finish=css.slice(css.lastIndexOf('/* RADAR NATIONAL PREMIUM FINISH 1.1'));
  assert.match(finish,/@media\(max-width:700px\)/);
  assert.match(finish,/min-height:42px/);
  assert.match(finish,/flex:1 1 115px/);
  assert.match(finish,/@media\(max-width:420px\)/);
});
