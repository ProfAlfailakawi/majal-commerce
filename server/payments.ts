import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Request, Response, Router } from 'express';
import { AuthConfig, AuthenticatedRequest, requireAuth, requireCsrf } from './auth';
import { MajalDatabase, withTransaction } from './database';
import { appendLedgerEntry } from './ledger';
import { isKillSwitchEngaged } from './kill-switch';

export type PaymentIntentStatus =
  | 'PENDING_PROVIDER'
  | 'REDIRECT_REQUIRED'
  | 'AUTHORIZED'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED';

export interface PaymentCreateInput {
  intentId: string;
  orderPublicId: string;
  amountFils: number;
  currency: 'KWD';
  customerReference: string;
  idempotencyKey: string;
  returnUrl: string;
}

export interface PaymentCreateResult {
  providerReference: string;
  status: 'REDIRECT_REQUIRED' | 'AUTHORIZED';
  checkoutUrl?: string;
}

export interface VerifiedPaymentEvent {
  provider: string;
  eventId: string;
  providerReference: string;
  status: 'AUTHORIZED' | 'PAID' | 'FAILED' | 'CANCELLED' | 'REFUNDED';
  amountFils: number;
  currency: 'KWD';
}

export interface PaymentGateway {
  readonly provider: string;
  readonly configured: boolean;
  createIntent(input: PaymentCreateInput): Promise<PaymentCreateResult>;
  verifyWebhook(rawBody: Buffer, headers: Request['headers']): Promise<VerifiedPaymentEvent>;
}

class DisabledPaymentGateway implements PaymentGateway {
  readonly provider = 'DISABLED';
  readonly configured = false;
  async createIntent(): Promise<PaymentCreateResult> {
    throw new Error('PAYMENT_PROVIDER_NOT_CONFIGURED');
  }
  async verifyWebhook(): Promise<VerifiedPaymentEvent> {
    throw new Error('PAYMENT_PROVIDER_NOT_CONFIGURED');
  }
}


