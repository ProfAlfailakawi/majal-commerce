/*
 * تنبيهات التطبيق الرسمي على iOS عبر APNs مباشرة (HTTP/2 + JWT ES256).
 *
 * قشرة Capacitor تحمّل الموقع في WKWebView حيث لا Web Push؛ فيسجّل التطبيق جهازه لدى Apple
 * ويرسل توكن الجهاز (hex) إلى الخادم، فيُحفظ لكل مستخدم في جدول apns_device_tokens.
 * كل إشعار شخصي جديد في صندوق الإشعارات يُرسل أيضًا إلى أجهزة صاحبه.
 *
 * الإعداد من البيئة وحدها:
 *   APNS_KEY_P8   محتوى مفتاح ‎.p8 (يقبل \n بدل الأسطر)
 *   APNS_KEY_ID   معرّف المفتاح
 *   APNS_TEAM_ID  معرّف الفريق
 *   APNS_TOPIC    معرّف الحزمة (com.dralfailakawi.majal)
 * إن نقص أيّها فالإرسال لا يفعل شيئًا بصمت. ما ترفضه Apple بـ 410 أو BadDeviceToken أو
 * Unregistered يُحذف توكنه. لا يُسجَّل في السجلات مفتاح ولا توكن كامل.
 */
import { createHash, sign as signBytes } from 'node:crypto';
import http2 from 'node:http2';
import type { MajalDatabase } from './database';

export const APNS_ORIGIN = 'https://api.push.apple.com';
export const APNS_EXPECTED_TOPIC = 'com.dralfailakawi.majal';
export const APNS_TTL_SECONDS = 24 * 60 * 60;
export const APNS_JWT_REFRESH_SECONDS = 40 * 60;
export const APNS_TOKEN_PATTERN = /^[0-9a-fA-F]{64,200}$/;
const APNS_TIMEOUT_MS = 10_000;
const MAX_DEVICES_PER_USER = 10;

export interface ApnsConfig { key: string; keyId: string; teamId: string; topic: string }
export interface ApnsMessage { title: string; body?: string; url?: string; tag?: string }
export interface ApnsResult { ok: boolean; gone: boolean; status: number; skipped?: boolean; error?: string }
type Env = Record<string, string | undefined>;

export function apnsConfigFromEnv(env: Env = process.env): ApnsConfig | null {
  const key = String(env.APNS_KEY_P8 || '').replace(/\\n/g, '\n').trim();
  const keyId = String(env.APNS_KEY_ID || '').trim();
  const teamId = String(env.APNS_TEAM_ID || '').trim();
  const topic = String(env.APNS_TOPIC || '').trim();
  if (!key || !keyId || !teamId || !topic) return null;
  return { key, keyId, teamId, topic };
}

const b64url = (data: string | Uint8Array) => Buffer.from(data).toString('base64url');

/** توكن المزوّد (JWT ES256) كما تشترطه Apple. */
export function apnsProviderToken(config: Pick<ApnsConfig, 'key' | 'keyId' | 'teamId'>, nowSeconds: number) {
  const head = `${b64url(JSON.stringify({ alg: 'ES256', kid: config.keyId }))}.${b64url(JSON.stringify({ iss: config.teamId, iat: nowSeconds }))}`;
  const signature = signBytes('sha256', Buffer.from(head), { key: config.key, dsaEncoding: 'ieee-p1363' });
  return `${head}.${b64url(signature)}`;
}

export function apnsPayload(message: ApnsMessage) {
  return JSON.stringify({
    aps: { alert: { title: message.title, ...(message.body ? { body: message.body } : {}) }, sound: 'default', ...(message.tag ? { 'thread-id': message.tag } : {}) },
    ...(message.url ? { url: message.url } : {})
  });
}

/** بصمة قصيرة للتوكن تصلح للسجلات. */
export const tokenFingerprint = (token: string) => createHash('sha256').update(token).digest('hex').slice(0, 10);

export interface ApnsRequestLike {
  on(event: string, listener: (...args: any[]) => void): unknown;
  setEncoding?(encoding: string): unknown;
  end(body?: string): unknown;
}
export interface ApnsClientLike {
  request(headers: Record<string, string>): ApnsRequestLike;
  on(event: string, listener: (...args: any[]) => void): unknown;
  close(): unknown;
}
export type ApnsConnect = (origin: string) => ApnsClientLike;

const DEAD_REASONS = /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/i;

