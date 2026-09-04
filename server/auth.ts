import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual
} from 'node:crypto';
import { NextFunction, Request, Response, Router } from 'express';
import { MajalDatabase } from './database';

export type AuthRole =
  | 'CREATOR'
  | 'HOST_OWNER'
  | 'HOST_OPERATIONS'
  | 'HOST_CHEF'
  | 'HOST_FINANCE'
  | 'HOST_MARKETING'
  | 'HOST_SUPPORT'
  | 'ADMIN'
  | 'SUPER_ADMIN'
  | 'CONSUMER';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: AuthRole;
  status: 'ACTIVE' | 'SUSPENDED' | 'INVITED';
  creatorId?: string;
  hostBusinessId?: string;
  lastLoginAt?: string;
  mfaEnabled: boolean;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: AuthRole;
  status: 'ACTIVE' | 'SUSPENDED' | 'INVITED';
  creator_id: string | null;
  host_business_id: string | null;
  password_hash: string;
  password_salt: string;
  mfa_secret_encrypted: string | null;
  mfa_enabled: number;
  failed_login_count: number;
  locked_until: string | null;
  last_login_at: string | null;
}

interface SessionRow extends UserRow {
  token_hash: string;
  csrf_hash: string;
  expires_at: string;
  last_seen_at: string;
}

export interface AuthContext {
  user: SessionUser;
  tokenHash: string;
  csrfHash: string;
  expiresAt: string;
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthContext;
}

export interface AuthConfig {
  production: boolean;
  sessionSecret: string;
  encryptionKey?: string;
  sessionHours: number;
  cookieName: string;
  csrfCookieName: string;
}

const SCRYPT_KEY_LENGTH = 64;
const PASSWORD_MAX_LENGTH = 128;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DUMMY_SALT = Buffer.alloc(16, 7).toString('base64url');
const DUMMY_HASH = 'x'.repeat(86);

const jsonError = (res: Response, status: number, message: string, code?: string) =>
  res.status(status).json({ error: message, ...(code ? { code } : {}) });

const cleanText = (value: unknown, min: number, max: number) => {
  if (typeof value !== 'string') return undefined;
  const clean = value.trim();
  return clean.length >= min && clean.length <= max ? clean : undefined;
};

const normalizeEmail = (value: unknown) => {
  const email = cleanText(value, 5, 254)?.toLowerCase();
  return email && EMAIL_PATTERN.test(email) ? email : undefined;
};

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

const metadataHash = (value: string | undefined, secret: string) =>
  value ? createHmac('sha256', secret).update(value).digest('hex') : null;

function safeTextEqual(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function scryptPassword(password: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, Buffer.from(salt, 'base64url'), SCRYPT_KEY_LENGTH, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(Buffer.from(key).toString('base64url'));
    });
  });
}

export const PASSWORD_MIN_LENGTH = 12;

export function validatePassword(password: unknown) {
  // SECURITY: a 12-char minimum guards privileged roles (incl. SUPER_ADMIN) against brute
  // force far better than the old 6-char floor.
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return `كلمة المرور يجب أن تكون بين ${PASSWORD_MIN_LENGTH} و${PASSWORD_MAX_LENGTH} محرفًا.`;
  }
  return null;
}

export async function hashPassword(password: string, salt = randomBytes(16).toString('base64url')) {
  return { salt, hash: await scryptPassword(password, salt) };
}

export async function verifyPassword(password: string, salt: string, expectedHash: string) {
  const actualHash = await scryptPassword(password, salt);
  return safeTextEqual(actualHash, expectedHash);
}

function base32Encode(input: Buffer) {
  let bits = '';
  for (const byte of input) bits += byte.toString(2).padStart(8, '0');
  let output = '';
  for (let index = 0; index < bits.length; index += 5) {
    output += BASE32_ALPHABET[Number.parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)];
  }
  return output;
}

