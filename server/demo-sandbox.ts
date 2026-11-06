/*
 * الصندوق التجريبي المعزول على الخادم (على نموذج مِراس).
 *
 * المبدأ: زائر العرض لا يلمس قاعدة الإنتاج ولا أي خدمة خارجية، بحكم البناء لا بحكم الانتباه.
 *
 *  1. طبقتان مستقلّتان:
 *     - `demoGuard`: قائمة سماح ضيقة. أي طلب يحمل معرّف صندوق صالحًا ولا يطابق القائمة يُردّ 403
 *       قبل أن يصل إلى أي موجّه (مدفوعات، PACI، إشعارات، ذكاء اصطناعي، ويب هوك، إدارة...). لا تعتمد
 *       على AsyncLocalStorage إطلاقًا، فلا ينفعها ضياع السياق.
 *     - `createDemoAwareDb`: غلاف على قاعدة البيانات؛ داخل سياق صندوق يحوّل كل prepare/exec/transaction
 *       إلى نسخة SQLite خاصة بالزائر في الذاكرة. القاعدة الحقيقية (PostgreSQL في الإنتاج) لا تُرى من داخله.
 *  2. ترويسة الكوكيز تُحذف من طلب الصندوق: لا تصل جلسة حقيقية إلى الصندوق ولا يُمسح لها كوكي.
 *  3. المعرّف في ترويسة `x-majal-demo` لا كوكي (Firebase Hosting يحذف كل الكوكيز إلا `__session`).
 *  4. سقف عدد الصناديق، ومهلة (TTL)، ومفتاح إيقاف `MAJAL_DEMO_ENABLED=false` فيُردّ 404.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { openMajalDatabase, type MajalDatabase, type MajalStatement } from './database';

export const DEMO_HEADER = 'x-majal-demo';
export const DEMO_ID_PATTERN = /^demo_[0-9a-f]{64}$/;

/**
 * معرّف الصندوق موقَّع: `demo_` + 32 ست عشري عشوائية (nonce) + 32 ست عشري توقيع HMAC.
 * الصيغة العامة لم تتغير (64 ست عشري) فيبقى ناقل العميل كما هو، لكن الخادم لا يقبل ولا يحجز صندوقًا
 * إلا لمعرّف أصدره هو. المفتاح مشتق من سرّ الخادم القائم (AUTH_SESSION_SECRET) بسياق خاص، فيصمد المعرّف
 * عبر إعادة تشغيل Cloud Run وتعدّد النسخ، ولا يمكن تزويره بلا السر.
 */
export function createDemoIdSigner(secret?: string) {
  const root = secret && secret.trim().length >= 32 ? secret.trim() : randomBytes(32).toString('hex');
  const key = createHmac('sha256', root).update('majal-demo-sandbox-id-v1').digest();
  const mac = (nonce: string) => createHmac('sha256', key).update(nonce).digest('hex').slice(0, 32);
  return {
    issue(): string {
      const nonce = randomBytes(16).toString('hex');
      return `demo_${nonce}${mac(nonce)}`;
    },
    verify(id: string): boolean {
      if (!DEMO_ID_PATTERN.test(id)) return false;
      const nonce = id.slice(5, 37), given = Buffer.from(id.slice(37), 'utf8'), expected = Buffer.from(mac(nonce), 'utf8');
      return given.length === expected.length && timingSafeEqual(given, expected);
    }
  };
}
export const DEMO_TTL_MS = 30 * 60_000;
export const DEMO_MAX_SANDBOXES = 40;

export const DEMO_BLOCKED_MESSAGE = 'هذه العملية غير متاحة في البيئة التجريبية المعزولة.';

export function demoEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.MAJAL_DEMO_ENABLED ?? '').trim().toLowerCase() !== 'false';
}

interface Sandbox {
  db: MajalDatabase;
  expiresAt: number;
  createdAt: number;
}

export interface DemoRegistryOptions {
  ttlMs?: number;
  maxSandboxes?: number;
  now?: () => number;
  open?: () => Promise<MajalDatabase>;
  /** سرّ الخادم لاشتقاق مفتاح توقيع المعرّفات؛ بلا سر يُولَّد مفتاح عشوائي للعملية (تطوير/اختبار). */
  secret?: string;
}

