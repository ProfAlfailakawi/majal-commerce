import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import { createPaymentRegistry } from './payments';

/**
 * Payment webhook signature gate
 * ------------------------------
 * verifyWebhook() is the ONLY thing standing between a forged provider callback and a
 * fraudulent PAID capture on the tamper-evident ledger. Every other payment test exercises
 * applyVerifiedPaymentEvent() — i.e. AFTER this gate. This proves the HMAC gate itself:
 * a correct signature passes, a tampered signature or body is rejected.
 */
const WEBHOOK_SECRET = 'test-myfatoorah-webhook-secret';

function configuredRegistry() {
  process.env.PAYMENT_PROVIDER = 'MYFATOORAH';
  process.env.MYFATOORAH_API_TOKEN = 'x'.repeat(24);
  process.env.MYFATOORAH_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.MYFATOORAH_PAYMENT_METHOD_ID = '2';
  return createPaymentRegistry();
}

function signedWebhook() {
  const payload = {
    Event: { Code: 1, Name: 'PAYMENT_STATUS_CHANGED', Reference: 'evt_hmac_1' },
    Data: {
      Invoice: { Id: 'INV1', Status: 'Paid', ExternalIdentifier: null },
      Transaction: { Status: 'Success', PaymentId: 'PID1' },
      Amount: { BaseCurrency: 'KWD', ValueInBaseCurrency: '15.500' }
    }
  };
  const material = [
    'Invoice.Id=INV1',
    'Invoice.Status=Paid',
    'Transaction.Status=Success',
    'Transaction.PaymentId=PID1',
    'Invoice.ExternalIdentifier='
  ].join(',');
  const signature = createHmac('sha256', WEBHOOK_SECRET).update(material, 'utf8').digest('base64');
  return { rawBody: Buffer.from(JSON.stringify(payload)), signature };
}

test('a correctly signed MyFatoorah webhook verifies to a PAID event', async () => {
  const registry = configuredRegistry();
  assert.equal(registry.active.configured, true);
  const { rawBody, signature } = signedWebhook();
  const event = await registry.active.verifyWebhook(rawBody, { 'myfatoorah-signature': signature });
  assert.deepEqual(event, {
    provider: 'MYFATOORAH',
    eventId: 'evt_hmac_1',
    providerReference: 'INV1',
    status: 'PAID',
    amountFils: 15_500,
    currency: 'KWD'
  });
});

test('a forged signature is rejected', async () => {
  const registry = configuredRegistry();
  const { rawBody } = signedWebhook();
  await assert.rejects(
    () => registry.active.verifyWebhook(rawBody, { 'myfatoorah-signature': 'not-a-valid-signature' }),
    /MYFATOORAH_SIGNATURE_INVALID/
  );
});

test('a tampered body no longer matches its original signature', async () => {
  const registry = configuredRegistry();
  const { signature } = signedWebhook();
  const tampered = Buffer.from(JSON.stringify({
    Event: { Code: 1, Name: 'PAYMENT_STATUS_CHANGED', Reference: 'evt_hmac_1' },
    Data: {
      Invoice: { Id: 'INV1', Status: 'Paid', ExternalIdentifier: null },
      Transaction: { Status: 'Success', PaymentId: 'PID_TAMPERED' },
      Amount: { BaseCurrency: 'KWD', ValueInBaseCurrency: '15.500' }
    }
  }));
  await assert.rejects(
    () => registry.active.verifyWebhook(tampered, { 'myfatoorah-signature': signature }),
    /MYFATOORAH_SIGNATURE_INVALID/
  );
});
