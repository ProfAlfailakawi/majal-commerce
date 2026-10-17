import test from 'node:test';
import assert from 'node:assert/strict';
import { publicProductImage } from './productImage';
import { buildDemoUniverse } from '../data/demoUniverse';

test('public product image is platform-owned, never the creator upload', () => {
  const hostile = { publicName: 'قرص عقيلي', category: 'حلويات', mediaUrls: ['https://evil.example/x.jpg'] };
  const src = publicProductImage(hostile);
  assert.ok(src.startsWith('/dishes/'));
  assert.ok(!src.includes('evil'));
});

test('every demo product resolves to a shipped house illustration', async () => {
  const { existsSync } = await import('node:fs');
  for (const p of buildDemoUniverse().products) {
    const src = publicProductImage(p);
    assert.ok(existsSync(`public${src}`), `${p.publicName} -> ${src}`);
  }
  assert.equal(publicProductImage(undefined), '/dishes/placeholder.svg');
});
