import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {isActiveProcurement} from '../live-monitor-v5.mjs';import {createPncpTransport} from '../pncp-transport-v1.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('active monitor uses actual proposal deadline not source URL; local deadline is Brasília time',()=>{
 const now=Date.parse('2026-11-24T01:00:00Z');
 assert.equal(isActiveProcurement({dataEncerramentoProposta:'2026-11-23T23:00:00'},now),true);
 assert.equal(isActiveProcurement({dataEncerramentoProposta:'2026-11-23T21:00:00'},now),false);
 assert.equal(isActiveProcurement({_pncpUrl:'https://pncp.gov.br'},now),false);
 assert.match(read('live-monitor-v5.mjs'),/if\(isActiveProcurement\(x\)\)fresh.push/);
});
test('unread queue supports cursor without removing history or crossing accounts',()=>{
 const s=read('production-v21.mjs'),o=read('onsite-notifications-v3.js');
 assert.match(s,/d.user_id=\$1 AND d.channel='onsite'/);
 assert.match(s,/d.id>\$3::bigint/);
 assert.match(o,/afterId=String\(batch\[batch.length-1\].id\)/);
 assert.match(o,/revision!==readRevision/);
 assert.match(o,/epoch\+\+;afterId='0'/);
});
test('timestamp cursor preserves PostgreSQL microseconds',()=>{
 const s=read('notification-monitor-bridge.mjs');assert.match(s,/last_detected_at::text AS last_detected_at/);assert.match(s,/detected_at::text AS detected_at FROM monitored_procurements/);
});
test('429 without Retry-After gets longer adaptive pause and does not lose actual response',async()=>{
 let clock=0,calls=0;const t=createPncpTransport({fetcher:async()=>({status:++calls===1?429:200,ok:calls>1,headers:{get:()=>null},json:async()=>({data:[]})}),now:()=>clock,sleep:async ms=>{clock+=ms},spacing:450,maxRetries:1});
 await t.get('https://example.test/one');assert.ok(clock>=6000);assert.equal(t.health().rate_limited,1);assert.ok(t.health().request_spacing_ms>=1900);
});
test('notification creation skips missing or expired deadlines and unknown estimates do not match value filters',()=>{
 const s=read('notifications-v1.mjs');assert.match(s,/const deadline=Date.parse\(closeOf\(x\)\|\|''\)/);assert.match(s,/deadline<Date.now\(\)\)continue/);assert.match(s,/value==null\|\|value<Number\(a.min_value\)/);assert.match(s,/estimated_value:knownEstimate\(x\)/);
});

test('local search and its status share the legacy deadline correction; alerts do not hide query failures',()=>{
 const s=read('search-router-v3.mjs');assert.match(s,/const deadlineSql=effectivePncpDeadline\('m'\)/);assert.match(s,/FROM \$\{activeSource\} WHERE/);assert.match(s,/FROM \$\{deadlineSource\}/);assert.doesNotMatch(s,/await localSearch\(filters,5000\)\.catch/);
});
test('unknown price cannot be interpreted as free procurement in remote search',()=>{
 const s=read('pncp-client-v3.mjs');assert.match(s,/knownValue\(x\)!==null&&knownValue\(x\)<=f.maxValue/);assert.match(s,/knownValue\(x\)!==null&&knownValue\(x\)>=f.minValue/);
});
