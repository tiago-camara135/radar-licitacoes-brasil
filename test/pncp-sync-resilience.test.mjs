import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createPncpTransport} from '../pncp-transport-v1.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const response=(status,body,headers={})=>({status,ok:status>=200&&status<300,headers:{get:k=>headers[k]||null},json:async()=>body});
function rig(fetcher){let clock=1000;return createPncpTransport({fetcher,now:()=>clock,sleep:async ms=>{clock+=ms},spacing:1,cacheMs:20000,maxRetries:2,maxConcurrent:2});}
test('transient HTTP and malformed JSON-shaped success are retried, valid empty is accepted',async()=>{
 let calls=0;const t=rig(async()=>{calls++;return calls===1?response(429,{}, {'retry-after':'1'}):calls===2?response(200,{}):response(204,null)});
 assert.deepEqual((await t.get('https://example.test/a')).body.data,[]);assert.equal(calls,3);assert.equal(t.health().retries,2);assert.equal(t.health().rate_limited,1);
});
test('identical concurrent requests share one request and bounded cache avoids duplicates',async()=>{
 let calls=0;const t=rig(async()=>{calls++;return response(200,{data:[1]})});
 const [a,b]=await Promise.all([t.get('https://example.test/a'),t.get('https://example.test/a')]);
 assert.deepEqual(a.body,b.body);await t.get('https://example.test/a');assert.equal(calls,1);assert.equal(t.health().deduplicated,1);assert.equal(t.health().cache_hits,1);
});
test('permanent HTTP errors do not retry and global concurrent requests never exceed two',async()=>{
 let active=0,peak=0,calls=0;const t=rig(async url=>{calls++;active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,3));active--;return url.endsWith('bad')?response(400,{}):response(200,{data:[]})});
 await Promise.all(Array.from({length:8},(_,i)=>t.get('https://example.test/'+i)));
 await assert.rejects(t.get('https://example.test/bad'),/400/);assert.ok(peak<=2);assert.equal(calls,9);
});
test('failed additional page does not discard first page; retry is prioritized next cycle',async()=>{
 const js=read('pncp-client-v3.mjs'),begin=js.indexOf('function scopeKey('),end=js.indexOf('async function mapLimit(',begin);
 const context=vm.createContext({pageProgress:new Map(),modalityHealth:new Map(),serverFilterParams:()=>({}),clean:String,fetchWithPageFallback:(worker,args)=>worker(args)});
 const fn=vm.runInContext(js.slice(begin,end)+';collectModality',context);
 const requested=[];let fail=true;
 const args={worker:async({page})=>{requested.push(page);if(page===2&&fail)throw Error('timeout');return {items:[page],totalPages:4,totalRecords:20,pageSize:5}},args:{code:6,filters:{}},key:'test',budget:2,kind:'publication',track:true};
 const first=await fn(args);assert.deepEqual(Array.from(first.items),[1]);assert.equal(first.failedPages.length,1);assert.equal(first.partial,true);
 fail=false;requested.length=0;const second=await fn(args);assert.deepEqual(requested,[1,2]);assert.deepEqual(Array.from(second.items),[1,2]);
});
test('manual and automatic scans use the same collector, and background filtered refreshes are throttled',()=>{
 const monitor=read('live-monitor-v5.mjs'),admin=read('admin-control-center.mjs'),search=read('search-router-v3.mjs');
 assert.match(admin,/manualScan\(\)\{return requestManualLiveScan\(\)\}/);
 assert.match(monitor,/if\(scanPromise\)return scanPromise/);assert.match(monitor,/extraPageCodes,concurrency:2,track:true/);
 assert.match(search,/now-lastFilteredStart<120000/);assert.match(search,/now-lastNationalStart>=240000/);
 assert.match(search,/track:national/);
});
