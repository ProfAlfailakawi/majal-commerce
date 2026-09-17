import assert from 'node:assert/strict';
import test from 'node:test';
import { databaseHealth, openMajalDatabase } from './database';

test('database migrations create the auth, payment, PACI and notification boundaries', async () => {
  const db = await openMajalDatabase({ filename: ':memory:' });
  try {
    assert.deepEqual(await databaseHealth(db), { ready: true, schemaVersion: 19, dialect: 'sqlite' });
    const tables = (await db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`).all()).map(row => String(row.name));
    for (const required of [
      'users',
      'sessions',
      'auth_events',
      'password_reset_tokens',
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
      'order_events',
      'supplier_profiles',
      'supplier_offerings',
      'job_posts',
      'job_applications',
      'product_reviews',
      'moderation_actions'
    ]) assert.ok(tables.includes(required), `missing table ${required}`);

    // A review is only ever reachable through the order that paid for it: the UNIQUE
    // order_id is what makes "verified purchase" structural instead of self-declared.
    const reviewColumns = (await db.prepare('PRAGMA table_info(product_reviews)').all()).map(row => String(row.name));
    for (const column of ['order_id', 'reviewer_user_id', 'taste_rating', 'keep_it_vote']) {
      assert.ok(reviewColumns.includes(column), `missing product_reviews.${column}`);
    }
    const reviewIndexes = await db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='product_reviews'").all();
    assert.ok(reviewIndexes.some(row => String(row.sql ?? '').includes('order_id')) ||
      (await db.prepare('PRAGMA index_list(product_reviews)').all()).some(row => Number(row.unique) === 1),
      'product_reviews.order_id must be unique so one order yields at most one review');
    const userColumns = (await db.prepare('PRAGMA table_info(users)').all()).map(row => String(row.name));
    assert.ok(userColumns.includes('account_type'), 'missing users.account_type');
    assert.ok(userColumns.includes('supplier_id'), 'missing users.supplier_id');
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
