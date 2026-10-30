import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { apiFetch } from './apiFetch';
import { isPlatformUpdating, nextDelay, UPDATING_CODE, UPDATING_MESSAGE, UPDATING_WRITE_MESSAGE } from './updatingNotice';

const GOOGLE_502 = '<html><title>Error 502 (Server Error)!!1</title></html>';

async function withFetch<T>(answer: () => Response, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => answer()) as typeof fetch;
  try { return await run(); } finally { globalThis.fetch = original; }
}

test('only a non-JSON 5xx is the platform updating; the app\'s own JSON errors stay as they are', () => {
  assert.ok(isPlatformUpdating(502, 'text/html; charset=UTF-8'));
  assert.ok(isPlatformUpdating(503, ''));
  assert.ok(isPlatformUpdating(500, 'text/html'));
  assert.ok(isPlatformUpdating(504, null));
  assert.ok(!isPlatformUpdating(503, 'application/json; charset=utf-8'), 'boot gate 503 is JSON');
  assert.ok(!isPlatformUpdating(404, 'text/html'));
  assert.ok(!isPlatformUpdating(200, 'text/html'));
});

test('apiFetch turns the platform page into a calm JSON answer callers can read', async () => {
  const read = await withFetch(() => new Response(GOOGLE_502, { status: 502, headers: { 'Content-Type': 'text/html' } }), () => apiFetch('/api/v1/domain/snapshot'));
  assert.equal(read.status, 503);
  assert.deepEqual(await read.json(), { error: UPDATING_MESSAGE, code: UPDATING_CODE });
  const write = await withFetch(() => new Response(GOOGLE_502, { status: 503, headers: { 'Content-Type': 'text/html' } }), () => apiFetch('/api/v1/orders', { method: 'POST', body: '{}' }));
  assert.equal((await write.json()).error, UPDATING_WRITE_MESSAGE);
});

test('apiFetch leaves the server\'s own JSON 5xx and successful answers untouched', async () => {
  const own = await withFetch(() => new Response(JSON.stringify({ error: 'حدث خطأ غير متوقع.' }), { status: 500, headers: { 'Content-Type': 'application/json' } }), () => apiFetch('/api/x'));
  assert.equal(own.status, 500);
  assert.equal((await own.json()).error, 'حدث خطأ غير متوقع.');
  const ok = await withFetch(() => new Response('{"a":1}', { status: 200, headers: { 'Content-Type': 'application/json' } }), () => apiFetch('/api/x'));
  assert.deepEqual(await ok.json(), { a: 1 });
});

test('the notice polls every 3 s and slows to 15 s; the copy has no emoji (DESIGN_SYSTEM.md)', () => {
  assert.equal(nextDelay(0), 3000);
  assert.equal(nextDelay(5), 3000);
  assert.ok(nextDelay(8) > 3000);
  assert.equal(nextDelay(40), 15000);
  assert.ok(UPDATING_MESSAGE.includes('نُحدّث مجال'));
  assert.ok(!/\p{Extended_Pictographic}/u.test(UPDATING_WRITE_MESSAGE));
});

test('recovery asks the server before wiping caches or unregistering the worker', () => {
  const source = fs.readFileSync('src/lib/app-update.ts', 'utf8');
  const chunk = source.slice(source.indexOf('async function recoverFromStaleChunk'), source.indexOf('export function markShellHealthy'));
  assert.ok(chunk.indexOf('await serverAnswers()') > 0 && chunk.indexOf('await serverAnswers()') < chunk.indexOf('purgeShell()'));
  const reconcile = source.slice(source.indexOf('function reconcileAfterReload'), source.indexOf('async function checkForUpdate'));
  assert.ok(reconcile.indexOf('await serverAnswers()') > 0 && reconcile.indexOf('await serverAnswers()') < reconcile.indexOf('purgeShell()'));
  assert.ok(reconcile.indexOf('await serverAnswers()') < reconcile.indexOf("writeLocal(HARD_KEY, '1')"));
  assert.match(source, /window\.addEventListener\(SERVER_BACK_EVENT/);
  const version = source.slice(source.indexOf('async function fetchServerBuild'), source.indexOf('async function applyUpdate'));
  assert.ok(version.indexOf('if (!response.ok) return null;') < version.indexOf('response.json()'), 'version check never reads the error page');
});
