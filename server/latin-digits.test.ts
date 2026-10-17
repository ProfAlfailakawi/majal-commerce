import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { AddressInfo } from 'node:net';
import { deepLatinDigits, toLatinDigits } from './latin-digits';
import { createShowcaseRouter } from './showcase';
import { openTestDatabase } from './test-db';

const config = {
  production: false, sessionSecret: 'test-session-secret-that-is-long-enough-123456',
  encryptionKey: 'test-encryption-key-that-is-long-enough-12345', sessionHours: 8, cookieName: 'majal_session', csrfCookieName: 'majal_csrf'
};

test('Arabic-Indic and Persian digits and separators become Latin; everything else is untouched', () => {
  assert.equal(toLatinDigits('٢٥ كغ'), '25 كغ');
  assert.equal(toLatinDigits('۱۲۳'), '123');
  assert.equal(toLatinDigits('٣٫٥٪ و١٬٠٠٠'), '3.5% و1,000');
  assert.equal(toLatinDigits('25 كغ'), '25 كغ');
  assert.equal(toLatinDigits('بدون أرقام'), 'بدون أرقام');
});

test('nested bodies are converted, keys and non-strings are kept, depth is bounded', () => {
  const body = { a: '١٠', n: 5, ok: true, nil: null, list: ['٢', { deep: '٣' }], nested: { x: '٤' } };
  assert.deepEqual(deepLatinDigits(body), { a: '10', n: 5, ok: true, nil: null, list: ['2', { deep: '3' }], nested: { x: '4' } });
  let deep: Record<string, unknown> = { v: '٩' };
  for (let i = 0; i < 20; i++) deep = { next: deep };
  assert.doesNotThrow(() => deepLatinDigits(deep));
});

test('a public submission with Arabic-Indic digits is stored and published with Latin digits', async () => {
  const db = await openTestDatabase();
  const app = express();
  app.use(express.json());
  app.use('/api/v1/showcase', createShowcaseRouter(db, config));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/showcase`;
  const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const supplier = await post('/suppliers', { name: 'مورد التغليف', category: 'PACKAGING', region: 'الري', description: 'علب وأكياس بكميات صغيرة للمشاريع الناشئة.', contactName: 'سعد', contactPhone: '٥٠٠٠٢٢٢٢', minOrder: '٢٥ كغ', termsAccepted: true });
    assert.equal(supplier.status, 201, await supplier.clone().text());
    const row = await db.prepare('SELECT min_order, contact_phone FROM supplier_directory').get<{ min_order: string; contact_phone: string }>();
    assert.equal(row?.min_order, '25 كغ');
    assert.ok(/^\+?965?5/.test(row!.contact_phone.replace(/\s/g, '')) || row!.contact_phone.includes('50002222'), `phone stored as Latin digits: ${row?.contact_phone}`);

    const ad = await post('/promo/requests', { company: 'شركة', headline: 'خصم ٢٠٪ على التغليف', tagline: 'يبدأ من ٥ د.ك', linkUrl: 'https://example.com', contactPhone: '50003333' });
    assert.equal(ad.status, 201, await ad.clone().text());
    const camp = await db.prepare('SELECT headline, tagline FROM ad_campaigns').get<{ headline: string; tagline: string }>();
    assert.deepEqual([camp?.headline, camp?.tagline], ['خصم 20% على التغليف', 'يبدأ من 5 د.ك']);
  } finally { await new Promise<void>(r => server.close(() => r())); await db.close(); }
});
