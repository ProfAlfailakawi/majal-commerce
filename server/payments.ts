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

export interface PaymentRegistry {
  active: PaymentGateway;
  readiness: {
    configured: boolean;
    provider: string | null;
    missing: string[];
    contractVersion: string;
  };
}

export function createPaymentRegistry(): PaymentRegistry {
  const requestedProvider = (process.env.PAYMENT_PROVIDER || '').trim().toUpperCase();
  const active: PaymentGateway = requestedProvider === 'MYFATOORAH' ? new MyFatoorahGateway() : new DisabledPaymentGateway();
  const missing = active.configured ? [] : requestedProvider === 'MYFATOORAH'
    ? ['MYFATOORAH_API_TOKEN', 'MYFATOORAH_WEBHOOK_SECRET', 'MYFATOORAH_PAYMENT_METHOD_ID']
    : ['PAYMENT_PROVIDER=MYFATOORAH', 'MERCHANT_CREDENTIALS'];
  return {
    active,
    readiness: {
      configured: active.configured,
      provider: active.configured ? active.provider : requestedProvider || null,
      missing,
      contractVersion: 'majal-payments-v2-myfatoorah-webhook-v2'
    }
  };
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
      } else if (event.status === 'REFUNDED') {
        await appendLedgerEntry(tx, { scope: 'REFUND', entryType: 'PAYMENT_REFUNDED', entityType: 'PAYMENT_INTENT', entityId: intent.id, amountFils: -intent.amount_fils, currency: 'KWD', occurredAt: now, meta: { provider: event.provider, eventId: event.eventId } });
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
