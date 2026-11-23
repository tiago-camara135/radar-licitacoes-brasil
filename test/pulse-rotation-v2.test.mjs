import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const js=read('app-v2.js'),html=read('app-v2.html'),css=read('app-v2.css'),brand=read('brand-logo-v1.css'),svg=read('rlb-brand-icon-v1.svg').trim();
const code=js.slice(js.indexOf('  const previous=new Set(cycleSelection||[]);'),js.indexOf("  const group=$('#rlbHomeRecommendationFilters');"));
function simulate(n){
 const eligible=Array.from({length:n},(_,i)=>({id:String(i)}));
 const ctx=vm.createContext({eligible,recCache:eligible,cycleSelection:null,rotationCycle:0,rotationHistory:new Map(),rotateRecommendations:false,recPulse:new Map(),recKey:x=>x.id,recommendationStatus:()=>{}});
 const run=()=>vm.runInContext('(()=>{'+code+';return cycleSelection})()',ctx);
 return {ctx,run};
}
test('rotation reaches every eligible real record before repeating when possible',()=>{
 const {ctx,run}=simulate(12);const seen=new Set(run());ctx.rotateRecommendations=true;
 for(let i=0;i<3;i++)for(const id of run()) {assert.ok(!seen.has(id));seen.add(id)}
 assert.equal(seen.size,12);
});
test('small pool stays stable and empty pool stays empty',()=>{
 const small=simulate(2);const initial=Array.from(small.run());small.ctx.rotateRecommendations=true;assert.deepEqual(Array.from(small.run()),initial);
 assert.equal(simulate(0).run().length,0);
});
test('new records take precedence and ordinary snapshot retains selection',()=>{
 const {ctx,run}=simulate(9);run();ctx.rotateRecommendations=true;ctx.recPulse.set('8','new');const selected=Array.from(run());assert.equal(selected[0],'8');
 ctx.rotateRecommendations=false;ctx.recPulse.clear();assert.deepEqual(Array.from(run()),selected);
});
test('login, browser icon and app share one exact brand asset; refresh has accessible SVG',()=>{
 const encoded=Buffer.from(svg).toString('base64');
 assert.ok(brand.includes(encoded));assert.ok(html.includes(encoded));
 assert.match(html,/id="rlbHomeRefresh"[^>]*aria-label="Atualizar agora[^>]*><svg/);
 assert.match(css,/place-items:center;flex:0 0 40px/);assert.match(css,/prefers-reduced-motion:reduce/);
});
test('failed recommendation query is not silently reported as an empty success',()=>{
 assert.match(read('user-dashboard-v1.mjs'),/const rows=\(await pool\.query\(recommendationSql/);
 assert.match(js,/if\(!Array\.isArray\(d\.recommendations\)\)throw Error/);
});
