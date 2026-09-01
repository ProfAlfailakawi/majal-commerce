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
  const response = await fetch(url, {
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
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new AuthApiError(payload.error || 'تعذّر إكمال الطلب.', payload.code, response.status);
  return payload as T;
}

function rememberSession(session: AuthSession) {
  csrfToken = session.csrfToken;
  return session;
}

export async function restoreAuthSession() {
  try {
    return rememberSession(await request<AuthSession>('/api/v1/auth/me'));
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 401) {
      csrfToken = null;
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

export async function resetPassword(email: string, newPassword: string) {
  return rememberSession(await request<AuthSession>('/api/v1/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ email, newPassword })
  }));
}

export async function register(input: { name: string; email: string; phone: string; password: string; role?: string }) {
  return rememberSession(await request<AuthSession>('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify(input)
  }));
}

export async function logout() {
  await request<void>('/api/v1/auth/logout', { method: 'POST' });
  csrfToken = null;
}

export function beginMfaEnrollment() {
  return request<{ manualKey: string; otpauthUri: string }>('/api/v1/auth/mfa/enroll', { method: 'POST' });
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
