import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Pulse visual audit sets readable AI typography and bounded overlays',()=>{
 const css=read('pulse-theme-v2.css');assert.match(css,/#aiPrompt\{font-size:14px!important/);assert.match(css,/#aiPrompt\{font-size:16px!important/);assert.match(css,/max-height:calc\(100dvh - 82px\)/);assert.match(css,/#rlbNationalNoticeHost\[hidden\]/);
});
test('floating notices are deferred while an account overlay or AI is open without marking read',()=>{
 const s=read('onsite-notifications-v3.js');assert.match(s,/function overlayOpen\(\)/);assert.match(s,/region.hidden=false/);assert.match(s,/if\(paused\|\|document.hidden\|\|marking\|\|overlayOpen\(\)\)stopClock/);assert.match(s,/new MutationObserver\(syncOverlay\)/);
});