function paymentSafeEqual(actual: string, expected: string) {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

type MyFatoorahPaymentWebhook = {
  Event?: { Code?: number; Name?: string; Reference?: string };
  Data?: {
    Invoice?: { Id?: string | number; Status?: string; ExternalIdentifier?: string | null };
    Transaction?: { Status?: string; PaymentId?: string | null };
    Amount?: { BaseCurrency?: string; ValueInBaseCurrency?: string | number };
  };
};

class MyFatoorahGateway implements PaymentGateway {
  readonly provider = 'MYFATOORAH';
  readonly configured: boolean;
  private readonly token = process.env.MYFATOORAH_API_TOKEN?.trim() || '';
  private readonly webhookSecret = process.env.MYFATOORAH_WEBHOOK_SECRET?.trim() || '';
  private readonly paymentMethodId = Number(process.env.MYFATOORAH_PAYMENT_METHOD_ID || 0);
  private readonly baseUrl = (process.env.MYFATOORAH_BASE_URL || 'https://api.myfatoorah.com').replace(/\/$/, '');

  constructor() {
    this.configured = this.token.length >= 20 && this.webhookSecret.length >= 16 && Number.isInteger(this.paymentMethodId) && this.paymentMethodId > 0;
  }

  async createIntent(input: PaymentCreateInput): Promise<PaymentCreateResult> {
    if (!this.configured) throw new Error('PAYMENT_PROVIDER_NOT_CONFIGURED');
    const callback = new URL(input.returnUrl);
    if (callback.protocol !== 'https:' && process.env.NODE_ENV === 'production') throw new Error('PAYMENT_RETURN_URL_MUST_BE_HTTPS');
    const amount = (input.amountFils / 1000).toFixed(3);
    const response = await fetch(`${this.baseUrl}/v2/ExecutePayment`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
        accept: 'application/json',
        'idempotency-key': input.idempotencyKey
      },
      body: JSON.stringify({
        InvoiceValue: Number(amount),
        PaymentMethodId: this.paymentMethodId,
        CallBackUrl: input.returnUrl,
        ErrorUrl: input.returnUrl,
        DisplayCurrencyIso: 'KWD',
        Language: 'AR',
        CustomerReference: input.orderPublicId,
        UserDefinedField: input.intentId
      }),
      signal: AbortSignal.timeout(12_000)
    });
    const payload = await response.json() as {
      IsSuccess?: boolean;
      Message?: string;
      Data?: { InvoiceId?: string | number; PaymentURL?: string };
    };
    if (!response.ok || payload.IsSuccess !== true || !payload.Data?.InvoiceId || !payload.Data?.PaymentURL) {
      throw new Error(`MYFATOORAH_CREATE_FAILED_${response.status}`);
    }
    const checkout = new URL(payload.Data.PaymentURL);
    if (!['https:', 'http:'].includes(checkout.protocol)) throw new Error('MYFATOORAH_INVALID_PAYMENT_URL');
    return {
      providerReference: String(payload.Data.InvoiceId),
      status: 'REDIRECT_REQUIRED',
      checkoutUrl: checkout.toString()
    };
  }

  async verifyWebhook(rawBody: Buffer, headers: Request['headers']): Promise<VerifiedPaymentEvent> {
    if (!this.configured) throw new Error('PAYMENT_PROVIDER_NOT_CONFIGURED');
    let payload: MyFatoorahPaymentWebhook;
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as MyFatoorahPaymentWebhook;
    } catch {
      throw new Error('MYFATOORAH_WEBHOOK_INVALID_JSON');
    }
    if (payload.Event?.Code !== 1 || payload.Event?.Name !== 'PAYMENT_STATUS_CHANGED') throw new Error('MYFATOORAH_EVENT_NOT_SUPPORTED');
    const invoice = payload.Data?.Invoice;
    const transaction = payload.Data?.Transaction;
    const amount = payload.Data?.Amount;
    if (!invoice?.Id || !transaction?.Status || !payload.Event.Reference || amount?.BaseCurrency !== 'KWD') {
      throw new Error('MYFATOORAH_WEBHOOK_INVALID_PAYLOAD');
    }
    const signatureMaterial = [
      `Invoice.Id=${invoice.Id ?? ''}`,
      `Invoice.Status=${invoice.Status ?? ''}`,
      `Transaction.Status=${transaction.Status ?? ''}`,
      `Transaction.PaymentId=${transaction.PaymentId ?? ''}`,
      `Invoice.ExternalIdentifier=${invoice.ExternalIdentifier ?? ''}`
    ].join(',');
    const expected = createHmac('sha256', this.webhookSecret).update(signatureMaterial, 'utf8').digest('base64');
    const suppliedHeader = headers['myfatoorah-signature'];
    const supplied = Array.isArray(suppliedHeader) ? suppliedHeader[0] : suppliedHeader;
    if (!supplied || !paymentSafeEqual(String(supplied).trim(), expected)) throw new Error('MYFATOORAH_SIGNATURE_INVALID');

    const amountFils = parseKwdToFils(amount.ValueInBaseCurrency);
    if (!amountFils) throw new Error('MYFATOORAH_AMOUNT_INVALID');
    const providerStatus = String(transaction.Status).toUpperCase();
    const status: VerifiedPaymentEvent['status'] = providerStatus === 'SUCCESS'
      ? 'PAID'
      : providerStatus === 'AUTHORIZE'
        ? 'AUTHORIZED'
        : providerStatus === 'CANCELED'
          ? 'CANCELLED'
          : 'FAILED';
    return {
      provider: this.provider,
      eventId: String(payload.Event.Reference),
      providerReference: String(invoice.Id),
      status,
      amountFils,
      currency: 'KWD'
    };
  }
}

/**
 * Lemon Squeezy adapter.
 *
 * Two facts shape this adapter and are enforced rather than hidden:
 *
 * 1. Lemon Squeezy does not settle in KWD. The platform ledger is KWD-only
 *    (`payment_intents.currency CHECK(currency = 'KWD')`), so the operator must
 *    declare a settlement currency and an explicit KWD conversion rate. The rate
 *    is configuration, never a guess, and never fetched at runtime — a silently
 *    moving rate would make the charged amount unverifiable after the fact.
 *
 * 2. Lemon Squeezy webhooks identify an *order*, not the checkout that produced
 *    it. The correlation key is therefore minted here (`ls_<intentId>`), sent as
 *    signed checkout custom data, and echoed back inside the HMAC-protected
 *    payload. Because the whole body is signed, the echoed key and the echoed
 *    KWD amount are as trustworthy as the signature itself.
 *
 * Integrity check on every event: the provider's own charged total (settlement
 * minor units) must equal the amount derived from the echoed KWD fils at the
 * configured rate. A signature alone proves origin; this proves the customer was
 * charged the KWD amount this platform recorded.
 */
