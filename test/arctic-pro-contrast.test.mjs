import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const css=fs.readFileSync(new URL('../pulse-theme-v2.css',import.meta.url),'utf8');
const fix=css.slice(css.indexOf('/* Arctic Pro accessibility repair'));
test('light mode repair targets actual legacy conflicting controls without global dark theme overrides',()=>{
 for(const selector of ['#radarMenuToggle','#aiStatusText','.ai-window-head b','.auth-home-capability-stats strong','.demo-results b','.demo-alert-builder b','.demo-ai-head b','.demo-support-grid b'])assert.ok(fix.includes(selector),selector);
 assert.match(fix,/html\[data-theme="light"\] \{color-scheme:light/);
 assert.match(fix,/button\.active :is\(b,small\)/);
 assert.match(fix,/outline:2px solid var\(--rp-focus\)/);
});
test('explicit light text and solid surfaces meet 4.5:1 for critical controls',()=>{
 const luminance=hex=>{const c=hex.match(/[0-9a-f]{2}/gi).map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]};
 for(const [fg,bg] of [['142C46','EAF1F8'],['49627B','EAF1F8'],['FFFFFF','086BA6'],['FFFFFF','08784E'],['FFFFFF','07588F'],['086BB0','E2F2FF']]){
  const a=luminance(fg),b=luminance(bg);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,fg+' / '+bg);
 }
});