/** سجل الصناديق + سياق الطلب الحالي. نسخة واحدة لكل عملية؛ تُنشأ نسخ إضافية في الاختبارات. */
export function createDemoRegistry(options: DemoRegistryOptions = {}) {
  const ttlMs = options.ttlMs ?? DEMO_TTL_MS;
  const maxSandboxes = options.maxSandboxes ?? DEMO_MAX_SANDBOXES;
  const now = options.now ?? Date.now;
  // دائمًا SQLite في الذاكرة، حتى حين يكون الإنتاج PostgreSQL: لا اتصال ولا ملف يشاركان الإنتاج.
  const open = options.open ?? (() => openMajalDatabase({ filename: ':memory:' }));
  const signer = createDemoIdSigner(options.secret);
  const sandboxes = new Map<string, Sandbox>();
  const als = new AsyncLocalStorage<{ id: string; db: MajalDatabase }>();

  async function destroy(id: string) {
    const box = sandboxes.get(id);
    if (!box) return;
    sandboxes.delete(id);
    try { await box.db.close(); } catch { /* صندوق يُرمى؛ لا يهم */ }
  }

  async function sweep() {
    const t = now();
    for (const [id, box] of [...sandboxes]) if (box.expiresAt <= t) await destroy(id);
  }

  async function create(id: string): Promise<boolean> {
    // لا يُحجز شيء لمعرّف لم يصدره الخادم.
    if (!signer.verify(id)) return false;
    await sweep();
    const existing = sandboxes.get(id);
    if (existing) { existing.expiresAt = now() + ttlMs; return true; }
    if (sandboxes.size >= maxSandboxes) return false;
    const db = await open();
    // قد يسبقنا طلب متزامن بالمعرّف نفسه.
    if (sandboxes.has(id) || sandboxes.size >= maxSandboxes) { await db.close(); return sandboxes.has(id); }
    sandboxes.set(id, { db, expiresAt: now() + ttlMs, createdAt: now() });
    return true;
  }

  function get(id: string): Sandbox | undefined {
    const box = sandboxes.get(id);
    if (!box) return undefined;
    if (box.expiresAt <= now()) { void destroy(id); return undefined; }
    return box;
  }

  return {
    ttlMs,
    maxSandboxes,
    issueId: signer.issue,
    verifyId: signer.verify,
    size: () => sandboxes.size,
    has: (id: string) => Boolean(get(id)),
    create,
    destroy,
    sweep,
    /** تمديد المهلة وتشغيل `next` داخل سياق الصندوق. false إن لم يوجد. */
    run(id: string, next: () => void): boolean {
      const box = get(id);
      if (!box) return false;
      box.expiresAt = now() + ttlMs;
      als.run({ id, db: box.db }, next);
      return true;
    },
    /** إعادة الصندوق إلى حالته الأولى: يُرمى القديم ويُبنى جديد بالمعرّف نفسه. */
    async reset(id: string): Promise<boolean> {
      if (!get(id)) return false;
      await destroy(id);
      return create(id);
    },
    currentDb: () => als.getStore()?.db,
    isDemoRequest: () => Boolean(als.getStore()),
    async closeAll() { for (const id of [...sandboxes.keys()]) await destroy(id); }
  };
}

export type DemoRegistry = ReturnType<typeof createDemoRegistry>;

/**
 * غلاف القاعدة: داخل صندوق → قاعدة الصندوق، خارجه → القاعدة الحقيقية.
 * `close` يغلق الحقيقية دائمًا (لا يُغلق صندوقٌ من داخل طلب).
 */
export function createDemoAwareDb(real: MajalDatabase, registry: DemoRegistry): MajalDatabase {
  const target = () => registry.currentDb() ?? real;
  return {
    get dialect() { return target().dialect; },
    prepare(sql: string): MajalStatement { return target().prepare(sql); },
    exec(sql: string) { return target().exec(sql); },
    transaction<T>(operation: (tx: MajalDatabase) => Promise<T>) { return target().transaction(operation); },
    close() { return real.close(); }
  };
}

/** قيمة الترويسة كما وردت إن طابقت الصيغة (بلا تحقق من التوقيع). */
export function rawDemoHeader(req: Pick<Request, 'headers'>): string {
  const raw = req.headers[DEMO_HEADER];
  const value = String((Array.isArray(raw) ? raw[0] : raw) ?? '').trim();
  return DEMO_ID_PATTERN.test(value) ? value : '';
}

/** معرّف موقَّع صالح أصدره الخادم، وإلا ''. */
export function readDemoId(req: Pick<Request, 'headers'>, registry: Pick<DemoRegistry, 'verifyId'>): string {
  const value = rawDemoHeader(req);
  return value && registry.verifyId(value) ? value : '';
}

/**
 * قائمة السماح للطلبات داخل الصندوق. قراءة فقط ولا آثار خارجية.
 * كل ما عداها (دفع، PACI، إشعارات، AI، ويب هوك، إدارة، تسجيل دخول حقيقي...) محجوب.
 */
export function isDemoAllowedRoute(method: string, path: string): boolean {
  const m = method.toUpperCase();
  if (path.startsWith('/api/v1/demo/')) return true;
  if (m !== 'GET' && m !== 'HEAD') return false;
  return (
    path === '/api/health' || path === '/api/version' || path === '/api/live' || path === '/api/ready' ||
    path === '/api/v1/auth/me' ||
    path === '/api/v1/compliance/jurisdiction-config' ||
    path.startsWith('/api/v1/public/')
  );
}

