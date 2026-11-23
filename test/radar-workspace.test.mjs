import test from 'node:test';
import assert from 'node:assert/strict';
import { applySearchFilters } from '../pncp-client-v3.mjs';
import { createRadarWorkspaceRouter } from '../radar-workspace-v1.mjs';

test('Radar combines UFs, accent-insensitive keywords, synonyms and proposal deadlines', () => {
  const item = (id, object, city, state, days) => ({
    numeroControlePNCP: id, numeroCompra: id, anoCompra: 2026, objetoCompra: object,
    orgaoEntidade: { razaoSocial: 'Prefeitura de ' + city },
    unidadeOrgao: { municipioNome: city, ufSigla: state },
    dataEncerramentoProposta: new Date(Date.now() + days * 86400000).toISOString()
  });
  const rn = item('1', 'Aquisição de pneus', 'Natal', 'RN', 2);
  const pb = item('2', 'Pneumáticos para a frota', 'João Pessoa', 'PB', 1);
  const items = [rn, pb, item('3', 'Aquisição de pneus', 'Recife', 'PE', 2),
    item('4', 'Aquisição de pneus', 'Mossoró', 'RN', -1), item('5', 'Aquisição de pneus', 'Mossoró', 'RN', 10)];
  const filters = { workspace: true, states: 'RN,PB', openOnly: true, closingDays: 7, order: 'deadline' };
  assert.deepEqual(applySearchFilters(items, {...filters, keyword: 'pneus'}), [pb, rn]);
  assert.deepEqual(applySearchFilters(items, {...filters, keyword: 'pneu joao pessoa'}), [pb]);
  assert.deepEqual(applySearchFilters(items, {...filters, keyword: '2/2026'}), [pb]);
  assert.deepEqual(applySearchFilters(items, {...filters, keyword: 'aquisicao natal'}), [rn]);
  assert.deepEqual(applySearchFilters(items, {...filters, keyword: 'constructor'}), []);
  assert.deepEqual(applySearchFilters([pb], { keyword: 'pneus' }), []);
});

test('Saved searches and opportunities are scoped to the authenticated user and kind', async () => {
  const route = createRadarWorkspaceRouter({ pool: null, readJson: async request => request.body,
    json: (_, status, data) => ({ status, data }) });
  const request = (id, method, path, body) => route({method, body, headers: {}}, {}, new URL(path,'http://localhost'), {id});
  const root = '/api/radar/saved/';
  const search = {name: 'Pneus RN/PB', query: 'keyword=pneus&states=PB,RN'};
  const tender = {title: 'Aquisição de pneus', official: 'javascript:alert(1)'};
  assert.equal((await request(1, 'PUT', root+'search/a', search)).status, 200);
  assert.equal((await request(1, 'PUT', root+'tender/a', tender)).data.item.payload.official, '');
  assert.deepEqual((await request(2, 'GET', root+'search')).data.items, []);
  await request(2, 'DELETE', root+'search/a');
  assert.deepEqual((await request(1, 'GET', root+'search')).data.items, [{key:'a', payload:search}]);
  await request(1, 'DELETE', root+'search/a');
  assert.deepEqual((await request(1, 'GET', root+'search')).data.items, []);
  assert.equal((await request(1, 'GET', root+'tender')).data.items.length, 1);
});

test('Radar delivers official PNCP PDFs as attachments and keeps upstream fallback on the fixed source', async t => {
  let sentUrl;
  const pdf = Buffer.from('%PDF-1.7 test');
  const requestFetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    sentUrl = url;
    assert.equal(options.redirect, 'manual');
    return new Response(pdf, { headers: { 'Content-Type': 'application/pdf' } });
  });
  const route = createRadarWorkspaceRouter({pool:null, readJson:async()=>({}), json:()=>{}});
  const headers = new Map();
  const response = {setHeader:(key,value)=>headers.set(key,value), end(body){this.body=body}};
  const url = new URL('http://localhost/api/radar/documents/12345678000199/2026/1/2/download?name=Edital%20p%C3%BAblico');
  await route({method:'GET'}, response, url, {id:1});
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, pdf);
  assert.equal(headers.get('Content-Disposition'), "attachment; filename*=UTF-8''Edital%20p%C3%BAblico.pdf");
  assert.equal(sentUrl, 'https://pncp.gov.br/api/pncp/v1/orgaos/12345678000199/compras/2026/1/arquivos/2');
  requestFetch.mock.mockImplementation(async () => Response.redirect('https://example.test'));
  await route({method:'GET'}, response, url, {id:1});
  assert.equal(response.statusCode, 302);
  assert.equal(headers.get('Location'), sentUrl);
});

test('initial UF is validated and isolated per account', async () => {
  const route = createRadarWorkspaceRouter({pool:null, readJson:async req=>req.body, json:(_,status,data)=>({status,data})});
  const url = new URL('http://localhost/api/radar/preferences');
  const call = (id,method,uf,headers={}) => route({method,body:{uf},headers},{},url,{id});
  assert.deepEqual(await call(1,'GET'), {status:200,data:{uf:''}});
  assert.equal((await call(1,'PUT','XX')).status,400);
  assert.equal((await call(1,'PUT','RN',{'sec-fetch-site':'cross-site'})).status,403);
  assert.deepEqual(await call(1,'PUT','RN'), {status:200,data:{uf:'RN'}});
  assert.deepEqual(await call(2,'PUT','SP'), {status:200,data:{uf:'SP'}});
  assert.deepEqual(await call(1,'GET'), {status:200,data:{uf:'RN'}});
  await call(1,'PUT','');
  assert.deepEqual(await call(1,'GET'), {status:200,data:{uf:''}});
  assert.deepEqual(await call(2,'GET'), {status:200,data:{uf:'SP'}});
});
