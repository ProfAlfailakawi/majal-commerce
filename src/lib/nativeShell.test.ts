import test from 'node:test';
import assert from 'node:assert/strict';
import { isNativeApp, openCheckout, pollUntil } from './nativeShell.ts';

const g = globalThis as unknown as { window?: unknown };
const setWindow = (cap?: unknown) => { g.window = cap === undefined ? {} : { Capacitor: cap }; };

test('browser: isNativeApp false and checkout navigates in place', async () => {
  setWindow();
  assert.equal(isNativeApp(), false);
  let went = '';
  assert.equal(await openCheckout('https://pay/x', () => assert.fail('no done'), u => { went = u; }), 'browser');
  assert.equal(went, 'https://pay/x');
});

test('native: opens in Browser plugin, no navigation, done fires once on browserFinished', async () => {
  const cbs: Record<string, () => void> = {};
  let opened = '';
  setWindow({ isNativePlatform: () => true, Plugins: { Browser: { open: async (o: { url: string }) => { opened = o.url; }, addListener: (e: string, cb: () => void) => { cbs[e] = cb; return { remove() {} }; } }, App: { addListener: () => ({ remove() {} }) } } });
  let done = 0;
  assert.equal(await openCheckout('https://pay/x', () => { done++; }, () => assert.fail('must not navigate')), 'native');
  assert.equal(opened, 'https://pay/x');
  cbs.browserFinished(); cbs.browserFinished();
  assert.equal(done, 1);
});

test('native without Browser plugin falls back to navigation', async () => {
  setWindow({ isNativePlatform: () => true, Plugins: {} });
  let went = '';
  assert.equal(await openCheckout('u', () => {}, u => { went = u; }), 'browser');
  assert.equal(went, 'u');
});

test('pollUntil stops when check succeeds', async () => {
  let n = 0;
  assert.equal(await pollUntil(async () => ++n === 3, 6, 0, async () => {}), true);
  assert.equal(n, 3);
});

import { statusBarStyleFor } from './theme.ts';
test('status bar style follows theme', () => {
  assert.equal(statusBarStyleFor('light'), 'DARK');
  assert.equal(statusBarStyleFor('dark'), 'LIGHT');
  assert.equal(statusBarStyleFor('contrast'), 'LIGHT');
});