function base32Decode(input: string) {
  const normalized = input.toUpperCase().replace(/=+$/g, '').replace(/\s+/g, '');
  let bits = '';
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error('Invalid base32 secret');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

export function generateTotpSecret() {
  return base32Encode(randomBytes(20));
}

export function generateTotp(secret: string, timestamp = Date.now()) {
  const counter = BigInt(Math.floor(timestamp / 30_000));
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(counter);
  const digest = createHmac('sha1', base32Decode(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, '0');
}

export function verifyTotp(secret: string, code: unknown, timestamp = Date.now()) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return false;
  return [-30_000, 0, 30_000].some(offset => safeTextEqual(generateTotp(secret, timestamp + offset), code));
}

function deriveEncryptionKey(rawKey: string) {
  return createHash('sha256').update(rawKey).digest();
}

function encryptSecret(secret: string, rawKey: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveEncryptionKey(rawKey), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map(value => value.toString('base64url')).join('.');
}

function decryptSecret(payload: string, rawKey: string) {
  const [ivValue, tagValue, encryptedValue] = payload.split('.');
  if (!ivValue || !tagValue || !encryptedValue) throw new Error('Invalid encrypted MFA secret');
  const decipher = createDecipheriv('aes-256-gcm', deriveEncryptionKey(rawKey), Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64url')), decipher.final()]).toString('utf8');
}

function parseCookies(header: string | undefined) {
  const cookies = new Map<string, string>();
  for (const pair of header?.split(';') ?? []) {
    const separator = pair.indexOf('=');
    if (separator <= 0) continue;
    const key = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (key && value) cookies.set(key, decodeURIComponent(value));
  }
  return cookies;
}

function cookieOptions(config: AuthConfig, httpOnly: boolean, maxAgeSeconds: number) {
  return [
    'Path=/',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
    'SameSite=Strict',
    ...(httpOnly ? ['HttpOnly'] : []),
    ...(config.production ? ['Secure'] : [])
  ].join('; ');
}

function setSessionCookies(res: Response, config: AuthConfig, token: string, csrfToken: string, expiresAt: string) {
  const maxAgeSeconds = Math.max(0, (new Date(expiresAt).getTime() - Date.now()) / 1000);
  res.append('Set-Cookie', `${config.cookieName}=${encodeURIComponent(token)}; ${cookieOptions(config, true, maxAgeSeconds)}`);
  res.append('Set-Cookie', `${config.csrfCookieName}=${encodeURIComponent(csrfToken)}; ${cookieOptions(config, false, maxAgeSeconds)}`);
}

function clearSessionCookies(res: Response, config: AuthConfig) {
  res.append('Set-Cookie', `${config.cookieName}=; ${cookieOptions(config, true, 0)}`);
  res.append('Set-Cookie', `${config.csrfCookieName}=; ${cookieOptions(config, false, 0)}`);
}

function publicUser(row: UserRow): SessionUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    status: row.status,
    ...(row.creator_id ? { creatorId: row.creator_id } : {}),
    ...(row.host_business_id ? { hostBusinessId: row.host_business_id } : {}),
    ...(row.last_login_at ? { lastLoginAt: row.last_login_at } : {}),
    mfaEnabled: row.mfa_enabled === 1
  };
}

async function logAuthEvent(
  db: MajalDatabase,
  config: AuthConfig,
  details: { userId?: string; email: string; eventType: string; requestId: string; ip?: string }
) {
  await db.prepare(`
    INSERT INTO auth_events(user_id, email_hash, event_type, ip_hash, request_id, created_at)
    VALUES(?, ?, ?, ?, ?, ?)
  `).run(
    details.userId ?? null,
    metadataHash(details.email, config.sessionSecret),
    details.eventType,
    metadataHash(details.ip, config.sessionSecret),
    details.requestId,
    new Date().toISOString()
  );
}

