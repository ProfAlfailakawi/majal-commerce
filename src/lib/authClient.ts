import { User } from '../types/majal';

export interface AuthSession {
  user: User & { mfaEnabled?: boolean };
  csrfToken: string;
  expiresAt: string;
}

export class AuthApiError extends Error {
  constructor(message: string, public readonly code?: string, public readonly status?: number) {
    super(message);
  }
}

let csrfToken: string | null = null;

const csrfCookieName = import.meta.env.PROD ? '__Host-majal_csrf' : 'majal_csrf';

function cookieValue(name: string) {
  if (typeof document === 'undefined') return undefined;
  return document.cookie
    .split(';')
    .map(value => value.trim())
    .find(value => value.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

async function request<T>(url: string, init: RequestInit = {}) {
  let response: Response;
  try {
    response = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.method && !['GET', 'HEAD'].includes(init.method.toUpperCase())
        ? { 'X-CSRF-Token': csrfToken || decodeURIComponent(cookieValue(csrfCookieName) || '') }
        : {}),
      ...init.headers
    }
  });
  } catch {
    // The browser's own text ("Failed to fetch") is English and means nothing to the user.
    throw new AuthApiError('تعذّر الاتصال بالخادم. تحقق من اتصالك بالإنترنت ثم حاول مجددًا.', 'NETWORK_ERROR');
  }
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Gateways/proxies answer overload and outages with HTML or empty bodies, not our JSON.
    const fallback = response.status === 429 ? 'محاولات كثيرة خلال وقت قصير. انتظر قليلًا ثم حاول مجددًا.'
      : response.status >= 500 ? 'الخدمة غير متاحة مؤقتًا. حاول مرة أخرى بعد قليل.'
      : 'تعذّر إكمال الطلب.';
    throw new AuthApiError(payload.error || fallback, payload.code, response.status);
  }
  return payload as T;
}

// The session cookie is HttpOnly, and in production there is no readable CSRF cookie, so a
// localStorage flag records that a session was started in this browser.
const sessionHintKey = 'majal_session_hint';

function setSessionHint(on: boolean) {
  try {
    if (on) localStorage.setItem(sessionHintKey, '1');
    else localStorage.removeItem(sessionHintKey);
  } catch { /* storage unavailable: the probe below simply runs every load */ }
}

function rememberSession(session: AuthSession) {
  csrfToken = session.csrfToken;
  setSessionHint(true);
  return session;
}

// With no hint there is no session to restore, so a first-time visitor skips the probe
// instead of logging a 401 on every page load. A storage failure falls back to probing.
function hasSessionHint() {
  if (typeof document === 'undefined') return true;
  if (/(?:^|;\s*)(?:__Host-)?majal_csrf=/.test(document.cookie)) return true;
  try {
    return localStorage.getItem(sessionHintKey) === '1';
  } catch {
    return true;
  }
}

export async function restoreAuthSession() {
  if (!hasSessionHint()) {
    csrfToken = null;
    return null;
  }
  try {
    return rememberSession(await request<AuthSession>('/api/v1/auth/me'));
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 401) {
      csrfToken = null;
      setSessionHint(false);
      return null;
    }
    throw error;
  }
}

export async function login(email: string, password: string, mfaCode?: string) {
  return rememberSession(await request<AuthSession>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, ...(mfaCode ? { mfaCode } : {}) })
  }));
}

export async function requestPasswordReset(email: string) {
  return request<{ message: string }>('/api/v1/auth/reset-password-request', {
    method: 'POST',
    body: JSON.stringify({ email })
  });
}

export async function verifyPasswordReset(email: string, code: string, newPassword: string) {
  return rememberSession(await request<AuthSession>('/api/v1/auth/reset-password-verify', {
    method: 'POST',
    body: JSON.stringify({ email, code, newPassword })
  }));
}

export async function register(input: {
  name: string;
  email: string;
  phone: string;
  password: string;
  termsAccepted: true;
  privacyAccepted: true;
  role?: string;
  accountType?: 'STANDARD' | 'SUPPLIER';
  organization?: {
    commercialName: string;
    businessType: 'RESTAURANT' | 'BAKERY' | 'CENTRAL_KITCHEN' | 'CAFE' | 'FACTORY';
    commercialRegistrationNo?: string;
  };
  supplier?: {
    commercialName: string;
    category: string;
    commercialRegistrationNo?: string;
    description?: string;
  };
}) {
  return rememberSession(await request<AuthSession>('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify(input)
  }));
}

export async function logout() {
  await request<void>('/api/v1/auth/logout', { method: 'POST' });
  csrfToken = null;
  setSessionHint(false);
}

/** `currentCode` is required by the server only when MFA is already active (re-enrolment). */
export function beginMfaEnrollment(currentCode?: string) {
  return request<{ manualKey: string; otpauthUri: string }>('/api/v1/auth/mfa/enroll', {
    method: 'POST',
    ...(currentCode ? { body: JSON.stringify({ code: currentCode }) } : {})
  });
}

export function confirmMfaEnrollment(code: string) {
  return request<{ enabled: boolean }>('/api/v1/auth/mfa/confirm', {
    method: 'POST',
    body: JSON.stringify({ code })
  });
}

export function authCsrfToken() {
  return csrfToken || decodeURIComponent(cookieValue(csrfCookieName) || '');
}
