import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const router=read('search-router-v3.mjs'),app=read('app-v2.js'),monitor=read('live-monitor-v5.mjs');
const fn=router.slice(router.indexOf('const NATIONAL_FRESH_MS='),router.indexOf('const digits='));
const coverage=vm.runInNewContext(fn+';nationalCoverage');
const now=Date.parse('2026-11-23T21:00:00Z');
const good={at:new Date(now).toISOString(),ok:true,partial:false,successful_modalities:14,failed_modalities:0};
test('national index is never labelled complete before sync, on failures, when stale, or with bounded pagination',()=>{
 assert.equal(coverage(null,now).state,'initializing');
 assert.equal(coverage(good,now).partial,false);
 assert.equal(coverage({...good,partial:true},now).state,'partial');
 assert.equal(coverage({...good,successful_modalities:13,failed_modalities:1},now).partial,true);
 assert.equal(coverage({...good,ok:false,successful_modalities:0,failed_modalities:14},now).state,'unavailable');
 assert.equal(coverage(good,now+11*60*1000).state,'stale');
 assert.equal(coverage({...good,successful_modalities:1},now).partial,true);
});
test('filtered requests do not overwrite national coverage; API reports partial data and invalidates stale cache on errors',()=>{
 assert.match(router,/if\(national\)lastNationalRemote=lastRemote/);
 assert.match(router,/refreshOpenIndex\(\{days:0\},\{national:true\}\)/);
 assert.match(router,/partial:coverage\.partial,coverage/);
 assert.doesNotMatch(router,/platforms,partial:false/);
 assert.match(router,/if\(national\)lastNationalRemote=lastRemote;\s*cache\.clear\(\);\s*console\.warn/);
});
test('live feed status distinguishes complete modality failure, partial response, pagination and initial sync',()=>{
 const a=app.indexOf('function liveCoverageText(s){'),b=app.indexOf('(()=>{',a);
 const label=vm.runInNewContext(app.slice(a,b)+';liveCoverageText');
 const live={last_success_at:good.at,consecutive_failures:0,live:{successful_modalities:14,failed_modalities:0,modalities_per_cycle:14}};
 assert.equal(label(live),'');
 assert.match(label({...live,partial:true}),/páginas em rotação/);
 assert.match(label({...live,live:{successful_modalities:11,failed_modalities:3,modalities_per_cycle:14}}),/11\/14/);
 assert.match(label({...live,consecutive_failures:1}),/indisponível/);
 assert.match(label({}),/primeira sincronização/);
 assert.match(monitor,/partial:lastPartial/);
 assert.match(app,/const coverageState=response\.coverage\?\.state/);
 assert.match(app,/const coverage=status\?liveCoverageText\(status\):''/);
});
