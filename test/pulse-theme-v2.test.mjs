import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const css=read('pulse-theme-v2.css'),html=read('app-v2.html'),js=read('app-v2.js');
const lum=hex=>{const n=hex.match(/[a-f0-9]{2}/gi).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*n[0]+.7152*n[1]+.0722*n[2]};
const ratio=(a,b)=>{const l=[lum(a),lum(b)].sort((a,b)=>b-a);return(l[0]+.05)/(l[1]+.05)};
test('Arctic Pro and Deep Ocean semantic foreground contrast is at least 4.5 on main surfaces',()=>{
 for(const t of ['light','dark']){
  const block=css.split('html[data-theme="'+t+'"]{')[1].split('}')[0];
  const tokens=Object.fromEntries([...block.matchAll(/(--[a-z-]+):(#(?:[0-9a-f]{6}))(?:;|\n)/gi)].map(m=>[m[1],m[2]]));
  for(const bg of ['--pulse-page','--pulse-paper','--pulse-inset'])for(const fg of ['--pulse-ink','--pulse-secondary','--rp-accent']){
   assert.ok(ratio(tokens[fg],tokens[bg])>=4.5,t+' '+fg+' '+bg+' '+ratio(tokens[fg],tokens[bg]));
  }
  assert.ok(ratio(tokens['--rp-button-text'],tokens['--rp-button'])>=4.5);
 }
});
test('shared theme layer loads in runtime and covers every principal module',()=>{
 assert.match(read('production-v3.mjs'),/pulseThemeCss/);
 for(const selector of ['.hab-docs-panel','.acc-panel','.ai-window','.rev-calendar','.results-panel','.auth-home-grid','.rlb-home-card'])assert.ok(css.includes(selector),selector);
 assert.match(css,/prefers-reduced-motion:reduce/);
});
test('appearance groups retain original toggle, expose auto and persist preference',()=>{
 for(const mode of ['light','dark','auto'])assert.equal(html.split('data-pulse-theme="'+mode+'"').length-1,2);
 assert.match(js,/localStorage.setItem\('rlb-theme-v2', preference\)/);
 assert.match(js,/preference === 'auto' && systemTheme.matches/);
 assert.match(js,/function renderMetric/);assert.match(js,/if\(previous===next\)return/);
});
