import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const guard=fs.readFileSync(new URL('../production-v24.mjs',import.meta.url),'utf8');
const companyDocs=fs.readFileSync(new URL('../company-documents-v1.js',import.meta.url),'utf8');
const production4=fs.readFileSync(new URL('../production-v4.mjs',import.meta.url),'utf8');

test('origin guard preserves composed frontend instead of short-circuiting app asset',()=>{
  assert.doesNotMatch(guard,/pathname===['"]\/assets\/app-v2\.js['"]/);
  assert.match(guard,/fs\.readFileSync=function consistencyReadFileSync/);
  assert.match(guard,/composed-runtime-chain/);
});

test('habilitation module remains in runtime composition chain',()=>{
  assert.match(companyDocs,/__rlbCompanyDocumentsV1/);
  assert.match(companyDocs,/habilitationNav/);
  assert.match(companyDocs,/view-habilitation/);
  assert.match(production4,/companyDocumentsJs/);
  assert.match(production4,/initCompanyDocuments/);
});
