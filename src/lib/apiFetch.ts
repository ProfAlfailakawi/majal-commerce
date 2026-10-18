/**
 * `fetch` that never leaks the browser's English network-failure text ("Failed to fetch",
 * "NetworkError when attempting to fetch resource", "Load failed") into the interface.
 * A dropped connection, a captive portal or a server restart rejects `fetch` itself — before
 * any HTTP status exists — and every client wrapper would otherwise show that raw text.
 */
export const NETWORK_ERROR_MESSAGE = 'تعذّر الاتصال بالخادم. تحقق من اتصالك بالإنترنت ثم حاول مجددًا.';

export class NetworkError extends Error {
  readonly code = 'NETWORK_ERROR';
  readonly status = 0;
  constructor() { super(NETWORK_ERROR_MESSAGE); this.name = 'NetworkError'; }
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    // An aborted request is the caller's own decision, not a connectivity problem.
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new NetworkError();
  }
}
