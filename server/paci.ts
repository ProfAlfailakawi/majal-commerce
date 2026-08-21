import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Request, Response, Router } from 'express';
import { AuthConfig, AuthenticatedRequest, requireAuth, requireCsrf } from './auth';
import { MajalDatabase, withTransaction } from './database';

export type PaciPurpose = 'AUTHENTICATION' | 'CONTRACT_SIGNATURE';
export type PaciStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED' | 'ERROR';

export interface PaciRequestInput {
  requestId: string;
  civilId: string;
  purpose: PaciPurpose;
  callbackReference: string;
  expiresAt: string;
}

export interface PaciRequestResult {
  providerReference: string;
  status: 'PENDING';
  deepLink?: string;
  qrPayload?: string;
}

export interface PaciProviderAdapter {
  readonly configured: boolean;
  readonly name: string;
  requestAuthentication(input: PaciRequestInput): Promise<PaciRequestResult>;
}

class DisabledPaciAdapter implements PaciProviderAdapter {
  readonly configured = false;
  readonly name = 'DISABLED';
  async requestAuthentication(): Promise<PaciRequestResult> {
    throw new Error('PACI_PROVIDER_NOT_CONFIGURED');
  }
}

class PaciServiceProviderProxyAdapter implements PaciProviderAdapter {
  readonly configured = true;
  readonly name = 'PACI_SERVICE_PROVIDER_PROXY';
  constructor(private readonly url: string, private readonly secret: string, private readonly callbackUrl: string) {}
  async requestAuthentication(input: PaciRequestInput): Promise<PaciRequestResult> {
    const endpoint = new URL('/v1/paci/requests', this.url);
    if (process.env.NODE_ENV === 'production' && endpoint.protocol !== 'https:') throw new Error('PACI_ADAPTER_HTTPS_REQUIRED');
    const payload = JSON.stringify({
      contractVersion: 'majal-paci-adapter-v1',
      requestId: input.requestId, civilId: input.civilId, purpose: input.purpose,
      callbackUrl: this.callbackUrl, callbackReference: input.callbackReference, expiresAt: input.expiresAt
    });
    const timestamp = String(Date.now());
    const signature = createHmac('sha256', this.secret).update(`${timestamp}.${payload}`).digest('hex');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-majal-timestamp': timestamp, 'x-majal-signature': `sha256=${signature}` },
      body: payload, signal: AbortSignal.timeout(12_000)
    });
    const data = await response.json() as Partial<PaciRequestResult>;
    if (!response.ok || !data.providerReference || data.status !== 'PENDING') throw new Error(`PACI_ADAPTER_FAILED_${response.status}`);
    return { providerReference: data.providerReference, status: 'PENDING', deepLink: data.deepLink, qrPayload: data.qrPayload };
  }
}

export interface PaciRegistry {
  active: PaciProviderAdapter;
  readiness: {
    configured: boolean;
    capabilities: string[];
    missing: string[];
    contractVersion: string;
  };
}

export function createPaciRegistry(): PaciRegistry {
  // PACI's public pages describe the service-provider program, but the full
  // provider API/signature contract is supplied during onboarding. MAJAL talks
  // only to an operator-controlled adapter built from those official documents.
  const adapterUrl = process.env.PACI_ADAPTER_URL?.trim();
  const adapterSecret = process.env.PACI_ADAPTER_SHARED_SECRET?.trim();
  const callbackUrl = process.env.PACI_CALLBACK_URL?.trim();
  const callbackSecret = process.env.PACI_INTERNAL_CALLBACK_SECRET?.trim();
  const dataPepper = process.env.PACI_DATA_PEPPER?.trim();
  const missing = [
    !adapterUrl ? 'PACI_ADAPTER_URL' : null,
    !adapterSecret || adapterSecret.length < 32 ? 'PACI_ADAPTER_SHARED_SECRET' : null,
    !callbackUrl ? 'PACI_CALLBACK_URL' : null,
    !callbackSecret || callbackSecret.length < 32 ? 'PACI_INTERNAL_CALLBACK_SECRET' : null,
    !dataPepper || dataPepper.length < 32 ? 'PACI_DATA_PEPPER' : null,
    !process.env.PACI_SERVICE_PROVIDER_APPROVED ? 'PACI_SERVICE_PROVIDER_APPROVED' : null
  ].filter(Boolean) as string[];
  const configured = missing.length === 0;
  const active: PaciProviderAdapter = configured
    ? new PaciServiceProviderProxyAdapter(adapterUrl!, adapterSecret!, callbackUrl!)
    : new DisabledPaciAdapter();
  return {
    active,
    readiness: {
      configured,
      capabilities: ['IDENTITY_AUTHENTICATION', 'CONTRACT_SIGNATURE_EVIDENCE'],
      missing,
      contractVersion: 'majal-paci-adapter-v1'
    }
  };
}

