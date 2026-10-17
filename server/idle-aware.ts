import type { RequestHandler } from 'express';

/*
 * لماذا هذا الملف: مؤقّتات الخادم (توصيل الإشعارات كل 5 ثوانٍ، وتحرير الحجوزات وإعلان
 * الإطلاقات كل دقيقة) كانت تستعلم قاعدة البيانات ليلاً ونهاراً. فحص الصحة كل دقيقة يُبقي
 * النسخة حيّة، والمؤقّتات تُبقي القاعدة مستيقظة، فلا تنام Neon أبداً وتستهلك حصتها المجانية
 * (ساعات الحوسبة) قبل نهاية الشهر فتُغلق القاعدة والموقع معها.
 *
 * الحل: تعمل المؤقّتات بسرعتها المعتادة ما دام الزوّار حقيقيين، وتتباطأ إلى مرّة كل
 * IDLE_MS حين لا طلبات حقيقية — مع الاستيقاظ في الموعد بالضبط لإطلاقٍ مجدول قريب.
 */

export const ACTIVE_WINDOW_MS = 10 * 60_000;
export const IDLE_MS = 20 * 60_000;
const MIN_DELAY_MS = 5_000;

let lastActivityAt = Date.now();
const QUIET_PATH = /^\/api\/(live|ready|health)(\/|$)/;

export const noteActivity = (at = Date.now()) => { lastActivityAt = at; };
export const isActive = (now = Date.now(), windowMs = ACTIVE_WINDOW_MS) => now - lastActivityAt < windowMs;

/** فحوص الصحة والمراقبة ليست زواراً: لا تُبقي القاعدة مستيقظة. */
export const activityTracker: RequestHandler = (req, _res, next) => {
  if (req.method !== 'HEAD' && !QUIET_PATH.test(req.path)) noteActivity();
  next();
};

export function nextDelayMs(opts: { active: boolean; activeMs: number; idleMs?: number; wakeInMs?: number | null }) {
  let delay = opts.active ? opts.activeMs : (opts.idleMs ?? IDLE_MS);
  if (opts.wakeInMs != null) delay = Math.min(delay, Math.max(MIN_DELAY_MS, opts.wakeInMs));
  return Math.max(MIN_DELAY_MS, delay);
}

/** حلقة بمهلة متغيّرة (لا setInterval ثابت). تُعيد دالة الإيقاف. */
export function startAdaptiveLoop(
  task: () => Promise<unknown> | unknown,
  opts: { activeMs: number; idleMs?: number; wakeInMs?: () => Promise<number | null> }
) {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  const run = async () => {
    let wake: number | null = null;
    try { await task(); } catch { /* the task reports its own errors */ }
    try { wake = opts.wakeInMs ? await opts.wakeInMs() : null; } catch { wake = null; }
    if (stopped) return;
    timer = setTimeout(() => void run(), nextDelayMs({ active: isActive(), activeMs: opts.activeMs, idleMs: opts.idleMs, wakeInMs: wake }));
    timer.unref();
  };
  timer = setTimeout(() => void run(), 0);
  timer.unref();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