type LemonSqueezyWebhook = {
  meta?: { event_name?: string; custom_data?: Record<string, unknown> };
  data?: {
    type?: string;
    id?: string | number;
    attributes?: { status?: string; total?: number; currency?: string; refunded?: boolean };
  };
};

const LEMONSQUEEZY_MINOR_UNITS = 100;

class LemonSqueezyGateway implements PaymentGateway {
  readonly provider = 'LEMONSQUEEZY';
  readonly configured: boolean;
  private readonly apiKey = process.env.LEMONSQUEEZY_API_KEY?.trim() || '';
  private readonly storeId = process.env.LEMONSQUEEZY_STORE_ID?.trim() || '';
  private readonly variantId = process.env.LEMONSQUEEZY_VARIANT_ID?.trim() || '';
  private readonly webhookSecret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET?.trim() || '';
  private readonly settlementCurrency = (process.env.LEMONSQUEEZY_SETTLEMENT_CURRENCY || 'USD').trim().toUpperCase();
  private readonly kwdRate = Number(process.env.LEMONSQUEEZY_KWD_RATE || 0);
  private readonly baseUrl = (process.env.LEMONSQUEEZY_BASE_URL || 'https://api.lemonsqueezy.com').replace(/\/$/, '');

  constructor() {
    this.configured =
      this.apiKey.length >= 20 &&
      /^\d+$/.test(this.storeId) &&
      /^\d+$/.test(this.variantId) &&
      this.webhookSecret.length >= 16 &&
      /^[A-Z]{3}$/.test(this.settlementCurrency) &&
      Number.isFinite(this.kwdRate) && this.kwdRate > 0;
  }

  /** KWD fils -> settlement-currency minor units, at the operator-declared rate. */
  private settlementMinorUnits(amountFils: number) {
    const value = Math.round((amountFils / 1000) * this.kwdRate * LEMONSQUEEZY_MINOR_UNITS);
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error('LEMONSQUEEZY_AMOUNT_CONVERSION_INVALID');
    return value;
  }

