import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parsePncpDocumentUrl,extractOriginDocumentUrls,decodePdfUpload,isSafePublicOriginUrl } from '../tender-source-resilience-v2.mjs';

test('PNCP document URLs are classified for list and individual file',()=>{
  assert.deepEqual(parsePncpDocumentUrl('https://pncp.gov.br/api/pncp/v1/orgaos/04214217000155/compras/2026/100/arquivos'),{cnpj:'04214217000155',year:2026,sequence:100,kind:'list',documentSequence:null});
  assert.equal(parsePncpDocumentUrl('https://pncp.gov.br/pncp-api/v1/orgaos/04214217000155/compras/2026/100/arquivos/9').kind,'file');
});

test('origin discovery prefers public PDF/download links and rejects local URLs',()=>{
  const html=`<a href="/download/edital.pdf">Edital</a><script>const x="https:\\/\\/arquivos.portaldecompraspublicas.com.br\\/v1\\/download\\/abc123";</script><a href="http://127.0.0.1/private.pdf">x</a>`;
  const urls=extractOriginDocumentUrls(html,'https://www.portaldecompraspublicas.com.br/processos/x');
  assert.equal(urls.some(x=>x.includes('/download/edital.pdf')),true);
  assert.equal(urls.some(x=>x.includes('arquivos.portaldecompraspublicas.com.br/v1/download/abc123')),true);
  assert.equal(urls.some(x=>x.includes('127.0.0.1')),false);
  assert.equal(isSafePublicOriginUrl('http://localhost/a.pdf'),false);
});

test('uploaded source accepts real PDF signature and rejects disguised files',()=>{
  const valid=Buffer.from('%PDF-1.7\nfake-test-body').toString('base64');
  assert.equal(decodePdfUpload(valid,1024).subarray(0,5).toString(),'%PDF-');
  assert.throws(()=>decodePdfUpload(Buffer.from('not a pdf').toString('base64'),1024),/PDF válido/);
});

test('production runtime exposes multifonte document resilience and temporary PDF fallback',()=>{
  const runtime=fs.readFileSync(new URL('../production-v31.mjs',import.meta.url),'utf8');
  const ui=fs.readFileSync(new URL('../tender-intelligence-upload-v1.js',import.meta.url),'utf8');
  assert.match(runtime,/discoverOriginDocuments/);
  assert.match(runtime,/upload-source/);
  assert.match(runtime,/AsyncLocalStorage/);
  assert.match(runtime,/x-rlb-upload-token/);
  assert.match(runtime,/origin discovery \+ PDF upload fallback/);
  assert.match(ui,/Continuar sem depender do PNCP/);
  assert.match(ui,/Analisar PDF agora/);
  assert.match(ui,/18 MB/);
});