const jsonError = (res: Response, status: number, message: string, code?: string) =>
  res.status(status).json({ error: message, ...(code ? { code } : {}) });

const textValue = (value: unknown, min: number, max: number) => {
  if (typeof value !== 'string') return undefined;
  const clean = value.trim();
  return clean.length >= min && clean.length <= max ? clean : undefined;
};

function civilIdHash(civilId: string) {
  const pepper = process.env.PACI_DATA_PEPPER;
  if (!pepper || pepper.length < 32) throw new Error('PACI_DATA_PEPPER_NOT_CONFIGURED');
  return createHmac('sha256', pepper).update(civilId).digest('hex');
}

function safeEqual(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export interface PaciCallbackEvent {
  requestId: string;
  providerReference: string;
  status: Exclude<PaciStatus, 'PENDING'>;
}

export function verifyInternalPaciCallback(rawBody: Buffer, signature: string | undefined) {
  const secret = process.env.PACI_INTERNAL_CALLBACK_SECRET;
  if (!secret || secret.length < 32) throw new Error('PACI_CALLBACK_NOT_CONFIGURED');
  if (!signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) throw new Error('PACI_CALLBACK_SIGNATURE_MISSING');
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  if (!safeEqual(signature.toLowerCase(), expected.toLowerCase())) throw new Error('PACI_CALLBACK_SIGNATURE_INVALID');
  const parsed = JSON.parse(rawBody.toString('utf8')) as Partial<PaciCallbackEvent>;
  if (!parsed.requestId || !parsed.providerReference || !['VERIFIED', 'REJECTED', 'EXPIRED', 'ERROR'].includes(parsed.status || '')) {
    throw new Error('PACI_CALLBACK_PAYLOAD_INVALID');
  }
  return parsed as PaciCallbackEvent;
}

export async function applyPaciCallback(db: MajalDatabase, event: PaciCallbackEvent) {
  return withTransaction(db, async tx => {
    const row = await tx.prepare(`
      SELECT id, status, provider_reference FROM paci_auth_requests WHERE id = ? LIMIT 1
    `).get(event.requestId) as { id: string; status: PaciStatus; provider_reference: string | null } | undefined;
    if (!row || row.provider_reference !== event.providerReference) throw new Error('PACI_REQUEST_NOT_FOUND');
    if (row.status !== 'PENDING') return { duplicate: true, status: row.status };
    const now = new Date().toISOString();
    await tx.prepare(`
      UPDATE paci_auth_requests
      SET status = ?, callback_received_at = ?, updated_at = ?
      WHERE id = ? AND status = 'PENDING'
    `).run(event.status, now, now, row.id);
    return { duplicate: false, status: event.status };
  });
}

export function createPaciRouter(db: MajalDatabase, authConfig: AuthConfig, registry: PaciRegistry) {
  const router = Router();
  const authenticated = requireAuth(db, authConfig);
  const csrfProtected = requireCsrf(authConfig);

  router.get('/readiness', (_req, res) => {
    res.json({ ...registry.readiness, legalEffect: 'NONE_UNTIL_OFFICIAL_PACI_VERIFICATION' });
  });

  router.post('/request-auth', authenticated, csrfProtected, async (req: AuthenticatedRequest, res) => {
    if (!req.auth) return jsonError(res, 401, 'يلزم تسجيل الدخول.', 'AUTH_REQUIRED');
    if (!registry.active.configured) {
      return jsonError(res, 503, 'واجهة PACI مجهزة، لكن الربط الرسمي وبيانات مزود الخدمة غير متاحة بعد.', 'PACI_NOT_CONFIGURED');
    }
    const civilId = typeof req.body?.civilId === 'string' ? req.body.civilId.trim() : '';
    const purpose = ['AUTHENTICATION', 'CONTRACT_SIGNATURE'].includes(req.body?.purpose) ? req.body.purpose as PaciPurpose : undefined;
    if (!/^\d{12}$/.test(civilId) || !purpose) return jsonError(res, 400, 'الرقم المدني أو غرض المصادقة غير صالح.');

    const requestId = `paci_${randomUUID()}`;
    const nonce = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 3 * 60_000).toISOString();
    const now = new Date().toISOString();
    let hashedCivilId: string;
    try {
      hashedCivilId = civilIdHash(civilId);
    } catch {
      return jsonError(res, 503, 'تخزين معرف PACI الآمن غير مهيأ.', 'PACI_DATA_PROTECTION_NOT_CONFIGURED');
    }

    await db.prepare(`
      INSERT INTO paci_auth_requests(
        id, user_id, civil_id_hash, purpose, status, request_nonce_hash,
        expires_at, created_at, updated_at
      ) VALUES(?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)
    `).run(requestId, req.auth.user.id, hashedCivilId, purpose, createHmac('sha256', authConfig.sessionSecret).update(nonce).digest('hex'), expiresAt, now, now);

    try {
      const result = await registry.active.requestAuthentication({
        requestId,
        civilId,
        purpose,
        callbackReference: requestId,
        expiresAt
      });
      await db.prepare('UPDATE paci_auth_requests SET provider_reference = ?, updated_at = ? WHERE id = ?')
        .run(result.providerReference, new Date().toISOString(), requestId);
      return res.status(201).json({
        requestId,
        status: result.status,
        expiresAt,
        deepLink: result.deepLink ?? null,
        qrPayload: result.qrPayload ?? null,
        legalEffect: 'PENDING_OFFICIAL_VERIFICATION'
      });
    } catch {
      await db.prepare(`UPDATE paci_auth_requests SET status = 'ERROR', updated_at = ? WHERE id = ?`).run(new Date().toISOString(), requestId);
      return jsonError(res, 502, 'تعذّر بدء طلب PACI.', 'PACI_PROVIDER_ERROR');
    }
  });

  router.post('/verify-status', authenticated, csrfProtected, async (req: AuthenticatedRequest, res) => {
    if (!req.auth) return jsonError(res, 401, 'يلزم تسجيل الدخول.');
    const requestId = textValue(req.body?.authRequestId, 10, 100);
    if (!requestId) return jsonError(res, 400, 'رقم طلب PACI غير صالح.');
    const row = await db.prepare(`
      SELECT id, purpose, status, expires_at, created_at, updated_at
      FROM paci_auth_requests WHERE id = ? AND user_id = ? LIMIT 1
    `).get(requestId, req.auth.user.id) as Record<string, unknown> | undefined;
    if (!row) return jsonError(res, 404, 'طلب PACI غير موجود.');
    if (row.status === 'PENDING' && new Date(String(row.expires_at)).getTime() <= Date.now()) {
      await db.prepare(`UPDATE paci_auth_requests SET status = 'EXPIRED', updated_at = ? WHERE id = ? AND status = 'PENDING'`)
        .run(new Date().toISOString(), requestId);
      row.status = 'EXPIRED';
    }
    return res.json({ ...row, verified: row.status === 'VERIFIED', legalEffect: row.status === 'VERIFIED' ? 'PROVIDER_EVIDENCE_RECORDED' : 'NONE' });
  });

  return router;
}

export function createPaciCallbackHandler(db: MajalDatabase) {
  return async (req: Request, res: Response) => {
    if (!Buffer.isBuffer(req.body)) return jsonError(res, 400, 'Callback body must remain raw.', 'INVALID_CALLBACK_BODY');
    try {
      const event = verifyInternalPaciCallback(req.body, req.header('x-majal-adapter-signature'));
      return res.json({ received: true, ...await applyPaciCallback(db, event) });
    } catch (error) {
      return jsonError(res, 400, 'تم رفض استجابة PACI.', error instanceof Error ? error.message : 'PACI_CALLBACK_REJECTED');
    }
  };
}