export function createAuthConfig(production: boolean): AuthConfig {
  const configuredSessionSecret = process.env.AUTH_SESSION_SECRET?.trim();
  const configuredEncryptionKey = process.env.AUTH_ENCRYPTION_KEY?.trim();
  if (production && (!configuredSessionSecret || configuredSessionSecret.length < 32)) {
    throw new Error('AUTH_SESSION_SECRET must contain at least 32 characters in production.');
  }
  if (production && (!configuredEncryptionKey || configuredEncryptionKey.length < 32)) {
    throw new Error('AUTH_ENCRYPTION_KEY must contain at least 32 characters in production.');
  }
  const sessionHours = Number(process.env.AUTH_SESSION_HOURS || 8);
  return {
    production,
    sessionSecret: configuredSessionSecret || randomBytes(32).toString('base64url'),
    encryptionKey: configuredEncryptionKey,
    sessionHours: Number.isFinite(sessionHours) && sessionHours >= 1 && sessionHours <= 72 ? sessionHours : 8,
    cookieName: production ? '__Host-majal_session' : 'majal_session',
    csrfCookieName: production ? '__Host-majal_csrf' : 'majal_csrf'
  };
}

export interface CreateUserInput {
  name: string;
  email: string;
  phone?: string;
  password: string;
  role?: AuthRole;
  status?: 'ACTIVE' | 'SUSPENDED' | 'INVITED';
  creatorId?: string;
  hostBusinessId?: string;
}

export async function createUser(db: MajalDatabase, input: CreateUserInput) {
  const name = cleanText(input.name, 2, 120);
  const email = normalizeEmail(input.email);
  const phone = input.phone ? cleanText(input.phone, 7, 24) : '';
  const passwordError = validatePassword(input.password);
  if (!name || !email || phone === undefined || passwordError) throw new Error(passwordError || 'بيانات الحساب غير صالحة.');

  const { hash, salt } = await hashPassword(input.password);
  const id = `usr_${randomUUID()}`;
  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO users(
      id, name, email, phone, role, status, creator_id, host_business_id,
      password_hash, password_salt, created_at, updated_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    name,
    email,
    phone,
    input.role || 'CONSUMER',
    input.status || 'ACTIVE',
    input.creatorId ?? null,
    input.hostBusinessId ?? null,
    hash,
    salt,
    now,
    now
  );
  return await db.prepare('SELECT * FROM users WHERE id = ?').get<UserRow>(id) as UserRow;
}

