/**
 * `fetch` that never leaks the browser's English network-failure text ("Failed to fetch",
 * "NetworkError when attempting to fetch resource", "Load failed") into the interface.
 * A dropped connection, a captive portal or a server restart rejects `fetch` itself — before
 * any HTTP status exists — and every client wrapper would otherwise show that raw text.
 */
import { isPlatformUpdating, showUpdatingNotice, updatingJsonResponse } from './updatingNotice';

export const NETWORK_ERROR_MESSAGE = 'تعذّر الاتصال بالخادم. تحقق من اتصالك بالإنترنت ثم حاول مجددًا.';

export class NetworkError extends Error {
  readonly code = 'NETWORK_ERROR';
  readonly status = 0;
  constructor() { super(NETWORK_ERROR_MESSAGE); this.name = 'NetworkError'; }
}

export const SESSION_EXPIRED_EVENT = 'majal:session-expired';

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    const response = await fetch(input, init);
    // A 401 on any authenticated call means the session ended (expiry, logout in another tab,
    // suspension). The app listens and returns to the signed-out state instead of leaving a
    // signed-in-looking page whose buttons silently fail.
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
    if (response.status === 401 && typeof window !== 'undefined' && !/\/api\/v1\/auth\//.test(url)) {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    // Our /api always answers JSON. A 5xx page in HTML is the platform swapping servers
    // mid-deploy: one calm notice instead of an error, and a JSON body callers can read.
    if (isPlatformUpdating(response.status, response.headers.get('content-type'))) {
      if (typeof window !== 'undefined') showUpdatingNotice();
      const method = String(init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
      return updatingJsonResponse(!['GET', 'HEAD'].includes(method));
    }
    return response;
  } catch (error) {
    // An aborted request is the caller's own decision, not a connectivity problem.
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new NetworkError();
  }
}
