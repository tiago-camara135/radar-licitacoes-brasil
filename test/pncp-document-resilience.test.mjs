import test from 'node:test';
import assert from 'node:assert/strict';
import {createResilientPncpDocumentFetch,pncpBackendUrl,isPncpDocumentRequest} from '../pncp-document-resilience-v1.mjs';

const gateway='https://pncp.gov.br/api/pncp/v1/orgaos/01613072000177/compras/2026/69/arquivos';
const silent={warn(){}};
const noWait=async()=>{};
const noSignal=()=>undefined;

test('PNCP document failover converts the gateway path to the PNCP backend path',()=>{
  assert.equal(pncpBackendUrl(gateway),'https://pncp.gov.br/pncp-api/v1/orgaos/01613072000177/compras/2026/69/arquivos');
  assert.equal(isPncpDocumentRequest(gateway,'GET'),true);
  assert.equal(isPncpDocumentRequest(gateway,'POST'),false);
});

test('three gateway 503 responses fall back to PNCP backend and return success',async()=>{
  const calls=[];
  const fakeFetch=async input=>{
    const url=String(input);calls.push(url);
    if(url.includes('/api/pncp/'))return new Response('temporarily unavailable',{status:503});
    if(url.includes('/pncp-api/'))return new Response(JSON.stringify([{sequencialDocumento:1,titulo:'Edital'}]),{status:200,headers:{'content-type':'application/json'}});
    return new Response('unexpected',{status:500});
  };
  const fetcher=createResilientPncpDocumentFetch(fakeFetch,{sleepFn:noWait,signalFactory:noSignal,logger:silent,randomFn:()=>0});
  const response=await fetcher(gateway,{headers:{accept:'application/json'}});
  assert.equal(response.status,200);
  assert.equal(calls.length,4);
  assert.ok(calls.slice(0,3).every(url=>url.includes('/api/pncp/')));
  assert.ok(calls[3].includes('/pncp-api/'));
  const body=await response.json();
  assert.equal(body[0].sequencialDocumento,1);
});

test('a definitive gateway response does not trigger backend failover',async()=>{
  const calls=[];
  const fakeFetch=async input=>{calls.push(String(input));return new Response('not found',{status:404})};
  const fetcher=createResilientPncpDocumentFetch(fakeFetch,{sleepFn:noWait,signalFactory:noSignal,logger:silent});
  const response=await fetcher(gateway);
  assert.equal(response.status,404);
  assert.equal(calls.length,1);
});

test('non-document PNCP requests are not rewritten',async()=>{
  const calls=[];
  const fakeFetch=async input=>{calls.push(String(input));return new Response('{}',{status:200})};
  const fetcher=createResilientPncpDocumentFetch(fakeFetch,{sleepFn:noWait,signalFactory:noSignal,logger:silent});
  const url='https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao';
  const response=await fetcher(url);
  assert.equal(response.status,200);
  assert.deepEqual(calls,[url]);
});