async function createSession(db: MajalDatabase, config: AuthConfig, req: Request, user: UserRow) {
  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(32).toString('base64url');
  const tokenHash = sha256(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.sessionHours * 60 * 60_000).toISOString();
  await db.prepare(`
    INSERT INTO sessions(token_hash, user_id, csrf_hash, expires_at, created_at, last_seen_at, ip_hash, user_agent_hash)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    tokenHash,
    user.id,
    sha256(csrfToken),
    expiresAt,
    now.toISOString(),
    now.toISOString(),
    metadataHash(req.ip, config.sessionSecret),
    metadataHash(req.header('user-agent'), config.sessionSecret)
  );
  return { token, csrfToken, expiresAt };
}

export function requireAuth(db: MajalDatabase, config: AuthConfig) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const cookies = parseCookies(req.header('cookie'));
    const token = cookies.get(config.cookieName);
    if (!token || token.length > 256) return jsonError(res, 401, 'يلزم تسجيل الدخول.', 'AUTH_REQUIRED');

    const row = await db.prepare(`
      SELECT sessions.token_hash, sessions.csrf_hash, sessions.expires_at, sessions.last_seen_at, users.*
      FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? LIMIT 1
    `).get(sha256(token)) as unknown as SessionRow | undefined;

    if (!row || new Date(row.expires_at).getTime() <= Date.now() || row.status !== 'ACTIVE') {
      if (row) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(row.token_hash);
      clearSessionCookies(res, config);
      return jsonError(res, 401, 'انتهت الجلسة أو الحساب غير متاح.', 'SESSION_EXPIRED');
    }

    if (!row.creator_id && (['CREATOR', 'ADMIN', 'SUPER_ADMIN'].includes(row.role))) {
      try {
        const existingCr = await db.prepare('SELECT id FROM creator_profiles WHERE user_id = ?').get<{id: string}>(row.id);
        let crId = existingCr?.id;
        if (!crId) {
          crId = `cr_${randomUUID().slice(0, 8)}`;
          const nowStr = new Date().toISOString();
          await db.prepare("INSERT INTO creator_profiles(id, user_id, display_name, specialty, completion_score, matching_enabled, created_at, updated_at) VALUES(?, ?, ?, ?, 100, 1, ?, ?)")
            .run(crId, row.id, row.name || 'مبدع طهي معتمد', 'ابتكار الأطباق والمنتجات', nowStr, nowStr);
        }
        await db.prepare('UPDATE users SET creator_id = ? WHERE id = ?').run(crId, row.id);
        row.creator_id = crId;
      } catch {
        // Fallback
      }
    }

    // SECURITY: never infer tenant membership in production. Auto-attaching a HOST_*/ADMIN
    // user to an arbitrary existing host business is a cross-tenant escalation. This
    // convenience seeding is limited to non-production (demo/dev); in production a host
    // user must be linked to an org explicitly through an approved onboarding flow.
    if (process.env.NODE_ENV !== 'production'
        && !row.host_business_id && (row.role.startsWith('HOST_') || ['ADMIN', 'SUPER_ADMIN'].includes(row.role))) {
      try {
        const existingHb = await db.prepare('SELECT id FROM host_businesses LIMIT 1').get<{id: string}>();
        let hbId = existingHb?.id;
        if (!hbId) {
          hbId = `hb_${randomUUID().slice(0, 8)}`;
          const nowStr = new Date().toISOString();
          await db.prepare("INSERT INTO host_businesses(id, commercial_name, legal_entity, cr_number, status, health_permit_number, health_permit_status, health_permit_expires_at, verified_at, created_at, updated_at) VALUES(?, ?, ?, ?, 'VERIFIED', 'HLT-8821', 'VALID', ?, ?, ?, ?)")
            .run(hbId, 'منشأة مجال الحاضنة', 'شركة ذات مسؤولية محدودة', 'KWT-CR-1020', new Date(Date.now() + 180*86400000).toISOString(), nowStr, nowStr, nowStr);
        }
        await db.prepare('UPDATE users SET host_business_id = ? WHERE id = ?').run(hbId, row.id);
        row.host_business_id = hbId;
      } catch {
        // Fallback
      }
    }

    req.auth = { user: publicUser(row), tokenHash: row.token_hash, csrfHash: row.csrf_hash, expiresAt: row.expires_at };
    if (Date.now() - new Date(row.last_seen_at).getTime() > 15 * 60_000) {
      await db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').run(new Date().toISOString(), row.token_hash);
    }
    next();
  };
}

export function requireCsrf(config: AuthConfig) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.auth) return jsonError(res, 401, 'يلزم تسجيل الدخول.', 'AUTH_REQUIRED');
    const cookies = parseCookies(req.header('cookie'));
    const cookieToken = cookies.get(config.csrfCookieName);
    const headerToken = req.header('x-csrf-token');
    if (!cookieToken || !headerToken || !safeTextEqual(cookieToken, headerToken) || !safeTextEqual(sha256(headerToken), req.auth.csrfHash)) {
      return jsonError(res, 403, 'رمز حماية الطلب غير صالح.', 'CSRF_REJECTED');
    }
    next();
  };
}

export function requireRoles(...roles: AuthRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.auth) return jsonError(res, 401, 'يلزم تسجيل الدخول.', 'AUTH_REQUIRED');
    if (!roles.includes(req.auth.user.role)) return jsonError(res, 403, 'لا تملك صلاحية تنفيذ هذه العملية.', 'FORBIDDEN');
    next();
  };
}

/**
 * Super-admin allowlist.
 *
 * This used to be two personal email addresses written into the source, which put the
 * operator's identity in a public repository and made the platform's highest privilege
 * a property of the code rather than of the deployment. It is configuration now:
 * SUPER_ADMIN_EMAILS is a comma-separated list supplied per environment.
 *
 * Empty by default, and that is deliberate — an unconfigured deployment grants nobody
 * super admin rather than granting it to whoever the source happened to name.
 */
export const SUPER_ADMIN_EMAILS = new Set(
  (process.env.SUPER_ADMIN_EMAILS ?? '')
    .split(',')
    .map(entry => entry.trim().toLowerCase())
    .filter(Boolean)
);

/**
 * Promotes already-registered accounts named in SUPER_ADMIN_EMAILS.
 *
 * It no longer CREATES the account. The previous version inserted a super admin with a
 * hardcoded password on every boot, so any deployment that had ever started shipped with
 * a known set of credentials for its most privileged role. Account creation
 * belongs to `npm run auth:bootstrap`, which takes the password from the environment and
 * refuses to overwrite an existing account.
 */
export async function ensureSuperAdminUser(db: MajalDatabase) {
  for (const email of SUPER_ADMIN_EMAILS) {
    try {
      const existing = await db.prepare('SELECT * FROM users WHERE email = ? LIMIT 1').get<UserRow>(email);
      if (!existing) continue;
      if (existing.role !== 'SUPER_ADMIN' || existing.status !== 'ACTIVE') {
        await db.prepare('UPDATE users SET role = ?, status = ?, updated_at = ? WHERE id = ?')
          .run('SUPER_ADMIN', 'ACTIVE', new Date().toISOString(), existing.id);
      }
    } catch {
      // Ignore conflict if another thread or migration initialized it
    }
  }
}

export function createAuthRouter(db: MajalDatabase, config: AuthConfig) {
  // Ensure Super Admin exists upon auth router creation
  void ensureSuperAdminUser(db);

  const router = Router();
  const authenticated = requireAuth(db, config);
  const csrfProtected = requireCsrf(config);

  router.post('/register', async (req, res) => {
    const requestId = randomUUID();
    const email = normalizeEmail(req.body?.email);
    try {
      if (!email) return jsonError(res, 400, 'البريد الإلكتروني غير صالح.');
      
      // Only addresses in the configured allowlist may hold SUPER_ADMIN. Public
      // registration is limited to business roles.
      let assignedRole: AuthRole = 'CONSUMER';
      if (SUPER_ADMIN_EMAILS.has(email)) {
        assignedRole = 'SUPER_ADMIN';
      } else {
        // SECURITY: public self-registration may only pick unprivileged roles. HOST_OWNER
        // is a tenant-privileged role and must be granted through an approved onboarding +
        // explicit org binding, never self-assigned at signup.
        const requestedRole = req.body?.role;
        const allowedPublicRoles: AuthRole[] = ['CREATOR', 'CONSUMER'];
        assignedRole = allowedPublicRoles.includes(requestedRole) ? requestedRole : 'CONSUMER';
      }

      const user = await createUser(db, {
        name: req.body?.name,
        email,
        phone: req.body?.phone,
        password: req.body?.password,
        role: assignedRole
      });
      const session = await createSession(db, config, req, user);
      setSessionCookies(res, config, session.token, session.csrfToken, session.expiresAt);
      await logAuthEvent(db, config, { userId: user.id, email, eventType: 'REGISTERED', requestId, ip: req.ip });
      return res.status(201).json({ user: publicUser(user), csrfToken: session.csrfToken, expiresAt: session.expiresAt });
    } catch (error) {
      const errStr = String(error);
      const isUniqueViolation = 
        errStr.includes('UNIQUE constraint failed') ||
        errStr.includes('users_email_key') ||
        errStr.includes('duplicate key value') ||
        (typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === '23505');

      if (email && isUniqueViolation) {
        // SECURITY: a duplicate email must NEVER be treated as "recover + authenticate".
        // Previously this path re-hashed the supplied password, overwrote the existing
        // account's credentials and issued a session — a one-request account takeover of
        // any existing user. Registration only ever returns 409; credential recovery goes
        // exclusively through the reset-password flow with an out-of-band code.
        return jsonError(res, 409, 'هذا البريد الإلكتروني مسجّل مسبقاً. يرجى التبديل إلى تسجيل الدخول مباشرة.', 'ACCOUNT_EXISTS');
      }
      return jsonError(res, 400, error instanceof Error ? error.message : 'تعذّر إنشاء الحساب.');
    }
  });

  router.post('/reset-password-request', async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (!email) return jsonError(res, 400, 'البريد الإلكتروني غير صالح.');
    
    // Enumeration-safe uniform response used for every outcome.
    const uniform = { message: 'إذا كان البريد مسجلاً، فسيصلك رمز التحقق على بريدك.' };
    try {
      const existingUser = await db.prepare('SELECT id FROM users WHERE email = ? LIMIT 1').get<{id: string}>(email);
      // SECURITY: only issue a reset token for an account that actually exists. Do NOT
      // special-case SUPER_ADMIN_EMAILS here — a reset must never create/provision a super
      // admin, and treating those emails differently would leak which emails are privileged.
      if (!existingUser) {
        return res.json(uniform);
      }

      // Generate 6 digit code
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const crypto = require('crypto');
      const token_hash = crypto.createHash('sha256').update(code).digest('hex');
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 15 * 60000).toISOString(); // 15 mins

      await db.prepare(`
        INSERT INTO password_reset_tokens (email, token_hash, expires_at, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET token_hash = excluded.token_hash, expires_at = excluded.expires_at, created_at = excluded.created_at
      `).run(email, token_hash, expiresAt, now.toISOString());

      // SECURITY: the reset code is a credential. It is NEVER returned in the HTTP response
      // and NEVER logged in production. Until an email/SMS provider is wired, non-production
      // builds print it to the server console only so local testing can proceed.
      if (process.env.NODE_ENV !== 'production') {
        console.log(`\n\n[DEV] Password Reset Code for ${email}: ${code}\n\n`);
      }
      // TODO(prod): deliver `code` out-of-band via the email/SMS provider before launch.

      return res.json(uniform);
    } catch (error) {
      // Keep the response uniform to avoid leaking whether the email exists.
      return res.json(uniform);
    }
  });

  router.post('/reset-password-verify', async (req, res) => {
    const requestId = randomUUID();
    const email = normalizeEmail(req.body?.email);
    const code = req.body?.code;
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : req.body?.password;
    
    try {
      if (!email || !code) return jsonError(res, 400, 'بيانات غير مكتملة.');
      const passwordError = validatePassword(newPassword);
      if (passwordError) return jsonError(res, 400, passwordError);

      const crypto = require('crypto');
      const providedHash = crypto.createHash('sha256').update(code).digest('hex');

      const tokenRecord = await db.prepare('SELECT * FROM password_reset_tokens WHERE email = ?').get<any>(email);

      // SECURITY: no dev bypass code. Every reset requires a valid, unexpired token that
      // matches the hash stored at request time — in all environments.
      if (!tokenRecord || tokenRecord.token_hash !== providedHash) {
        return jsonError(res, 400, 'الرمز غير صحيح أو منتهي الصلاحية.');
      }
      if (new Date(tokenRecord.expires_at) < new Date()) {
        return jsonError(res, 400, 'صلاحية الرمز منتهية.');
      }

      // SECURITY: a password reset must NEVER create an account (previously this
      // auto-provisioned a live SUPER_ADMIN for any allowlisted email). Accounts are
      // created only via the register flow / auth:bootstrap.
      const existingUser = await db.prepare('SELECT * FROM users WHERE email = ? LIMIT 1').get<UserRow>(email);
      if (!existingUser) {
        // Consume the dangling token and return an enumeration-safe error.
        await db.prepare('DELETE FROM password_reset_tokens WHERE email = ?').run(email);
        return jsonError(res, 400, 'الرمز غير صحيح أو منتهي الصلاحية.');
      }

      const { hash, salt } = await hashPassword(newPassword);
      const nowStr = new Date().toISOString();

      await db.transaction(async (tx) => {
        await tx.prepare(`
          UPDATE users SET password_hash = ?, password_salt = ?, failed_login_count = 0, locked_until = NULL, updated_at = ? WHERE id = ?
        `).run(hash, salt, nowStr, existingUser!.id);
        await tx.prepare('DELETE FROM password_reset_tokens WHERE email = ?').run(email);
        // SECURITY: revoke all existing sessions on credential change so a prior (possibly
        // attacker-held) session cannot survive a password reset.
        await tx.prepare('DELETE FROM sessions WHERE user_id = ?').run(existingUser!.id);
      });

      const refreshedUser = await db.prepare('SELECT * FROM users WHERE id = ?').get<UserRow>(existingUser.id) as UserRow;
      const session = await createSession(db, config, req, refreshedUser);
      setSessionCookies(res, config, session.token, session.csrfToken, session.expiresAt);
      await logAuthEvent(db, config, { userId: refreshedUser.id, email, eventType: 'LOGIN_SUCCEEDED', requestId, ip: req.ip });
      
      return res.json({ user: publicUser(refreshedUser), csrfToken: session.csrfToken, expiresAt: session.expiresAt });
    } catch (error) {
      return jsonError(res, 400, error instanceof Error ? error.message : 'تعذّر إعادة تعيين كلمة المرور.');
    }
  });

  router.post('/login', async (req, res) => {
    const requestId = randomUUID();
    const email = normalizeEmail(req.body?.email);
    const password = typeof req.body?.password === 'string' && req.body.password.length <= PASSWORD_MAX_LENGTH ? req.body.password : '';
    const user = email
      ? await db.prepare('SELECT * FROM users WHERE email = ? LIMIT 1').get<UserRow>(email)
      : undefined;

    const locked = Boolean(user?.locked_until && new Date(user.locked_until).getTime() > Date.now());
    const passwordValid = password
      ? await verifyPassword(password, user?.password_salt || DUMMY_SALT, user?.password_hash || DUMMY_HASH)
      : false;

    if (!user || !passwordValid || locked || user.status !== 'ACTIVE') {
      if (user && !locked) {
        const failures = user.failed_login_count + 1;
        const lockUntil = failures >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null;
        await db.prepare('UPDATE users SET failed_login_count = ?, locked_until = ?, updated_at = ? WHERE id = ?')
          .run(failures >= MAX_FAILED_LOGINS ? 0 : failures, lockUntil, new Date().toISOString(), user.id);
        await logAuthEvent(db, config, {
          userId: user.id,
          email: user.email,
          eventType: lockUntil ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED',
          requestId,
          ip: req.ip
        });
      } else if (email) {
        await logAuthEvent(db, config, { email, eventType: 'LOGIN_FAILED', requestId, ip: req.ip });
      }
      return jsonError(res, 401, 'بيانات الدخول غير صحيحة أو الحساب غير متاح.', 'INVALID_CREDENTIALS');
    }

    if (user.mfa_enabled === 1) {
      if (!config.encryptionKey || !user.mfa_secret_encrypted) return jsonError(res, 503, 'إعداد MFA غير مكتمل على الخادم.', 'MFA_CONFIGURATION_ERROR');
      const secret = decryptSecret(user.mfa_secret_encrypted, config.encryptionKey);
      if (!req.body?.mfaCode) return jsonError(res, 401, 'رمز التحقق مطلوب.', 'MFA_REQUIRED');
      if (!verifyTotp(secret, req.body.mfaCode)) {
        await logAuthEvent(db, config, { userId: user.id, email: user.email, eventType: 'LOGIN_FAILED', requestId, ip: req.ip });
        return jsonError(res, 401, 'رمز التحقق غير صحيح.', 'INVALID_MFA_CODE');
      }
    }

    const now = new Date().toISOString();
    await db.prepare('UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE id = ?')
      .run(now, now, user.id);
    user.last_login_at = now;
    const session = await createSession(db, config, req, user);
    setSessionCookies(res, config, session.token, session.csrfToken, session.expiresAt);
    await logAuthEvent(db, config, { userId: user.id, email: user.email, eventType: 'LOGIN_SUCCEEDED', requestId, ip: req.ip });
    return res.json({ user: publicUser(user), csrfToken: session.csrfToken, expiresAt: session.expiresAt });
  });

  router.get('/me', authenticated, async (req: AuthenticatedRequest, res) => {
    const csrfToken = parseCookies(req.header('cookie')).get(config.csrfCookieName);
    if (!csrfToken || !req.auth || !safeTextEqual(sha256(csrfToken), req.auth.csrfHash)) {
      return jsonError(res, 401, 'تعذّر استعادة جلسة الحماية.', 'SESSION_INVALID');
    }
    return res.json({ user: req.auth.user, csrfToken, expiresAt: req.auth.expiresAt });
  });

  router.post('/logout', authenticated, csrfProtected, async (req: AuthenticatedRequest, res) => {
    if (req.auth) {
      await db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(req.auth.tokenHash);
      await logAuthEvent(db, config, {
        userId: req.auth.user.id,
        email: req.auth.user.email,
        eventType: 'LOGOUT',
        requestId: randomUUID(),
        ip: req.ip
      });
    }
    clearSessionCookies(res, config);
    return res.status(204).end();
  });

  router.post('/mfa/enroll', authenticated, csrfProtected, async (req: AuthenticatedRequest, res) => {
    if (!req.auth) return jsonError(res, 401, 'يلزم تسجيل الدخول.');
    if (!config.encryptionKey) return jsonError(res, 503, 'AUTH_ENCRYPTION_KEY مطلوب قبل تفعيل MFA.', 'MFA_NOT_CONFIGURED');
    const secret = generateTotpSecret();
    const encrypted = encryptSecret(secret, config.encryptionKey);
    await db.prepare('UPDATE users SET mfa_secret_encrypted = ?, mfa_enabled = 0, updated_at = ? WHERE id = ?')
      .run(encrypted, new Date().toISOString(), req.auth.user.id);
    const issuer = encodeURIComponent('MAJAL');
    const account = encodeURIComponent(req.auth.user.email);
    return res.json({ manualKey: secret, otpauthUri: `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&digits=6&period=30` });
  });

  router.post('/mfa/confirm', authenticated, csrfProtected, async (req: AuthenticatedRequest, res) => {
    if (!req.auth) return jsonError(res, 401, 'يلزم تسجيل الدخول.');
    if (!config.encryptionKey) return jsonError(res, 503, 'AUTH_ENCRYPTION_KEY مطلوب قبل تفعيل MFA.', 'MFA_NOT_CONFIGURED');
    const row = await db.prepare('SELECT * FROM users WHERE id = ?').get<UserRow>(req.auth.user.id);
    if (!row?.mfa_secret_encrypted) return jsonError(res, 409, 'ابدأ إعداد MFA أولاً.', 'MFA_ENROLLMENT_REQUIRED');
    const secret = decryptSecret(row.mfa_secret_encrypted, config.encryptionKey);
    if (!verifyTotp(secret, req.body?.code)) return jsonError(res, 400, 'رمز التحقق غير صحيح.', 'INVALID_MFA_CODE');
    await db.prepare('UPDATE users SET mfa_enabled = 1, updated_at = ? WHERE id = ?').run(new Date().toISOString(), row.id);
    await logAuthEvent(db, config, { userId: row.id, email: row.email, eventType: 'MFA_ENABLED', requestId: randomUUID(), ip: req.ip });
    return res.json({ enabled: true });
  });

  return router;
}

export async function purgeExpiredSessions(db: MajalDatabase) {
  const result = await db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
  return result.changes;
}
