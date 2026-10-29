import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

test('changing the display theme keeps the same app icon', async () => {
  const source = await readFile(new URL('./public/theme.js', import.meta.url), 'utf8');
  const icon = { href: 'http://localhost:3003/icon-192.png?v=3' };
  const controls = new Map();
  const control = (id) => {
    if (!controls.has(id)) controls.set(id, {
      textContent: '', value: '', handlers: {},
      classList: { toggle: () => false },
      addEventListener(event, handler) { this.handlers[event] = handler; },
      setAttribute() {},
    });
    return controls.get(id);
  };
  const document = {
    documentElement: { dataset: { theme: 'default' } },
    getElementById: control,
    querySelector(selector) {
      return selector === 'link[rel="icon"]' ? icon : { content: '#121212' };
    },
    title: '',
  };
  const context = {
    document, window: {},
    localStorage: { setItem() {} },
    MutationObserver: class { observe() {} },
  };
  vm.runInNewContext(source, context);

  control('themeSelect').value = 'workspace';
  control('themeSelect').handlers.change();
  assert.equal(document.documentElement.dataset.theme, 'workspace');
  assert.equal(icon.href, 'http://localhost:3003/icon-192.png?v=3');

  control('themeSelect').value = 'default';
  control('themeSelect').handlers.change();
  assert.equal(icon.href, 'http://localhost:3003/icon-192.png?v=3');
});
