import compression from 'compression';
import type { Request, RequestHandler, Response } from 'express';

/*
 * Gzip/brotli for the built client only: the JS and CSS bundles, the deck files and the
 * HTML shell.
 *
 * server.ts mounts this directly before express.static, after every API, webhook and health
 * route, so those responses never pass through it. The filter is a second guard, so that a
 * route added later still goes out exactly as before:
 *  - /api/** — includes the payment webhooks (/api/v1/payments/webhooks/:provider), the PACI
 *    callback (/api/v1/paci/internal/callback), the POS routes (/api/v1/pos/*), the AI routes
 *    (/api/ai/*) and the CSV statement download;
 *  - any /internal/** path, and any path with a /webhook or /webhooks segment;
 *  - any text/event-stream response: a gzip buffer would hold events back instead of letting
 *    each frame reach the client as it is written.
 * Everything else defers to compression's own filter (compressible Content-Type only).
 * compression itself also skips HEAD requests, bodies under 1 KB and Cache-Control: no-transform.
 */
const NEVER_COMPRESS_PATH = /^\/(?:api|internal)(?:\/|$)|\/webhooks?(?:\/|$)/i;
const EVENT_STREAM = /^\s*text\/event-stream\b/i;

export function shouldCompress(req: Request, res: Response): boolean {
  if (NEVER_COMPRESS_PATH.test(req.path)) return false;
  if (EVENT_STREAM.test(String(res.getHeader('Content-Type') ?? ''))) return false;
  return compression.filter(req, res);
}

export function staticCompression(): RequestHandler {
  return compression({ filter: shouldCompress });
}
