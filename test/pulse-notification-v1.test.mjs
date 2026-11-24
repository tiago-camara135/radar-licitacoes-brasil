import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'),js=read('onsite-notifications-v3.js'),app=read('app-v2.js'),css=read('pulse-theme-v2.css');
test('queue groups identical PNCP opportunity, ignores read rows and prevents repeat in same session',()=>{
 const ctx=vm.createContext({queue:[],seen:new Set(),MAX_QUEUE:30,key:r=>r.pncp_id||r.id,urgency:()=>false});
 vm.runInContext(js.slice(js.indexOf('function mergeBatch('),js.indexOf('async function loadBatch('))+';mergeBatch([{id:1,pncp_id:"A"},{id:2,pncp_id:"A"},{id:3,pncp_id:"B",read_at:"x"}]);mergeBatch([{id:1,pncp_id:"A"}]);',ctx);
 assert.equal(ctx.queue.length,1);assert.equal(ctx.queue[0].rows.length,2);
});
test('read occurs only on explicit action, session state cleared on logout, safe official links',()=>{
 const code=js.slice(js.indexOf('function displayNext()'),js.indexOf('function mergeBatch'));
 assert.doesNotMatch(code,/append\(card\);markRows/);assert.match(code,/mark\.addEventListener\('click'/);assert.match(js,/seen\.clear\(\)/);assert.match(js,/!u\.username&&!u\.password/);
 assert.match(app,/radar:notification-read/);assert.match(app,/ui\.urgent/);
});
test('eight second timer and motion accessibility use both theme palettes',()=>{
 assert.match(js,/DISPLAY_MS=8000/);assert.match(js,/performance\.now\(\)-started/);assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/--notice-soft:var\(--rp-green-tile\)/);assert.match(css,/--notice-soft:var\(--rp-amber-tile\)/);
});
