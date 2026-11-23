import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../draggable-ai-v1.js', import.meta.url), 'utf8');

test('the assistant launcher is positioned when the authenticated shell becomes visible', () => {
  const style = { setProperty(name, value) { this[name] = value; } };
  let visible = false;
  let onSizeChange;
  let onResize;
  const fab = {
    style,
    addEventListener() {},
    getBoundingClientRect() {
      if (!visible) return { width: 0, height: 0, left: 0, top: 0 };
      return { width: 90, height: 52, left: parseFloat(style.left) || 0, top: parseFloat(style.top) || 0 };
    },
  };
  const head = { addEventListener() {} };
  const win = { querySelector: () => head };
  const assistant = { querySelector: selector => selector === '.ai-window' ? win : selector === '.ai-window-head' ? head : null };
  const window = { innerWidth: 1363, innerHeight: 936, addEventListener() {} };
  vm.runInNewContext(source, {
    window,
    document: {
      readyState: 'complete',
      querySelector: () => fab,
      getElementById: () => assistant,
      addEventListener() {},
    },
    location: { hash: '' },
    localStorage: { getItem: () => null },
    ResizeObserver: class {
      constructor(callback) { onSizeChange = callback; }
      observe() {}
    },
    addEventListener: (_, callback) => { onResize = callback; },
  });

  onSizeChange();
  onResize();
  assert.equal(style.left, undefined);
  visible = true;
  onSizeChange();
  assert.equal(style.left, '1249px');
  assert.equal(style.top, '860px');

  window.innerWidth = 390;
  window.innerHeight = 700;
  onResize();
  assert.equal(style.left, '290px');
  assert.equal(style.top, '638px');
});
