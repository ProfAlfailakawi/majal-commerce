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
