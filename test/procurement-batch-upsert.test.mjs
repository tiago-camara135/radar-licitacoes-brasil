import test from 'node:test';
import assert from 'node:assert/strict';
import { batchedProcurementUpsert } from '../procurement-batch-upsert-v1.mjs';

const sql='INSERT INTO t VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,NOW()) ON CONFLICT(pncp_id) DO UPDATE SET raw=EXCLUDED.raw RETURNING pncp_id,(xmax=0) AS inserted';
const row=(id,n=0)=>({values:[id,...Array(18).fill(n),'2026-11-25']});
function db(){
  const seen=new Set(),calls=[];
  return {calls,async query(query,params){
    calls.push({query,params});
    assert.equal(params.length%20,0);
    const ids=params.filter((_,i)=>i%20===0);
    assert.equal(new Set(ids).size,ids.length);
    const placeholders=[...query.matchAll(/\$(\d+)/g)].map(x=>Number(x[1]));
    assert.deepEqual(placeholders,Array.from({length:params.length},(_,i)=>i+1));
    return {rows:ids.map(pncp_id=>{const inserted=!seen.has(pncp_id);seen.add(pncp_id);return {pncp_id,inserted}}).reverse()};
  }};
}
test('1084 unique records require 22 writes, preserving all parameters',async()=>{
  const client=db(),rows=Array.from({length:1084},(_,i)=>row('id-'+i,i));
  await batchedProcurementUpsert(client,sql,rows);
  assert.equal(client.calls.length,22);
  assert.deepEqual(client.calls.flatMap(x=>x.params),rows.flatMap(x=>x.values));
});
test('duplicate keys retain sequential semantics and result order',async()=>{
  const client=db(),results=[];
  const rows=[row('a',1),row('b',2),row('a',3),row('c',4),row('a',5)];
  await batchedProcurementUpsert(client,sql,rows,{onResult:(r,s)=>results.push([r.values[0],s.inserted])});
  assert.deepEqual(results,[['a',true],['b',true],['a',false],['c',true],['a',false]]);
  assert.deepEqual(client.calls.flatMap(x=>x.params),rows.flatMap(x=>x.values));
});
test('empty input does not query, invalid templates and rows are rejected',async()=>{
  const client=db();
  await batchedProcurementUpsert(client,sql,[]);
  assert.equal(client.calls.length,0);
  await assert.rejects(batchedProcurementUpsert(client,'invalid',[]));
  await assert.rejects(batchedProcurementUpsert(client,sql,[{values:['a']}]));
  await assert.rejects(batchedProcurementUpsert(client,sql,[],{batchSize:0}));
});
test('database failures propagate to transaction owner',async()=>{
  const client={query:async()=>{throw new Error('database unavailable')}};
  await assert.rejects(batchedProcurementUpsert(client,sql,[row('a')]),/database unavailable/);
});