  async createIntent(input: PaymentCreateInput): Promise<PaymentCreateResult> {
    if (!this.configured) throw new Error('PAYMENT_PROVIDER_NOT_CONFIGURED');
    const redirect = new URL(input.returnUrl);
    if (redirect.protocol !== 'https:' && process.env.NODE_ENV === 'production') throw new Error('PAYMENT_RETURN_URL_MUST_BE_HTTPS');
    const reference = `ls_${input.intentId}`;
    const customPrice = this.settlementMinorUnits(input.amountFils);

    const response = await fetch(`${this.baseUrl}/v1/checkouts`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/vnd.api+json',
        accept: 'application/vnd.api+json'
      },
      body: JSON.stringify({
        data: {
          type: 'checkouts',
          attributes: {
            custom_price: customPrice,
            checkout_data: {
              custom: {
                majal_reference: reference,
                majal_intent_id: input.intentId,
                majal_order_public_id: input.orderPublicId,
                majal_amount_fils: String(input.amountFils)
              }
            },
            product_options: { redirect_url: input.returnUrl }
          },
          relationships: {
            store: { data: { type: 'stores', id: this.storeId } },
            variant: { data: { type: 'variants', id: this.variantId } }
          }
        }
      }),
      signal: AbortSignal.timeout(12_000)
    });

    const payload = await response.json().catch(() => ({})) as { data?: { id?: string; attributes?: { url?: string } } };
    const checkoutUrl = payload.data?.attributes?.url;
    if (!response.ok || !payload.data?.id || !checkoutUrl) throw new Error(`LEMONSQUEEZY_CREATE_FAILED_${response.status}`);
    const checkout = new URL(checkoutUrl);
    if (checkout.protocol !== 'https:') throw new Error('LEMONSQUEEZY_INVALID_CHECKOUT_URL');

    return { providerReference: reference, status: 'REDIRECT_REQUIRED', checkoutUrl: checkout.toString() };
  }

  async verifyWebhook(rawBody: Buffer, headers: Request['headers']): Promise<VerifiedPaymentEvent> {
    if (!this.configured) throw new Error('PAYMENT_PROVIDER_NOT_CONFIGURED');

    // Signature first: nothing in the body is trusted until the HMAC matches.
    const suppliedHeader = headers['x-signature'];
    const supplied = Array.isArray(suppliedHeader) ? suppliedHeader[0] : suppliedHeader;
    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    if (!supplied || !paymentSafeEqual(String(supplied).trim().toLowerCase(), expected)) throw new Error('LEMONSQUEEZY_SIGNATURE_INVALID');

    let payload: LemonSqueezyWebhook;
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as LemonSqueezyWebhook;
    } catch {
      throw new Error('LEMONSQUEEZY_WEBHOOK_INVALID_JSON');
    }

    const eventName = String(payload.meta?.event_name || '');
    if (!['order_created', 'order_refunded'].includes(eventName)) throw new Error('LEMONSQUEEZY_EVENT_NOT_SUPPORTED');

    const custom = payload.meta?.custom_data ?? {};
    const reference = typeof custom.majal_reference === 'string' ? custom.majal_reference.trim() : '';
    if (!/^ls_pay_[0-9a-f-]{36}$/.test(reference)) throw new Error('LEMONSQUEEZY_REFERENCE_MISSING');

    const amountFils = parseFilsInteger(custom.majal_amount_fils);
    if (!amountFils) throw new Error('LEMONSQUEEZY_AMOUNT_INVALID');

    const attributes = payload.data?.attributes;
    const orderId = payload.data?.id;
    if (!orderId || !attributes || typeof attributes.total !== 'number') throw new Error('LEMONSQUEEZY_WEBHOOK_INVALID_PAYLOAD');
    if (String(attributes.currency || '').toUpperCase() !== this.settlementCurrency) throw new Error('LEMONSQUEEZY_CURRENCY_MISMATCH');
    // The provider must have charged exactly what the recorded KWD amount converts to.
    if (attributes.total !== this.settlementMinorUnits(amountFils)) throw new Error('LEMONSQUEEZY_AMOUNT_MISMATCH');

    const orderStatus = String(attributes.status || '').toLowerCase();
    const status: VerifiedPaymentEvent['status'] = eventName === 'order_refunded' || orderStatus === 'refunded'
      ? 'REFUNDED'
      : orderStatus === 'paid'
        ? 'PAID'
        : orderStatus === 'pending'
          ? 'AUTHORIZED'
          : 'FAILED';

    return {
      provider: this.provider,
      // Unique per (event type, order): a redelivered order_created dedupes, while a
      // later refund of the same order is still a distinct, processable event.
      eventId: `${eventName}:${orderId}`,
      providerReference: reference,
      status,
      amountFils,
      currency: 'KWD'
    };
  }
}

export interface PaymentRegistry {
  active: PaymentGateway;
  readiness: {
    configured: boolean;
    provider: string | null;
    missing: string[];
    /** KWD unless the active provider settles elsewhere (Lemon Squeezy does not support KWD). */
    settlementCurrency: string;
    contractVersion: string;
  };
}

export function createPaymentRegistry(): PaymentRegistry {
  const requestedProvider = (process.env.PAYMENT_PROVIDER || '').trim().toUpperCase();
  const active: PaymentGateway =
    requestedProvider === 'MYFATOORAH' ? new MyFatoorahGateway()
      : requestedProvider === 'LEMONSQUEEZY' ? new LemonSqueezyGateway()
        : new DisabledPaymentGateway();
  const missing = active.configured ? [] : requestedProvider === 'MYFATOORAH'
    ? ['MYFATOORAH_API_TOKEN', 'MYFATOORAH_WEBHOOK_SECRET', 'MYFATOORAH_PAYMENT_METHOD_ID']
    : requestedProvider === 'LEMONSQUEEZY'
      ? ['LEMONSQUEEZY_API_KEY', 'LEMONSQUEEZY_STORE_ID', 'LEMONSQUEEZY_VARIANT_ID', 'LEMONSQUEEZY_WEBHOOK_SECRET', 'LEMONSQUEEZY_SETTLEMENT_CURRENCY', 'LEMONSQUEEZY_KWD_RATE']
      : ['PAYMENT_PROVIDER=MYFATOORAH|LEMONSQUEEZY', 'MERCHANT_CREDENTIALS'];
  return {
    active,
    readiness: {
      configured: active.configured,
      provider: active.configured ? active.provider : requestedProvider || null,
      missing,
      settlementCurrency: active.provider === 'LEMONSQUEEZY' ? (process.env.LEMONSQUEEZY_SETTLEMENT_CURRENCY || 'USD').trim().toUpperCase() : 'KWD',
      contractVersion: 'majal-payments-v3-myfatoorah-lemonsqueezy-webhook-v1'
    }
  };
}

