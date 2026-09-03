import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac, randomUUID } from 'node:crypto';
import { createPaymentRegistry } from './payments';

/**
 * Lemon Squeezy webhook gate
 * --------------------------
 * Lemon Squeezy does not settle in KWD, and its webhook names an order rather than
 * the checkout that produced it. Two invariants therefore carry the whole adapter:
 *
 *   1. the HMAC-SHA256 signature over the raw body proves the payload's origin, and
 *   2. the provider's charged total must equal the echoed KWD amount converted at the
 *      operator-declared rate.
 *
 * Signature alone would let a genuine-but-wrong-amount order settle as PAID, so both
 * are proven here independently.
 */
const WEBHOOK_SECRET = 'test-lemonsqueezy-signing-secret';
const INTENT_ID = `pay_${randomUUID()}`;
const REFERENCE = `ls_${INTENT_ID}`;
const AMOUNT_FILS = 15_500;          // 15.500 KWD
const KWD_RATE = 3.26;               // operator-declared USD per KWD
const EXPECTED_TOTAL = Math.round((AMOUNT_FILS / 1000) * KWD_RATE * 100); // 5053 cents

function configuredRegistry() {
  process.env.PAYMENT_PROVIDER = 'LEMONSQUEEZY';
  process.env.LEMONSQUEEZY_API_KEY = 'x'.repeat(32);
  process.env.LEMONSQUEEZY_STORE_ID = '12345';
  process.env.LEMONSQUEEZY_VARIANT_ID = '67890';
  process.env.LEMONSQUEEZY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.LEMONSQUEEZY_SETTLEMENT_CURRENCY = 'USD';
  process.env.LEMONSQUEEZY_KWD_RATE = String(KWD_RATE);
  return createPaymentRegistry();
}

function webhook(overrides: { eventName?: string; status?: string; total?: number; currency?: string; reference?: string } = {}) {
  const payload = {
    meta: {
      event_name: overrides.eventName ?? 'order_created',
      custom_data: {
        majal_reference: overrides.reference ?? REFERENCE,
        majal_intent_id: INTENT_ID,
        majal_order_public_id: 'ORD-1001',
        majal_amount_fils: String(AMOUNT_FILS)
      }
    },
    data: {
      type: 'orders',
      id: '9911',
      attributes: {
        status: overrides.status ?? 'paid',
        total: overrides.total ?? EXPECTED_TOTAL,
        currency: overrides.currency ?? 'USD'
      }
    }
  };
  const rawBody = Buffer.from(JSON.stringify(payload));
  return { rawBody, signature: createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex') };
}

test('a correctly signed Lemon Squeezy order verifies to a PAID event in KWD fils', async () => {
  const registry = configuredRegistry();
  assert.equal(registry.active.configured, true);
  assert.equal(registry.readiness.settlementCurrency, 'USD');
  const { rawBody, signature } = webhook();
  const event = await registry.active.verifyWebhook(rawBody, { 'x-signature': signature });
  assert.deepEqual(event, {
    provider: 'LEMONSQUEEZY',
    eventId: 'order_created:9911',
    providerReference: REFERENCE,
    status: 'PAID',
    amountFils: AMOUNT_FILS,
    currency: 'KWD'
  });
});

test('a forged signature is rejected', async () => {
  const registry = configuredRegistry();
  const { rawBody } = webhook();
  await assert.rejects(
    () => registry.active.verifyWebhook(rawBody, { 'x-signature': 'deadbeef'.repeat(8) }),
    /LEMONSQUEEZY_SIGNATURE_INVALID/
  );
});

test('a tampered body no longer matches its original signature', async () => {
  const registry = configuredRegistry();
  const { signature } = webhook();
  const { rawBody: tampered } = webhook({ total: EXPECTED_TOTAL * 2 });
  await assert.rejects(
    () => registry.active.verifyWebhook(tampered, { 'x-signature': signature }),
    /LEMONSQUEEZY_SIGNATURE_INVALID/
  );
});

test('a validly signed order charging the wrong amount is rejected, not settled', async () => {
  const registry = configuredRegistry();
  // Correctly signed, genuinely from the provider — but only a fraction was charged.
  const { rawBody, signature } = webhook({ total: 1 });
  await assert.rejects(
    () => registry.active.verifyWebhook(rawBody, { 'x-signature': signature }),
    /LEMONSQUEEZY_AMOUNT_MISMATCH/
  );
});

test('a settlement currency other than the configured one is rejected', async () => {
  const registry = configuredRegistry();
  const { rawBody, signature } = webhook({ currency: 'EUR' });
  await assert.rejects(
    () => registry.active.verifyWebhook(rawBody, { 'x-signature': signature }),
    /LEMONSQUEEZY_CURRENCY_MISMATCH/
  );
});

test('a payload without the signed MAJAL correlation reference cannot resolve to an intent', async () => {
  const registry = configuredRegistry();
  const { rawBody, signature } = webhook({ reference: 'not-a-majal-reference' });
  await assert.rejects(
    () => registry.active.verifyWebhook(rawBody, { 'x-signature': signature }),
    /LEMONSQUEEZY_REFERENCE_MISSING/
  );
});

test('a refund event maps to REFUNDED so the ledger can reverse the capture', async () => {
  const registry = configuredRegistry();
  const { rawBody, signature } = webhook({ eventName: 'order_refunded', status: 'refunded' });
  const event = await registry.active.verifyWebhook(rawBody, { 'x-signature': signature });
  assert.equal(event.status, 'REFUNDED');
  assert.equal(event.eventId, 'order_refunded:9911');
});

test('an unconfigured Lemon Squeezy provider fails closed instead of accepting events', async () => {
  process.env.PAYMENT_PROVIDER = 'LEMONSQUEEZY';
  process.env.LEMONSQUEEZY_KWD_RATE = '0';
  const registry = createPaymentRegistry();
  assert.equal(registry.active.configured, false);
  assert.ok(registry.readiness.missing.includes('LEMONSQUEEZY_KWD_RATE'));
  await assert.rejects(() => registry.active.verifyWebhook(Buffer.from('{}'), {}), /PAYMENT_PROVIDER_NOT_CONFIGURED/);
});
