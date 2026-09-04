import assert from 'node:assert/strict';
import test from 'node:test';
import { createUser } from './auth';
import { openMajalDatabase } from './database';
import { applyVerifiedPaymentEvent } from './payments';

/**
 * Order → PAID → accrual → refund pipeline
 * ----------------------------------------
 * Proves that a verified PAID webhook promotes the order and generates exactly one creator
 * royalty accrual computed from the accepted offer's basis points, that it is idempotent, and
 * that a REFUNDED webhook reverses both the order and the accrual.
 */
async function seed(db: Awaited<ReturnType<typeof openMajalDatabase>>) {
  const now = new Date().toISOString();
  const consumer = await createUser(db, { name: 'Consumer', email: 'buyer@example.test', password: 'Majal-Buyer-2026!', role: 'CONSUMER' });
  const creator = await createUser(db, { name: 'Creator', email: 'creator@example.test', password: 'Majal-Creator-2026!', role: 'CREATOR' });
  await db.prepare("INSERT INTO creator_profiles(id,user_id,display_name,specialty,created_at,updated_at) VALUES('cr_o',?,'C','b',?,?)").run(creator.id, now, now);
  await db.prepare("INSERT INTO organizations(id,commercial_name,organization_type,verification_status,created_at,updated_at) VALUES('org_o','Host','HOST','VERIFIED',?,?)").run(now, now);
  await db.prepare("INSERT INTO products(id,creator_id,public_name,category,short_description,status,estimated_unit_cost_fils,target_price_fils,created_at,updated_at) VALUES('prod_o','cr_o','Cake','DESSERT','desc','LIVE_PERMANENT',500,10000,?,?)").run(now, now);
  await db.prepare("INSERT INTO collaborations(id,product_id,creator_id,organization_id,stage,created_at,updated_at) VALUES('col_o','prod_o','cr_o','org_o','LIVE_TRIAL',?,?)").run(now, now);
  // Accepted offer: price 10.000 KWD (10000 fils), 15% creator royalty (1500 bp).
  await db.prepare("INSERT INTO offer_versions(id,collaboration_id,version_number,sender_user_id,selling_price_fils,creator_royalty_basis_points,platform_fee_basis_points,status,terms_json,created_at) VALUES('off_o','col_o',1,?,10000,1500,1000,'ACCEPTED','{}',?)").run(consumer.id, now);
  await db.prepare("INSERT INTO launches(id,collaboration_id,product_id,organization_id,status,quantity_cap,starts_at,created_at,updated_at) VALUES('lch_o','col_o','prod_o','org_o','LIVE',100,?,?,?)").run(now, now, now);
  // An order of 3 units at 10000 fils = 30000 fils, PENDING_PAYMENT, linked to a payment intent.
  // AUTHORIZED = provider checkout completed, capture webhook pending (PENDING_PROVIDER can't
  // reach PAID directly — that fail-closed gate is exactly why an un-wired provider blocks sales).
  await db.prepare("INSERT INTO payment_intents(id,order_public_id,user_id,provider,amount_fils,currency,status,idempotency_key,provider_reference,created_at,updated_at) VALUES('pi_o','ord_o',?,'TEST',30000,'KWD','AUTHORIZED','oi-ord_o','pref_o',?,?)").run(consumer.id, now, now);
  await db.prepare("INSERT INTO orders(id,launch_id,consumer_user_id,payment_intent_id,units,unit_price_fils,total_fils,status,created_at,updated_at) VALUES('ord_o','lch_o',?,'pi_o',3,10000,30000,'PENDING_PAYMENT',?,?)").run(consumer.id, now, now);
  return consumer;
}

test('a PAID webhook promotes the order and accrues 15% royalty exactly once', async () => {
  const db = await openMajalDatabase({ filename: ':memory:' });
  try {
    await seed(db);
    const paid = { provider: 'TEST', eventId: 'evt_paid', providerReference: 'pref_o', status: 'PAID' as const, amountFils: 30000, currency: 'KWD' as const };
    await applyVerifiedPaymentEvent(db, paid, Buffer.from('{"e":"paid"}'));

    const order = await db.prepare("SELECT status FROM orders WHERE id='ord_o'").get<{ status: string }>();
    assert.equal(order?.status, 'PAID');
    const accrual = await db.prepare("SELECT creator_id, amount_fils, status FROM accruals WHERE order_id='ord_o'").get<{ creator_id: string; amount_fils: number; status: string }>();
    // 30000 fils * 1500bp / 10000 = 4500 fils.
    assert.equal(accrual?.amount_fils, 4500);
    assert.equal(accrual?.creator_id, 'cr_o');
    assert.equal(accrual?.status, 'ELIGIBLE');

    // Retried PAID webhook is a no-op: still exactly one accrual.
    await applyVerifiedPaymentEvent(db, paid, Buffer.from('{"e":"paid"}'));
    const count = await db.prepare("SELECT COUNT(*) AS c FROM accruals WHERE order_id='ord_o'").get<{ c: number }>();
    assert.equal(Number(count?.c), 1);
  } finally {
    await db.close();
  }
});

test('a REFUNDED webhook reverses the order and its accrual', async () => {
  const db = await openMajalDatabase({ filename: ':memory:' });
  try {
    await seed(db);
    await applyVerifiedPaymentEvent(db, { provider: 'TEST', eventId: 'evt_paid', providerReference: 'pref_o', status: 'PAID' as const, amountFils: 30000, currency: 'KWD' as const }, Buffer.from('{"e":"paid"}'));
    await applyVerifiedPaymentEvent(db, { provider: 'TEST', eventId: 'evt_refund', providerReference: 'pref_o', status: 'REFUNDED' as const, amountFils: 30000, currency: 'KWD' as const }, Buffer.from('{"e":"refund"}'));

    const order = await db.prepare("SELECT status FROM orders WHERE id='ord_o'").get<{ status: string }>();
    assert.equal(order?.status, 'REFUNDED');
    const accrual = await db.prepare("SELECT status FROM accruals WHERE order_id='ord_o'").get<{ status: string }>();
    assert.equal(accrual?.status, 'REVERSED');
  } finally {
    await db.close();
  }
});