export function createApnsSender(options: { env?: () => Env; connect?: ApnsConnect; now?: () => number; timeoutMs?: number } = {}) {
  const readEnv = options.env || (() => process.env);
  const connect: ApnsConnect = options.connect || (origin => http2.connect(origin) as unknown as ApnsClientLike);
  const clock = options.now || Date.now;
  const timeoutMs = options.timeoutMs ?? APNS_TIMEOUT_MS;
  let cached: { jwt: string; issuedAt: number; seed: string } | null = null;

  const providerToken = (config: ApnsConfig) => {
    const nowSeconds = Math.floor(clock() / 1000);
    const seed = `${config.keyId}|${config.teamId}|${createHash('sha256').update(config.key).digest('hex')}`;
    if (cached && cached.seed === seed && nowSeconds - cached.issuedAt < APNS_JWT_REFRESH_SECONDS) return cached.jwt;
    const jwt = apnsProviderToken(config, nowSeconds);
    cached = { jwt, issuedAt: nowSeconds, seed };
    return jwt;
  };

  return {
    configured: () => apnsConfigFromEnv(readEnv()) !== null,
    send(token: string, message: ApnsMessage, extra: { collapseId?: string } = {}): Promise<ApnsResult> {
      const config = apnsConfigFromEnv(readEnv());
      if (!config) return Promise.resolve({ ok: false, gone: false, status: 0, skipped: true });
      if (!APNS_TOKEN_PATTERN.test(token)) return Promise.resolve({ ok: false, gone: true, status: 0, error: 'bad token' });
      let jwt: string;
      try { jwt = providerToken(config); } catch { return Promise.resolve({ ok: false, gone: false, status: 0, error: 'key' }); }
      const nowSeconds = Math.floor(clock() / 1000);
      return new Promise<ApnsResult>(resolve => {
        let settled = false;
        let client: ApnsClientLike | null = null;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const finish = (result: ApnsResult) => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          try { client?.close(); } catch { /* already closed */ }
          resolve(result);
        };
        try {
          client = connect(APNS_ORIGIN);
          client.on('error', () => finish({ ok: false, gone: false, status: 0, error: 'conn' }));
          timer = setTimeout(() => finish({ ok: false, gone: false, status: 0, error: 'timeout' }), timeoutMs);
          const request = client.request({
            ':method': 'POST',
            ':path': `/3/device/${token.toLowerCase()}`,
            authorization: `bearer ${jwt}`,
            'apns-topic': config.topic,
            'apns-push-type': 'alert',
            'apns-priority': '10',
            'apns-expiration': String(nowSeconds + APNS_TTL_SECONDS),
            ...(extra.collapseId ? { 'apns-collapse-id': extra.collapseId.slice(0, 64) } : {}),
            'content-type': 'application/json'
          });
          let status = 0;
          let text = '';
          request.on('response', (headers: Record<string, unknown>) => { status = Number(headers?.[':status'] || 0); });
          request.setEncoding?.('utf8');
          request.on('data', (chunk: string) => { text += chunk; });
          request.on('end', () => {
            if (status === 200) return finish({ ok: true, gone: false, status });
            let reason = '';
            try { reason = String(JSON.parse(text).reason || ''); } catch { reason = text.slice(0, 80); }
            finish({ ok: false, gone: status === 410 || DEAD_REASONS.test(reason), status, error: reason || undefined });
          });
          request.on('error', () => finish({ ok: false, gone: false, status: 0, error: 'req' }));
          request.end(apnsPayload(message));
        } catch {
          finish({ ok: false, gone: false, status: 0, error: 'send' });
        }
      });
    }
  };
}

export type ApnsSender = ReturnType<typeof createApnsSender>;

let activeSender: ApnsSender = createApnsSender();
/** للاختبارات فقط: يستبدل الناقل بناقل محاكٍ. */
export function setApnsSender(sender: ApnsSender | null) { activeSender = sender || createApnsSender(); }

export function apnsReadiness() {
  const env = process.env;
  const missing = ['APNS_KEY_P8', 'APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_TOPIC'].filter(name => !String(env[name] || '').trim());
  return { configured: missing.length === 0, provider: 'APNS' as const, missing, topicMatches: !env.APNS_TOPIC || env.APNS_TOPIC.trim() === APNS_EXPECTED_TOPIC };
}

const SURFACES = new Set(['PUBLIC', 'SHOWCASE', 'DIRECTORY', 'CREATOR', 'HOST', 'SUPPLIER', 'CONSUMER', 'ADMIN', 'SUPER_ADMIN']);

/** الرابط الذي يفتحه لمس التنبيه: مسار داخل الموقع يفتح السطح المناسب. */
export function notificationUrl(surface?: string | null, notificationId?: string) {
  const params = new URLSearchParams();
  if (surface && SURFACES.has(surface)) params.set('surface', surface);
  if (notificationId) params.set('notification', notificationId);
  const query = params.toString();
  return query ? `/?${query}` : '/';
}

export async function registerNativeToken(db: MajalDatabase, userId: string, rawToken: string) {
  const token = rawToken.trim().toLowerCase();
  if (!APNS_TOKEN_PATTERN.test(token)) return false;
  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO apns_device_tokens(token, user_id, created_at, updated_at) VALUES(?, ?, ?, ?)
    ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, updated_at = excluded.updated_at
  `).run(token, userId, now, now);
  return true;
}

export async function removeNativeToken(db: MajalDatabase, userId: string, rawToken: string) {
  await db.prepare('DELETE FROM apns_device_tokens WHERE token = ? AND user_id = ?').run(rawToken.trim().toLowerCase(), userId);
}

/** يرسل تنبيهًا إلى كل أجهزة المستخدم، ويحذف ما ماتت توكناته. لا يرمي أبدًا. */
export async function pushToUser(db: MajalDatabase, userId: string, message: ApnsMessage, collapseId?: string) {
  const sender = activeSender;
  if (!sender.configured()) return { sent: 0, dropped: 0, skipped: true };
  let sent = 0;
  let dropped = 0;
  try {
    const rows = await db.prepare('SELECT token FROM apns_device_tokens WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?')
      .all<{ token: string }>(userId, MAX_DEVICES_PER_USER);
    for (const { token } of rows) {
      const result = await sender.send(token, message, { collapseId });
      if (result.ok) sent += 1;
      else if (result.gone) {
        await db.prepare('DELETE FROM apns_device_tokens WHERE token = ?').run(token);
        dropped += 1;
      } else {
        console.warn(JSON.stringify({ severity: 'WARNING', event: 'apns_send_failed', status: result.status, reason: result.error, device: tokenFingerprint(token) }));
      }
    }
  } catch (error) {
    console.warn(JSON.stringify({ severity: 'WARNING', event: 'apns_push_failed', error: error instanceof Error ? error.message.slice(0, 80) : 'unknown' }));
  }
  return { sent, dropped, skipped: false };
}
