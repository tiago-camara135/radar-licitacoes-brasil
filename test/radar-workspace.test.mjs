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