/**
 * الطبقة الأولى: تُركَّب في أول السلسلة، قبل الموجّهات كلها (وقبل الويب هوك).
 * - بلا معرّف صالح: يمرّ الطلب كما هو (حساب حقيقي، لا تغيير).
 * - بمعرّف صالح: تُحذف الكوكيز، ثم قائمة السماح.
 */
export function demoGuard(registry: Pick<DemoRegistry, 'verifyId'>, enabled: () => boolean = demoEnabled): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const claimed = rawDemoHeader(req);
    if (!claimed) return next();
    // ادّعى أنه صندوق لكن توقيعه لا يصح (مزوَّر أو من سر قديم): يُرفض قبل أي حجز، ولا يسقط إلى البيانات الحقيقية.
    if (!registry.verifyId(claimed)) {
      return void res.status(403).json({ error: 'معرّف البيئة التجريبية غير صالح. أعد الدخول إلى العرض.', code: 'DEMO_INVALID_ID' });
    }
    if (!enabled()) {
      // مفتاح الإيقاف: طلب بمعرّف صندوق لا يُخدَّم أبدًا بالبيانات الحقيقية.
      return void res.status(404).json({ error: 'البيئة التجريبية غير متاحة.', code: 'DEMO_DISABLED' });
    }
    delete req.headers.cookie;
    if (!isDemoAllowedRoute(req.method, req.path)) {
      return void res.status(403).json({ error: DEMO_BLOCKED_MESSAGE, code: 'DEMO_SANDBOX_BLOCKED' });
    }
    next();
  };
}

/**
 * الطبقة الثانية: تُركَّب بعد `express.json` (قراءة الجسم قد تُضيّع سياق AsyncLocalStorage)،
 * وتُشغّل بقية السلسلة داخل سياق الصندوق. صندوق مفقود (إعادة تشغيل Cloud Run أو انتهاء مهلة)
 * يُعاد بناؤه فارغًا بدل أن يسقط الطلب إلى القاعدة الحقيقية.
 */
export function demoContext(registry: DemoRegistry, enabled: () => boolean = demoEnabled, allocLimiter: RequestHandler = (_req, _res, next) => next()): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const id = readDemoId(req, registry);
    if (!id) return next();
    const fail = () => res.status(503).json({ error: 'تعذّر تجهيز البيئة التجريبية. أعد المحاولة.', code: 'DEMO_UNAVAILABLE' });
    if (!enabled()) return void res.status(404).json({ error: 'البيئة التجريبية غير متاحة.', code: 'DEMO_DISABLED' });
    if (registry.run(id, next)) return;
    // إعادة بناء صندوق مفقود تحجز ذاكرة كالدخول تمامًا، فتمرّ بالحدّ نفسه قبل فتح أي قاعدة
    // (وإلا أمكن استنزاف السقف بمعرّفات مختلفة على مسار عادي مثل /api/version).
    allocLimiter(req, res, () => {
      registry.create(id).then(ok => {
        if (ok && registry.run(id, next)) return;
        fail();
      }, fail);
    });
  };
}

/** مسارات `/api/v1/demo/*`. تُركَّب بعد `demoContext`. `limiter` يُمرَّر من الخادم (حدّ المعدل). */
export function createDemoRouter(registry: DemoRegistry, limiter: RequestHandler, enabled: () => boolean = demoEnabled): express.Router {
  const router = express.Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.get('/config', (req, res) => {
    res.json({ enabled: enabled(), active: registry.isDemoRequest(), ttlMs: registry.ttlMs });
  });
  router.post('/enter', limiter, async (req, res) => {
    if (!enabled()) return void res.status(404).json({ error: 'البيئة التجريبية غير متاحة.', code: 'DEMO_DISABLED' });
    const id = registry.issueId();
    if (!(await registry.create(id))) {
      return void res.status(503).json({ error: 'البيئة التجريبية ممتلئة حاليًا. أعد المحاولة بعد قليل.', code: 'DEMO_CAPACITY' });
    }
    res.json({ ok: true, sandbox: true, sessionId: id, ttlMs: registry.ttlMs });
  });
  router.post('/reset', limiter, async (req, res) => {
    const id = readDemoId(req, registry);
    if (!id || !(await registry.reset(id))) return void res.status(404).json({ error: 'لا توجد جلسة تجريبية نشطة.', code: 'DEMO_NOT_FOUND' });
    res.json({ ok: true, ttlMs: registry.ttlMs });
  });
  router.post('/exit', async (req, res) => {
    const id = readDemoId(req, registry);
    if (id) await registry.destroy(id);
    res.json({ ok: true });
  });
  return router;
}
