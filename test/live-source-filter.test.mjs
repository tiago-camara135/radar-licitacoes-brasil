import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../source-transparency-v1.js', import.meta.url), 'utf8');

test('the filtered live feed attaches the official and platform links for the visible procurement', async () => {
  const national = {
    _pncpUrl: 'https://pncp.gov.br/app/editais/11111111111111/2026/1',
    _originUrl: 'https://compras.gov.br/processo/1',
  };
  const municipal = {
    _pncpUrl: 'https://pncp.gov.br/app/editais/22222222222222/2026/2',
    _originUrl: 'https://licitanet.com.br/processo/2',
  };
  let attached;
  const row = {
    querySelector(selector) {
      if (selector === '.item-open') return { getAttribute: () => municipal._pncpUrl };
      if (selector === '.item-meta') {
        return { insertAdjacentElement: (_, block) => { attached = block; } };
      }
      return null;
    },
  };
  const window = {
    fetch: async () => ({
      clone: () => ({ json: async () => ({ items: [national, municipal] }) }),
    }),
  };
  const scheduled = [];
  const document = {
    readyState: 'loading',
    addEventListener() {},
    getElementById: id => id === 'liveList' ? { querySelectorAll: () => [row] } : null,
    createElement() {
      return {
        dataset: {},
        children: [],
        appendChild(child) { this.children.push(child); },
        addEventListener() {},
        setAttribute() {},
        get childElementCount() { return this.children.length; },
      };
    },
  };
  vm.runInNewContext(source, {
    window, document, URL, location: { origin: 'https://radar.example' },
    queueMicrotask: callback => scheduled.push(callback),
    setTimeout: callback => callback(),
  });

  await window.fetch('/api/live-feed?limit=40');
  for (const job of scheduled) job();

  const [chip, actions] = attached.children;
  assert.equal(chip.textContent, 'Origem: Licitanet');
  assert.deepEqual(actions.children.map(link => link.href), [municipal._pncpUrl, municipal._originUrl]);
});
