import test from 'node:test';
import assert from 'node:assert/strict';
import {pncpDocumentCacheKey,createPncpDocumentCache} from '../pncp-document-cache-v1.mjs';

test('cache key separates PNCP document list and individual files',()=>{
  const base={cnpj:'18348094000150',year:2026,sequence:97};
  assert.equal(pncpDocumentCacheKey({...base,kind:'list'}),'18348094000150:2026:97:list');
  assert.equal(pncpDocumentCacheKey({...base,kind:'file',documentSequence:2}),'18348094000150:2026:97:file:2');
  assert.equal(pncpDocumentCacheKey({...base,kind:'file'}),null);
});

test('cache stores and serves a successful PNCP response with source marker',async()=>{
  const rows=new Map();
  const pool={async query(sql,args=[]){
    if(/^CREATE|^CREATE INDEX/i.test(sql.trim()))return{rows:[]};
    if(sql.includes('INSERT INTO pncp_document_response_cache')){rows.set(args[0],{body:args[8],content_type:args[6],source_url:args[7],cached_at:new Date(),body_bytes:args[9]});return{rows:[]}}
    if(sql.includes('SELECT body,content_type'))return{rows:rows.has(args[0])?[rows.get(args[0])]:[]};
    if(sql.includes('DELETE FROM pncp_document_response_cache'))return{rows:[]};
    throw new Error('unexpected query');
  }};
  const cache=createPncpDocumentCache(pool,{maxBytes:1024*1024,maxEntries:20,ttlDays:30,logger:{warn(){}}});
  const ids={cnpj:'18348094000150',year:2026,sequence:97,kind:'list'};
  const live=new Response(JSON.stringify([{sequencialDocumento:1,titulo:'Edital'}]),{status:200,headers:{'content-type':'application/json'}});
  assert.equal(await cache.save(ids,live,'https://pncp.gov.br/api/pncp/test'),true);
  const hit=await cache.get(ids);
  assert.equal(hit.status,200);
  assert.equal(hit.headers.get('x-rlb-source'),'pncp-cache');
  assert.equal((await hit.json())[0].titulo,'Edital');
});
