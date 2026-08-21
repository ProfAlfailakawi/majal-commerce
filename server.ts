import express, { NextFunction, Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { generateProductCopyPolish, explainHostMatch } from './src/lib/gemini';
import { createAuthConfig, createAuthRouter, purgeExpiredSessions, requireAuth, requireCsrf } from './server/auth';
import { createCatalogRouter } from './server/catalog';
import { databaseHealth, MajalDatabase, openMajalDatabase } from './server/database';
import { createNotificationRouter } from './server/notifications';
import { createPaciCallbackHandler, createPaciRegistry, createPaciRouter } from './server/paci';
import { createPaymentRegistry, createPaymentRouter, createPaymentWebhookHandler } from './server/payments';
import { createDomainRouter } from './server/domain';
import { createAdvancedRouter } from './server/advanced';
import { deliveryReadiness, startNotificationDeliveryWorker } from './server/delivery';
import { installProcessSafetyHandlers, requestTelemetry, structuredLog } from './server/observability';
import { secureStorageReadiness } from './server/secure-storage';

dotenv.config({ quiet: true });
installProcessSafetyHandlers();

const isProduction = process.env.NODE_ENV === 'production';
const simulatorsEnabled = !isProduction && process.env.ENABLE_INTEGRATION_SIMULATORS === 'true';
const aiEnabled = process.env.ENABLE_AI_API === 'true';
const configuredPort = Number(process.env.PORT || 3000);
const port = Number.isInteger(configuredPort) && configuredPort > 0 && configuredPort < 65536 ? configuredPort : 3000;
const bindHost = isProduction ? (process.env.HOST || '0.0.0.0') : (process.env.DEV_HOST || '127.0.0.1');

type RateEntry = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateEntry>();
const rateLimit = (limit: number, windowMs: number, scope = 'global') => (req: Request, res: Response, next: NextFunction) => {
  const currentTime = Date.now();
  if (rateBuckets.size > 10_000) for (const [key, bucket] of rateBuckets) if (bucket.resetAt <= currentTime) rateBuckets.delete(key);
  const key = `${req.ip}:${scope}`;
  const previous = rateBuckets.get(key);
  const entry = !previous || previous.resetAt <= currentTime ? { count: 0, resetAt: currentTime + windowMs } : previous;
  entry.count += 1;
  rateBuckets.set(key, entry);
  res.setHeader('RateLimit-Limit', String(limit));
  res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - entry.count)));
  res.setHeader('RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));
  if (entry.count > limit) return res.status(429).json({ error: 'تم تجاوز الحد المؤقت للطلبات. حاول لاحقًا.' });
  next();
};
const textValue = (value: unknown, min: number, max: number) => {
  if (typeof value !== 'string') return undefined;
  const clean = value.trim();
  return clean.length >= min && clean.length <= max ? clean : undefined;
};
const jsonError = (res: Response, status: number, message: string, code?: string) => res.status(status).json({ error: message, ...(code ? { code } : {}) });

interface BootState {
  phase: 'BOOTING' | 'READY' | 'FAILED';
  startedAt: string;
  readyAt?: string;
  failureCode?: string;
}
const boot: BootState = { phase: 'BOOTING', startedAt: new Date().toISOString() };

function safeStartupCode(error: unknown) {
  const message = error instanceof Error ? error.message : 'UNKNOWN_STARTUP_ERROR';
  if (/AUTH_SESSION_SECRET/.test(message)) return 'AUTH_SESSION_SECRET_INVALID';
  if (/AUTH_ENCRYPTION_KEY/.test(message)) return 'AUTH_ENCRYPTION_KEY_INVALID';
  if (/DATABASE_URL/.test(message)) return 'DATABASE_URL_MISSING';
  if (/client bundle/i.test(message)) return 'CLIENT_BUNDLE_MISSING';
  if (/SECURE_STORAGE/.test(message)) return 'SECURE_STORAGE_NOT_CONFIGURED';
  if (/ECONN|database|postgres|pg/i.test(message)) return 'DATABASE_STARTUP_FAILED';
  return message.replace(/[^A-Z0-9_:-]/gi, '_').slice(0, 120) || 'STARTUP_FAILED';
}

