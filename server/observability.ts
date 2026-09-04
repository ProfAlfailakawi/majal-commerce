import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

function cleanRequestId(value: string | undefined) {
  return value && /^[a-zA-Z0-9._:-]{8,128}$/.test(value) ? value : randomUUID();
}

export function structuredLog(severity: 'DEBUG'|'INFO'|'WARNING'|'ERROR'|'CRITICAL', event: string, fields: Record<string, unknown> = {}) {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (/password|secret|token|authorization|cookie|civil.?id|recipe/i.test(key)) continue;
    safe[key] = typeof value === 'string' && value.length > 2000 ? `${value.slice(0, 2000)}…` : value;
  }
  console.log(JSON.stringify({ severity, event, service: 'majal', ts: new Date().toISOString(), ...safe }));
}

/**
 * Number of reverse-proxy hops Express should trust when deriving `req.ip`.
 *
 * SECURITY: rate limiting, login lockout and auth audit records all key off `req.ip`. Behind a
 * proxy Express reports the proxy's own address unless `trust proxy` is configured, which
 * collapses every client into a single bucket — the limiter then throttles all traffic
 * globally instead of per client, and one abusive caller locks everyone out. Cloud Run (and a
 * typical single load balancer) appends exactly one hop, so 1 is the correct production
 * default; a direct local run has no proxy and stays at 0.
 *
 * Trusting MORE hops than actually exist is also unsafe: the client could then forge
 * `X-Forwarded-For` and spoof its own IP, so the value is clamped to a small range and any
 * invalid setting falls back to the default rather than being silently coerced.
 */
export const DEFAULT_TRUST_PROXY_HOPS_PRODUCTION = 1;
export const DEFAULT_TRUST_PROXY_HOPS_LOCAL = 0;
export const MAX_TRUST_PROXY_HOPS = 5;

export function resolveTrustProxyHops(rawValue: string | undefined, production: boolean): number {
  const fallback = production ? DEFAULT_TRUST_PROXY_HOPS_PRODUCTION : DEFAULT_TRUST_PROXY_HOPS_LOCAL;
  const trimmed = typeof rawValue === 'string' ? rawValue.trim() : '';
  if (!trimmed) return fallback;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_TRUST_PROXY_HOPS) {
    structuredLog('WARNING', 'trust_proxy_hops_invalid', { received: trimmed.slice(0, 16), usingDefault: fallback });
    return fallback;
  }
  if (production && parsed === 0) {
    // Explicit opt-out is honoured (a deployment may terminate directly), but it is loud:
    // with a proxy in front this silently disables per-client rate limiting.
    structuredLog('WARNING', 'trust_proxy_hops_disabled_in_production', { hops: 0 });
  }
  return parsed;
}

export function requestTelemetry() {
  return (req: Request, res: Response, next: NextFunction) => {
    const id = cleanRequestId(req.header('x-request-id'));
    const started = performance.now();
    res.setHeader('X-Request-Id', id);
    (req as Request & { requestId?: string }).requestId = id;
    res.on('finish', () => {
      const durationMs = Math.round((performance.now() - started) * 10) / 10;
      const severity = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARNING' : 'INFO';
      structuredLog(severity, 'http_request', {
        requestId: id,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs,
        contentLength: res.getHeader('content-length') ?? null,
        userAgentFamily: (req.header('user-agent') || '').split(/[ /]/)[0].slice(0, 80)
      });
    });
    next();
  };
}

export function installProcessSafetyHandlers() {
  process.on('unhandledRejection', reason => {
    structuredLog('CRITICAL', 'unhandled_rejection', { reason: reason instanceof Error ? reason.message : String(reason) });
  });
  process.on('uncaughtExceptionMonitor', error => {
    structuredLog('CRITICAL', 'uncaught_exception', { error: error.message, name: error.name });
  });
}