/** Strict integer-fils parser for values echoed back inside a signed webhook payload. */
export function parseFilsInteger(value: unknown) {
  const normalized = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^\d{1,13}$/.test(normalized)) return undefined;
  const amount = Number(normalized);
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 10_000_000_000 ? amount : undefined;
}

export function parseKwdToFils(value: unknown) {
  const normalized = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^\d{1,7}(?:\.\d{1,3})?$/.test(normalized)) return undefined;
  const [whole, fraction = ''] = normalized.split('.');
  const amount = Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 10_000_000_000 ? amount : undefined;
}

const textValue = (value: unknown, min: number, max: number) => {
  if (typeof value !== 'string') return undefined;
  const clean = value.trim();
  return clean.length >= min && clean.length <= max ? clean : undefined;
};

const jsonError = (res: Response, status: number, message: string, code?: string) =>
  res.status(status).json({ error: message, ...(code ? { code } : {}) });

const allowedTransitions: Record<PaymentIntentStatus, PaymentIntentStatus[]> = {
  PENDING_PROVIDER: ['REDIRECT_REQUIRED', 'AUTHORIZED', 'FAILED', 'CANCELLED'],
  REDIRECT_REQUIRED: ['AUTHORIZED', 'PAID', 'FAILED', 'CANCELLED'],
  AUTHORIZED: ['PAID', 'FAILED', 'CANCELLED'],
  PAID: ['REFUNDED'],
  FAILED: [],
  CANCELLED: [],
  REFUNDED: []
};