async function initializeApplication(app: express.Express) {
  const authConfig = createAuthConfig(isProduction);
  const db = await openMajalDatabase();
  const paymentRegistry = createPaymentRegistry();
  const paciRegistry = createPaciRegistry();
  const paymentReady = paymentRegistry.readiness;
  const paciReady = paciRegistry.readiness;

  app.post('/api/v1/payments/webhooks/:provider', rateLimit(300, 60_000, 'payment-webhook'), express.raw({ type: 'application/json', limit: '256kb' }), createPaymentWebhookHandler(db, paymentRegistry));
  app.post('/api/v1/paci/internal/callback', rateLimit(120, 60_000, 'paci-callback'), express.raw({ type: 'application/json', limit: '64kb' }), createPaciCallbackHandler(db));

  // Only the document extraction endpoint receives a larger JSON envelope.
  app.use('/api/v1/domain/innovations/zero-form/extract', express.json({ limit: '2200kb', strict: true }));
  app.use(express.json({ limit: '64kb', strict: true }));
  app.use('/api', rateLimit(240, 15 * 60_000, 'api'));

  app.get('/api/health', async (_req, res) => {
    const database = await databaseHealth(db);
    res.json({
      status: database.ready ? 'ok' : 'degraded', service: 'MAJAL Commerce Platform', version: '5.1.0',
      mode: isProduction ? 'production' : 'development', database,
      integrations: {
        payments: paymentReady.configured ? 'READY' : 'NOT_CONFIGURED',
        paci: paciReady.configured ? 'READY' : 'NOT_CONFIGURED',
        secureStorage: secureStorageReadiness(),
        notifications: deliveryReadiness()
      }
    });
  });

  app.use('/api/v1/auth', rateLimit(30, 15 * 60_000, 'auth'), createAuthRouter(db, authConfig));
  app.use('/api/v1/catalog', createCatalogRouter(db, authConfig));
  app.use('/api/v1/notifications', createNotificationRouter(db, authConfig));
  app.use('/api/v1/payments', createPaymentRouter(db, authConfig, paymentRegistry));
  app.use('/api/v1/paci', createPaciRouter(db, authConfig, paciRegistry));
  app.use('/api/v1/domain', createDomainRouter(db, authConfig));
  app.use('/api/v1/advanced', createAdvancedRouter(db, authConfig));

  const authenticated = requireAuth(db, authConfig);
  const csrfProtected = requireCsrf(authConfig);
  const requireAiAccess = (_req: Request, res: Response, next: NextFunction) => {
    if (!aiEnabled) return jsonError(res, 503, 'المساعد الذكي غير مفعّل في هذه البيئة.', 'AI_NOT_ENABLED');
    if (!process.env.GEMINI_API_KEY) return jsonError(res, 503, 'مفتاح خدمة الذكاء الاصطناعي غير مهيأ.', 'AI_KEY_MISSING');
    next();
  };

  app.post('/api/ai/polish-description', rateLimit(10, 60_000, 'ai-polish'), authenticated, csrfProtected, requireAiAccess, async (req, res) => {
    const description = textValue(req.body?.description, 10, 1_500), category = textValue(req.body?.category, 2, 80), story = textValue(req.body?.story, 2, 800);
    if (!description || !category || !story) return jsonError(res, 400, 'بيانات الوصف أو الفئة أو القصة غير صالحة.');
    try { res.json({ polishedText: await generateProductCopyPolish(description, category, story) }); }
    catch { jsonError(res, 502, 'تعذّر الوصول إلى خدمة الذكاء الاصطناعي.'); }
  });

  app.post('/api/ai/match-explainer', rateLimit(10, 60_000, 'ai-match'), authenticated, csrfProtected, requireAiAccess, async (req, res) => {
    const productName = textValue(req.body?.productName, 2, 120), category = textValue(req.body?.category, 2, 80), hostName = textValue(req.body?.hostName, 2, 120);
    const equipment = Array.isArray(req.body?.equipment) ? req.body.equipment.map((item: unknown) => textValue(item, 1, 80)).filter(Boolean).slice(0, 30) as string[] : [];
    const marginScore = Number(req.body?.marginScore);
    if (!productName || !category || !hostName || !Number.isFinite(marginScore) || marginScore < 0 || marginScore > 100) return jsonError(res, 400, 'بيانات المطابقة غير صالحة.');
    try { res.json({ explanation: await explainHostMatch(productName, category, hostName, equipment, marginScore) }); }
    catch { jsonError(res, 502, 'تعذّر الوصول إلى خدمة الذكاء الاصطناعي.'); }
  });

  app.get('/api/v1/compliance/jurisdiction-config', (_req, res) => res.json({
    country: 'KW', currency: 'KWD', currencySymbol: 'د.ك', legalConfigurationStatus: 'COUNSEL_SIGNOFF_REQUIRED',
    requiredDocs: [
      { type: 'COMMERCIAL_LICENSE', name: 'الرخصة التجارية' },
      { type: 'HEALTH_PERMIT', name: 'ترخيص تداول الأغذية' },
      { type: 'FIRE_SAFETY', name: 'شهادة الإطفاء والسلامة' }
    ],
    legalBasisReferences: ['Kuwait Law No. 20 of 2014 (Electronic Transactions)', 'PACI Kuwait Mobile ID / Digital Signature service-provider requirements'],
    note: 'الإعداد التقني لا يمثل اعتمادًا قانونيًا؛ يلزم اعتماد مستشار كويتي والجهات/المزودين المختصين قبل الأثر الملزم.'
  }));

  if (simulatorsEnabled) {
    app.post('/api/v1/pos/connect', (req, res) => {
      const hostBusinessId = textValue(req.body?.hostBusinessId, 3, 100), provider = textValue(req.body?.provider, 3, 30);
      if (!hostBusinessId || !provider || !['FOODICS', 'DELIVERECT', 'URBAN_PIPER', 'SYRVE'].includes(provider)) return jsonError(res, 400, 'بيانات ربط POS غير صالحة.');
      res.json({ success: true, simulated: true, connectionId: `sim_pos_${Date.now()}`, provider, hostBusinessId, status: 'SIMULATED_CONNECTED', legalEffect: 'NONE' });
    });
    app.post('/api/v1/pos/webhook/:hostBusinessId', (_req, res) => res.json({ received: true, simulated: true, processed: false, royaltyAccrued: false, legalEffect: 'NONE' }));
  } else {
    app.all('/api/v1/pos/*', (_req, res) => jsonError(res, 503, 'تكامل POS غير مربوط، والمحاكي مقفول في هذه البيئة.', 'POS_NOT_CONFIGURED'));
  }

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const disableHmr = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({ server: { middlewareMode: true, hmr: disableHmr ? false : undefined, watch: disableHmr ? null : undefined }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist'), indexPath = path.join(distPath, 'index.html');
    if (!fs.existsSync(indexPath)) throw new Error('Production client bundle is missing. Run npm run build first.');
    app.use(express.static(distPath, { index: false, maxAge: '1h', immutable: false }));
    app.get('*', (req, res) => path.extname(req.path) ? jsonError(res, 404, 'الملف غير موجود.') : res.sendFile(indexPath));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    structuredLog('WARNING', 'request_rejected', { errorType: err instanceof Error ? err.name : 'UnknownError' });
    if (!res.headersSent) jsonError(res, 400, 'الطلب غير صالح.');
  });

  const stopDeliveryWorker = startNotificationDeliveryWorker(db);
  const cleanupTimer = setInterval(() => void purgeExpiredSessions(db), 30 * 60_000);
  cleanupTimer.unref();
  return {
    db,
    shutdown: async () => {
      stopDeliveryWorker(); clearInterval(cleanupTimer); await db.close();
    }
  };
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  const trustedProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
  if (Number.isInteger(trustedProxyHops) && trustedProxyHops > 0 && trustedProxyHops <= 5) app.set('trust proxy', trustedProxyHops);
  app.use(requestTelemetry());
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    if (isProduction) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://images.unsplash.com; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    }
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.get('/api/live', (_req, res) => res.json({ status: 'live', boot: boot.phase, startedAt: boot.startedAt }));
  app.get('/api/ready', (_req, res) => res.status(boot.phase === 'READY' ? 200 : 503).json({ ready: boot.phase === 'READY', phase: boot.phase, failureCode: boot.failureCode ?? null }));

  let resources: { db: MajalDatabase; shutdown: () => Promise<void> } | undefined;
  const server = app.listen(port, bindHost, () => {
    structuredLog('INFO', 'server_listening', { mode: isProduction ? 'production' : 'development', host: bindHost, port });
  });

  try {
    resources = await initializeApplication(app);
    boot.phase = 'READY'; boot.readyAt = new Date().toISOString();
    structuredLog('INFO', 'server_ready', { readyAt: boot.readyAt, port });
  } catch (error) {
    boot.phase = 'FAILED'; boot.failureCode = safeStartupCode(error);
    structuredLog('CRITICAL', 'startup_failed_after_bind', { failureCode: boot.failureCode });
    // Fail closed while keeping the Cloud Run port open so startup diagnostics are truthful.
    app.use((_req, res) => jsonError(res, 503, 'الخدمة غير جاهزة بسبب إعداد إنتاج مفقود أو فشل تهيئة.', boot.failureCode));
  }

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return; shuttingDown = true;
    structuredLog('INFO', 'shutdown_started', { signal });
    const hardStop = setTimeout(() => process.exit(1), 25_000); hardStop.unref();
    server.close(async () => {
      try { await resources?.shutdown(); } finally { clearTimeout(hardStop); process.exit(0); }
    });
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

void startServer();
