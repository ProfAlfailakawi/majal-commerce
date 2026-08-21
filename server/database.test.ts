import assert from 'node:assert/strict';
import test from 'node:test';
import { databaseHealth, openMajalDatabase } from './database';

test('database migrations create the auth, payment, PACI and notification boundaries', async () => {
  const db = await openMajalDatabase({ filename: ':memory:' });
  try {
    assert.deepEqual(await databaseHealth(db), { ready: true, schemaVersion: 11, dialect: 'sqlite' });
    const tables = (await db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`).all()).map(row => String(row.name));
    for (const required of [
      'users',
      'sessions',
      'auth_events',
      'paci_auth_requests',
      'payment_intents',
      'payment_webhook_receipts',
      'notification_inbox',
      'notification_outbox',
      'organizations',
      'products',
      'recipe_versions',
      'recipe_access_grants',
      'collaborations',
      'orders',
      'accruals',
      'settlement_batches',
      'catalog_records',
      'order_events'
    ]) assert.ok(tables.includes(required), `missing table ${required}`);
    assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).length, 0);
    assert.equal(String((await db.prepare('PRAGMA integrity_check').get())?.integrity_check), 'ok');
  } finally {
    await db.close();
  }
});

test('catalog cursor indexes are present for million-record queries', async () => {
  const db = await openMajalDatabase({ filename: ':memory:' });
  try {
    const indexes = (await db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index'`).all()).map(row => String(row.name));
    assert.ok(indexes.includes('idx_catalog_tenant_status_cursor'));
    assert.ok(indexes.includes('idx_catalog_category_status_cursor'));
    assert.ok(indexes.includes('idx_order_events_order_time'));
    assert.ok(indexes.includes('idx_notification_inbox_cursor'));
  } finally {
    await db.close();
  }
});