export async function applyVerifiedPaymentEvent(db: MajalDatabase, event: VerifiedPaymentEvent, rawBody: Buffer) {
  return withTransaction(db, async tx => {
    const payloadHash = createHash('sha256').update(rawBody).digest('hex');
    const receipt = await tx.prepare(`
      SELECT payload_hash, processed FROM payment_webhook_receipts
      WHERE provider = ? AND provider_event_id = ?
    `).get(event.provider, event.eventId) as { payload_hash: string; processed: number } | undefined;

    if (receipt) {
      if (receipt.payload_hash !== payloadHash) throw new Error('WEBHOOK_REPLAY_PAYLOAD_MISMATCH');
      return { duplicate: true, processed: receipt.processed === 1 };
    }

    await tx.prepare(`
      INSERT INTO payment_webhook_receipts(
        provider, provider_event_id, payload_hash, signature_valid, processed, received_at
      ) VALUES(?, ?, ?, 1, 0, ?)
    `).run(event.provider, event.eventId, payloadHash, new Date().toISOString());

    const intent = await tx.prepare(`
      SELECT id, status, amount_fils, currency FROM payment_intents
      WHERE provider_reference = ? AND provider = ? LIMIT 1
    `).get(event.providerReference, event.provider) as
      | { id: string; status: PaymentIntentStatus; amount_fils: number; currency: string }
      | undefined;

    if (!intent) throw new Error('PAYMENT_INTENT_NOT_FOUND');
    if (intent.amount_fils !== event.amountFils || intent.currency !== event.currency) throw new Error('PAYMENT_AMOUNT_MISMATCH');
    if (intent.status !== event.status && !allowedTransitions[intent.status].includes(event.status)) throw new Error('INVALID_PAYMENT_STATE_TRANSITION');

    const now = new Date().toISOString();
    if (intent.status !== event.status) {
      await tx.prepare('UPDATE payment_intents SET status = ?, updated_at = ? WHERE id = ?').run(event.status, now, intent.id);
      // Commit money movement to the tamper-evident ledger in the SAME transaction as the
      // state change: a captured payment is +in, a refund is -out. Because the webhook
      // receipt is unique per (provider,eventId), this append happens exactly once per event.
      if (event.status === 'PAID') {
        await appendLedgerEntry(tx, { scope: 'PAYMENT', entryType: 'PAYMENT_CAPTURED', entityType: 'PAYMENT_INTENT', entityId: intent.id, amountFils: intent.amount_fils, currency: 'KWD', occurredAt: now, meta: { provider: event.provider, eventId: event.eventId } });
        // Promote the order to PAID and generate the creator royalty accrual from the accepted
        // offer's rate. accruals.order_id is UNIQUE and we guard with ON CONFLICT, so a retried
        // PAID webhook (already idempotent above) can never create a second accrual.
        const order = await tx.prepare('SELECT id, launch_id, total_fils FROM orders WHERE payment_intent_id = ? LIMIT 1').get(intent.id) as { id: string; launch_id: string; total_fils: number } | undefined;
        if (order) {
          await tx.prepare("UPDATE orders SET status = 'PAID', updated_at = ? WHERE id = ? AND status = 'PENDING_PAYMENT'").run(now, order.id);
          const terms = await tx.prepare(`SELECT c.creator_id, o.creator_royalty_basis_points AS bp
            FROM launches l JOIN collaborations c ON c.id = l.collaboration_id
            JOIN offer_versions o ON o.collaboration_id = c.id AND o.status = 'ACCEPTED'
            WHERE l.id = ? ORDER BY o.version_number DESC LIMIT 1`).get(order.launch_id) as { creator_id: string; bp: number } | undefined;
          if (terms) {
            const royalty = Math.round(order.total_fils * Number(terms.bp) / 10_000);
            await tx.prepare(`INSERT INTO accruals(id, order_id, creator_id, amount_fils, status, created_at, updated_at)
              VALUES(?, ?, ?, ?, 'ELIGIBLE', ?, ?)
              ON CONFLICT(order_id) DO NOTHING`).run(`acc_${order.id}`, order.id, terms.creator_id, royalty, now, now);
          }
        }
      } else if (event.status === 'REFUNDED') {
        await appendLedgerEntry(tx, { scope: 'REFUND', entryType: 'PAYMENT_REFUNDED', entityType: 'PAYMENT_INTENT', entityId: intent.id, amountFils: -intent.amount_fils, currency: 'KWD', occurredAt: now, meta: { provider: event.provider, eventId: event.eventId } });
        // Cascade the refund to the order and its royalty accrual so a refunded sale stops
        // counting as revenue and its accrual can't reach settlement. Only accruals not yet
        // paid out are reversed; a LOCKED/PENDING/ELIGIBLE accrual becomes REVERSED. (No-op
        // until the orders/accruals pipeline is populated.)
        const order = await tx.prepare('SELECT id FROM orders WHERE payment_intent_id = ? LIMIT 1').get(intent.id) as { id: string } | undefined;
        if (order) {
          await tx.prepare("UPDATE orders SET status = 'REFUNDED', updated_at = ? WHERE id = ?").run(now, order.id);
          await tx.prepare("UPDATE accruals SET status = 'REVERSED', updated_at = ? WHERE order_id = ? AND status IN ('PENDING','ELIGIBLE','LOCKED')").run(now, order.id);
        }
      }
    }
    await tx.prepare(`
      UPDATE payment_webhook_receipts SET processed = 1, processed_at = ?
      WHERE provider = ? AND provider_event_id = ?
    `).run(now, event.provider, event.eventId);
    return { duplicate: false, processed: true, intentId: intent.id, status: event.status };
  });
}

