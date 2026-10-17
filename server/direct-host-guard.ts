import type { RequestHandler } from 'express';

/*
 * Visiting the service's own run.app address directly (no x-forwarded-host: it did not come
 * through Firebase Hosting) is the retired link. GET/HEAD are sent to the official origin;
 * webhooks (POST) and health checks are left alone. Controlled by REDIRECT_RUN_APP_TO: unset
 * means no redirect, and removing it rolls back instantly.
 */
const EXEMPT = /^\/(api\/(ready|health)|healthz|ready)(\/|$)/;

export function directRunAppTarget(host: string, forwardedHost: string, to: string, pathAndQuery: string): string | null {
  const origin = String(to || '').trim().replace(/\/+$/, '');
  if (!origin || String(forwardedHost || '').trim()) return null;
  const h = String(host || '').trim().toLowerCase().split(':')[0];
  return h.endsWith('.run.app') ? `${origin}${pathAndQuery}` : null;
}

export function directHostGuard(): RequestHandler {
  return (req, res, next) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || EXEMPT.test(req.path)) return next();
    const target = directRunAppTarget(
      String(req.headers.host || ''),
      String(req.headers['x-forwarded-host'] || ''),
      process.env.REDIRECT_RUN_APP_TO || '',
      req.originalUrl
    );
    if (!target) return next();
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, target);
  };
}
