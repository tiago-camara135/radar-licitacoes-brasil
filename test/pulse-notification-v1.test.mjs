import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'),js=read('onsite-notifications-v3.js'),app=read('app-v2.js'),css=read('pulse-theme-v2.css');
test('digest uses actual unread count and never builds an individual notification queue',()=>{
 const ctx=vm.createContext({});
 vm.runInContext(js.slice(js.indexOf('function digestFrom('),js.indexOf('async function loadBatch('))+';this.digest=digestFrom;',ctx);
 assert.equal(ctx.digest([{id:'37',batch_count:37,batch_last_id:'37'}]).count,37);
 assert.equal(ctx.digest([{id:1,read_at:'x',batch_count:1}]),null);
 assert.equal(ctx.digest([]),null);
 assert.doesNotMatch(js,/queue\.shift\(/);
});
test('popup budget is five minutes and shared browser storage survives reloads',()=>{
 const ctx=vm.createContext({lastPopupAt:100000,COOLDOWN_MS:300000});
 vm.runInContext(js.slice(js.indexOf('function canDisplay('),js.indexOf('function displayNext('))+';this.can=canDisplay;',ctx);
 assert.equal(ctx.can(399999),false);assert.equal(ctx.can(400000),true);
 assert.match(js,/localStorage\.setItem\(storageKey\(\)/);assert.match(js,/navigator\.locks\.request/);
});
test('read occurs only on explicit action, session state cleared on logout, safe official links',()=>{
 const code=js.slice(js.indexOf('function displayNext(group)'),js.indexOf('function digestFrom'));
 assert.doesNotMatch(code,/append\(card\);markRows/);assert.match(code,/mark\.addEventListener\('click'/);assert.match(js,/accountScope='';lastPopupAt=0/);assert.match(js,/!u\.username&&!u\.password/);
 assert.match(app,/radar:notification-read/);assert.match(app,/ui\.urgent/);
});
test('eight second timer and motion accessibility use both theme palettes',()=>{
 assert.match(js,/DISPLAY_MS=8000/);assert.match(js,/performance\.now\(\)-started/);assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/--notice-soft:var\(--rp-green-tile\)/);assert.match(css,/--notice-soft:var\(--rp-amber-tile\)/);
});