export function createPaymentRouter(db: MajalDatabase, authConfig: AuthConfig, registry: PaymentRegistry) {
  const router = Router();
  const authenticated = requireAuth(db, authConfig);
  const csrfProtected = requireCsrf(authConfig);

  router.get('/readiness', (_req, res) => {
    res.json({ ...registry.readiness, legalEffect: 'NONE_UNTIL_PROVIDER_VERIFIED' });
  });

  router.post('/create-charge', authenticated, csrfProtected, async (req: AuthenticatedRequest, res) => {
    if (!req.auth) return jsonError(res, 401, 'يلزم تسجيل الدخول.', 'AUTH_REQUIRED');
    if (!registry.active.configured) return jsonError(res, 503, 'بوابة الدفع مجهزة برمجيًا لكنها غير مربوطة بمزوّد بعد.', 'PAYMENT_NOT_CONFIGURED');

    const amountFils = parseKwdToFils(req.body?.amountKwd);
    const orderPublicId = textValue(req.body?.orderPublicId, 6, 120);
    const idempotencyKey = textValue(req.header('idempotency-key'), 16, 128);
    if (!amountFils || !orderPublicId || !idempotencyKey) return jsonError(res, 400, 'المبلغ أو رقم الطلب أو مفتاح منع التكرار غير صالح.');

    const existing = await db.prepare('SELECT * FROM payment_intents WHERE idempotency_key = ? LIMIT 1').get(idempotencyKey) as
      | { id: string; order_public_id: string; amount_fils: number; status: string; checkout_url: string | null }
      | undefined;
    if (existing) {
      if (existing.order_public_id !== orderPublicId || existing.amount_fils !== amountFils) {
        return jsonError(res, 409, 'مفتاح منع التكرار مستخدم لطلب مختلف.', 'IDEMPOTENCY_CONFLICT');
      }
      return res.json({ intentId: existing.id, status: existing.status, checkoutUrl: existing.checkout_url, replayed: true });
    }

    const intentId = `pay_${randomUUID()}`;
    const now = new Date().toISOString();
    await db.prepare(`
      INSERT INTO payment_intents(
        id, order_public_id, user_id, provider, amount_fils, currency,
        status, idempotency_key, created_at, updated_at
      ) VALUES(?, ?, ?, ?, ?, 'KWD', 'PENDING_PROVIDER', ?, ?, ?)
    `).run(intentId, orderPublicId, req.auth.user.id, registry.active.provider, amountFils, idempotencyKey, now, now);

    try {
      const result = await registry.active.createIntent({
        intentId,
        orderPublicId,
        amountFils,
        currency: 'KWD',
        customerReference: req.auth.user.id,
        idempotencyKey,
        returnUrl: new URL('/payment/return', process.env.APP_URL || `${req.protocol}://${req.get('host')}`).toString()
      });
      await db.prepare(`
        UPDATE payment_intents
        SET provider_reference = ?, status = ?, checkout_url = ?, updated_at = ?
        WHERE id = ?
      `).run(result.providerReference, result.status, result.checkoutUrl ?? null, new Date().toISOString(), intentId);
      return res.status(201).json({ intentId, status: result.status, checkoutUrl: result.checkoutUrl ?? null });
    } catch {
      await db.prepare(`UPDATE payment_intents SET status = 'FAILED', failure_code = 'PROVIDER_CREATE_FAILED', updated_at = ? WHERE id = ?`)
        .run(new Date().toISOString(), intentId);
      return jsonError(res, 502, 'تعذّر إنشاء عملية الدفع لدى المزوّد.', 'PAYMENT_PROVIDER_ERROR');
    }
  });

  return router;
}

export function createPaymentWebhookHandler(db: MajalDatabase, registry: PaymentRegistry) {
  return async (req: Request, res: Response) => {
    if (!registry.active.configured) return jsonError(res, 503, 'لا يوجد مزوّد دفع مربوط.', 'PAYMENT_NOT_CONFIGURED');
    if (await isKillSwitchEngaged(db, 'WEBHOOKS')) return jsonError(res, 503, 'استقبال إشعارات المزوّد مجمّد مؤقتًا.', 'KILL_SWITCH_ENGAGED_WEBHOOKS');
    if (!Buffer.isBuffer(req.body)) return jsonError(res, 400, 'Webhook body must remain raw.', 'INVALID_WEBHOOK_BODY');
    try {
      const event = await registry.active.verifyWebhook(req.body, req.headers);
      const result = await applyVerifiedPaymentEvent(db, event, req.body);
      return res.json({ received: true, ...result });
    } catch (error) {
      const code = error instanceof Error ? error.message : 'WEBHOOK_REJECTED';
      return jsonError(res, 400, 'تم رفض إشعار الدفع.', code);
    }
  };
}
