import assert from 'node:assert/strict';
import test from 'node:test';
import { createUser } from './auth';
import { openMajalDatabase } from './database';
import { createOrCoalesceNotification } from './notifications';
import { applyVerifiedPaymentEvent, parseKwdToFils } from './payments';

test('KWD amounts use exact fils and reject ambiguous precision', () => {
  assert.equal(parseKwdToFils('15.500'), 15_500);
  assert.equal(parseKwdToFils('0.001'), 1);
  assert.equal(parseKwdToFils('1.0009'), undefined);
  assert.equal(parseKwdToFils(-1), undefined);
});

test('verified payment events are idempotent and cannot change the amount', async () => {
  const db = await openMajalDatabase({ filename: ':memory:' });
  try {
    const user = await createUser(db, {
      name: 'Payment User',
      email: 'payment@example.test',
      password: 'Majal-Payment-2026!',
      role: 'CONSUMER'
    });
    const now = new Date().toISOString();
    await db.prepare(`
      INSERT INTO payment_intents(
        id, order_public_id, user_id, provider, amount_fils, currency,
        status, idempotency_key, provider_reference, created_at, updated_at
      ) VALUES('pay_test', 'ord_test', ?, 'TEST', 15500, 'KWD', 'REDIRECT_REQUIRED', 'idem_test_12345678', 'provider_ref_1', ?, ?)
    `).run(user.id, now, now);
    const event = { provider: 'TEST', eventId: 'evt_1', providerReference: 'provider_ref_1', status: 'PAID' as const, amountFils: 15_500, currency: 'KWD' as const };
    const raw = Buffer.from('{"event":"paid"}');
    assert.deepEqual(await applyVerifiedPaymentEvent(db, event, raw), { duplicate: false, processed: true, intentId: 'pay_test', status: 'PAID' });
    assert.deepEqual(await applyVerifiedPaymentEvent(db, event, raw), { duplicate: true, processed: true });
    await assert.rejects(() => applyVerifiedPaymentEvent(db, { ...event, eventId: 'evt_2', amountFils: 15_501 }, Buffer.from('{"event":"mismatch"}')), /PAYMENT_AMOUNT_MISMATCH/);
  } finally {
    await db.close();
  }
});

test('notifications coalesce repeated signals instead of spamming the user', async () => {
  const db = await openMajalDatabase({ filename: ':memory:' });
  try {
    const user = await createUser(db, {
      name: 'Notification User',
      email: 'notify@example.test',
      password: 'Majal-Notify-2026!',
      role: 'CREATOR'
    });
    const input = {
      userId: user.id,
      category: 'RECIPE_ACCESS',
      priority: 'NOW' as const,
      title: 'طلب وصول جديد',
      body: 'منشأة تنتظر قرارك.',
      dedupeKey: 'recipe-access:prd_1',
      actionLabel: 'راجع الطلب',
      actionSurface: 'CREATOR'
    };
    const first = await createOrCoalesceNotification(db, input);
    const second = await createOrCoalesceNotification(db, input);
    assert.equal(first.coalesced, false);
    assert.equal(second.coalesced, true);
    const row = await db.prepare('SELECT occurrence_count, status FROM notification_inbox WHERE id = ?').get(first.id);
    assert.equal(Number(row?.occurrence_count), 2);
    assert.equal(String(row?.status), 'UNREAD');
  } finally {
    await db.close();
  }
});
