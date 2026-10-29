import { MajalDatabase } from './database';
import { createOrCoalesceNotification } from './notifications';

/*
 * إطلاق مجدول: يفتح البيع في `starts_at` مستقبلي، ويُنبَّه المنتظرون والمتابعون مرتين فقط —
 * قبل الفتح بساعة، وعند الفتح. كل خطوة تُحجز بتحديث شرطي (opens_reminded_at / open_notified_at
 * ما زال NULL) فلا يرسلها نسختان من الخادم ولا تتكرر عند إعادة التشغيل.
 *
 * لا نافذة مفتوحة للخلف: الإطلاقات التي فتحت قبل أكثر من يوم لا تُعلَن (مثلًا بعد توقف طويل)،
 * فلا يصل أحدًا إعلان قديم.
 */

export const REMINDER_LEAD_MS = 60 * 60_000;
const LATE_WINDOW_MS = 24 * 60 * 60_000;

type Row = { id: string; public_name: string; creator_id: string; display_name: string };

async function audience(db: MajalDatabase, launchId: string, creatorId: string) {
  const waiting = await db.prepare("SELECT id, user_id FROM drop_waitlist WHERE launch_id = ? AND status = 'WAITING' LIMIT 5000")
    .all<{ id: string; user_id: string }>(launchId);
  const followers = await db.prepare('SELECT user_id FROM creator_follows WHERE creator_id = ? AND alerts_opt_in = 1 LIMIT 5000')
    .all<{ user_id: string }>(creatorId);
  const waitingIds = new Set(waiting.map(w => w.user_id));
  return { waiting, followersOnly: followers.map(f => f.user_id).filter(id => !waitingIds.has(id)) };
}

const launchInfo = (db: MajalDatabase, launchId: string) => db.prepare(
  'SELECT l.id, p.public_name, c.creator_id, cp.display_name FROM launches l JOIN collaborations c ON c.id = l.collaboration_id JOIN products p ON p.id = l.product_id JOIN creator_profiles cp ON cp.id = c.creator_id WHERE l.id = ?'
).get<Row>(launchId);

/** Runs once a minute. Returns how many launches were announced, for tests and logs. */
export async function sweepLaunchSchedule(db: MajalDatabase, at = new Date()) {
  const nowIso = at.toISOString();
  const soonIso = new Date(at.getTime() + REMINDER_LEAD_MS).toISOString();
  const lateIso = new Date(at.getTime() - LATE_WINDOW_MS).toISOString();
  let reminded = 0, opened = 0;

  const soon = await db.prepare("SELECT id FROM launches WHERE status = 'LIVE' AND opens_reminded_at IS NULL AND starts_at > ? AND starts_at <= ? LIMIT 100")
    .all<{ id: string }>(nowIso, soonIso);
  for (const { id } of soon) {
    const claim = await db.prepare('UPDATE launches SET opens_reminded_at = ? WHERE id = ? AND opens_reminded_at IS NULL').run(nowIso, id);
    if (!claim.changes) continue;
    const info = await launchInfo(db, id);
    if (!info) continue;
    const who = await audience(db, id, info.creator_id);
    const targets = [...who.waiting.map(w => w.user_id), ...who.followersOnly];
    for (const userId of targets) {
      await createOrCoalesceNotification(db, {
        userId, category: 'LAUNCH_SOON', priority: 'NOW', title: 'ينفتح بعد أقل من ساعة',
        body: `«${info.public_name}» من ${info.display_name} يفتح قريبًا — الكمية محدودة. جهّز نفسك.`,
        actionLabel: 'افتح الإطلاق', actionSurface: 'CONSUMER', entityType: 'LAUNCH', entityId: id, dedupeKey: `launch-soon:${id}`
      });
    }
    reminded++;
  }

  const due = await db.prepare("SELECT id FROM launches WHERE status = 'LIVE' AND open_notified_at IS NULL AND starts_at <= ? AND starts_at > ? LIMIT 100")
    .all<{ id: string }>(nowIso, lateIso);
  for (const { id } of due) {
    const claim = await db.prepare('UPDATE launches SET open_notified_at = ? WHERE id = ? AND open_notified_at IS NULL').run(nowIso, id);
    if (!claim.changes) continue;
    const info = await launchInfo(db, id);
    if (!info) continue;
    const who = await audience(db, id, info.creator_id);
    for (const w of who.waiting) {
      await createOrCoalesceNotification(db, {
        userId: w.user_id, category: 'DROP_WAITLIST', priority: 'URGENT', title: 'فُتح الإطلاق الآن',
        body: `«${info.public_name}» متاح للطلب الآن — الكمية محدودة.`,
        actionLabel: 'اطلب الآن', actionSurface: 'CONSUMER', entityType: 'LAUNCH', entityId: id, dedupeKey: `waitlist:${id}`
      });
      await db.prepare("UPDATE drop_waitlist SET status = 'NOTIFIED', updated_at = ? WHERE id = ?").run(nowIso, w.id);
    }
    for (const userId of who.followersOnly) {
      await createOrCoalesceNotification(db, {
        userId, category: 'CREATOR_FOLLOW', priority: 'NOW', title: `إطلاق جديد من ${info.display_name}`,
        body: `نزل «${info.public_name}» الآن — الكمية محدودة.`,
        actionLabel: 'اطلب الآن', actionSurface: 'CONSUMER', entityType: 'LAUNCH', entityId: id, dedupeKey: `follow-launch:${id}`
      });
    }
    opened++;
  }
  return { reminded, opened };
}

/**
 * بعد كم مللي ثانية يلزم أن يستيقظ المكنِّس؟ (تذكير قبل ساعة، أو فتح الإطلاق) — null إن لم يكن
 * هناك إطلاق ينتظر. يتيح ذلك النوم الطويل دون تفويت موعدٍ مجدول.
 */
export async function msUntilNextLaunchEvent(db: MajalDatabase, at = new Date()): Promise<number | null> {
  const lateIso = new Date(at.getTime() - LATE_WINDOW_MS).toISOString();
  // Reminders only exist for launches that have not opened yet (the sweep's own query is
  // `starts_at > now`). Using the 24h late window here made every launch activated "now" look
  // like an overdue reminder, so the sweeper woke every few seconds for a whole day.
  const reminder = await db.prepare("SELECT MIN(starts_at) AS s FROM launches WHERE status = 'LIVE' AND opens_reminded_at IS NULL AND starts_at > ?")
    .get<{ s: string | null }>(at.toISOString());
  const opening = await db.prepare("SELECT MIN(starts_at) AS s FROM launches WHERE status = 'LIVE' AND open_notified_at IS NULL AND starts_at > ?")
    .get<{ s: string | null }>(lateIso);
  const events: number[] = [];
  if (reminder?.s) events.push(new Date(reminder.s).getTime() - REMINDER_LEAD_MS);
  if (opening?.s) events.push(new Date(opening.s).getTime());
  const valid = events.filter(Number.isFinite);
  if (!valid.length) return null;
  return Math.max(0, Math.min(...valid) - at.getTime());
}
