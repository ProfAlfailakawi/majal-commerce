import assert from 'node:assert/strict';
import test from 'node:test';
import { createUser } from './auth';
import { parseOpensAt } from './domain';
import { msUntilNextLaunchEvent, REMINDER_LEAD_MS, sweepLaunchSchedule } from './launch-schedule';
import { openTestDatabase } from './test-db';

const password = ['Majal', 'Schedule', '2026!'].join('-');

async function seed(db: Awaited<ReturnType<typeof openTestDatabase>>) {
  const now = new Date().toISOString();
  const creator = await createUser(db, { name: 'مبدعة', email: 'creator@sched.test', phone: '+96550000010', password, role: 'CREATOR' });
  await db.prepare("INSERT INTO creator_profiles(id,user_id,display_name,specialty,created_at,updated_at) VALUES('cr_s',?,'أم عبدالله','b',?,?)").run(creator.id, now, now);
  await db.prepare("INSERT INTO organizations(id,commercial_name,organization_type,verification_status,created_at,updated_at) VALUES('org_s','مطبخ','HOST','VERIFIED',?,?)").run(now, now);
  await db.prepare("INSERT INTO products(id,creator_id,public_name,category,short_description,status,estimated_unit_cost_fils,target_price_fils,created_at,updated_at) VALUES('prod_s','cr_s','مجبوس الدياي','MEAL','d','LIVE_DROP',500,10000,?,?)").run(now, now);
  await db.prepare("INSERT INTO collaborations(id,product_id,creator_id,organization_id,stage,created_at,updated_at) VALUES('col_s','prod_s','cr_s','org_s','LIVE_TRIAL',?,?)").run(now, now);
  const mk = async (email: string, phone: string) => (await createUser(db, { name: 'مشتري ' + email[0], email, phone, password, role: 'CONSUMER' })).id;
  return { wait: await mk('wait@sched.test', '+96550000011'), follow: await mk('follow@sched.test', '+96550000012'), both: await mk('both@sched.test', '+96550000013'), other: await mk('other@sched.test', '+96550000014') };
}
const launch = (db: Awaited<ReturnType<typeof openTestDatabase>>, startsAt: string) =>
  db.prepare("INSERT INTO launches(id,collaboration_id,product_id,organization_id,status,quantity_cap,starts_at,created_at,updated_at) VALUES('lch_s','col_s','prod_s','org_s','LIVE',100,?,?,?)").run(startsAt, new Date().toISOString(), new Date().toISOString());
const inboxOf = async (db: Awaited<ReturnType<typeof openTestDatabase>>, userId: string) =>
  (await db.prepare('SELECT category, dedupe_key FROM notification_inbox WHERE user_id = ? ORDER BY dedupe_key').all<{ category: string; dedupe_key: string }>(userId)).map(r => `${r.category}|${r.dedupe_key}`);

test('opening time must be 2 minutes to 60 days ahead, or absent', () => {
  assert.equal(parseOpensAt(undefined), undefined);
  assert.equal(parseOpensAt(''), undefined);
  assert.equal(parseOpensAt('soon'), 'INVALID');
  assert.equal(parseOpensAt(12345), 'INVALID');
  assert.equal(parseOpensAt(new Date(Date.now() + 30_000).toISOString()), 'INVALID', 'too soon');
  assert.equal(parseOpensAt(new Date(Date.now() - 3_600_000).toISOString()), 'INVALID', 'in the past');
  assert.equal(parseOpensAt(new Date(Date.now() + 90 * 86_400_000).toISOString()), 'INVALID', 'too far');
  const ok = new Date(Date.now() + 3 * 86_400_000).toISOString();
  assert.equal(parseOpensAt(ok), ok);
});

test('waitlist and followers are told an hour before and at opening, once each; others never', async () => {
  const db = await openTestDatabase();
  try {
    const u = await seed(db);
    const now = new Date();
    const at = (ms: number) => new Date(now.getTime() + ms).toISOString();
    await launch(db, at(3 * 3_600_000));
    await db.prepare("INSERT INTO drop_waitlist(id,launch_id,user_id,phone,whatsapp_opt_in,status,created_at,updated_at) VALUES('wl1','lch_s',?,'+96550000011',1,'WAITING',?,?)").run(u.wait, at(0), at(0));
    await db.prepare("INSERT INTO drop_waitlist(id,launch_id,user_id,phone,whatsapp_opt_in,status,created_at,updated_at) VALUES('wl2','lch_s',?,'+96550000013',1,'WAITING',?,?)").run(u.both, at(0), at(0));
    await db.prepare("INSERT INTO creator_follows(user_id,creator_id,alerts_opt_in,created_at) VALUES(?,'cr_s',1,?)").run(u.follow, at(0));
    await db.prepare("INSERT INTO creator_follows(user_id,creator_id,alerts_opt_in,created_at) VALUES(?,'cr_s',1,?)").run(u.both, at(0));

    // 3 hours out: nothing yet.
    assert.deepEqual(await sweepLaunchSchedule(db, now), { reminded: 0, opened: 0 });

    // 50 minutes out: the reminder goes to waitlist + followers, once, each person once.
    await db.prepare("UPDATE launches SET starts_at = ? WHERE id = 'lch_s'").run(at(50 * 60_000));
    assert.deepEqual(await sweepLaunchSchedule(db, now), { reminded: 1, opened: 0 });
    assert.deepEqual(await sweepLaunchSchedule(db, now), { reminded: 0, opened: 0 }, 'a second sweep claims nothing');
    assert.deepEqual(await inboxOf(db, u.wait), ['LAUNCH_SOON|launch-soon:lch_s']);
    assert.deepEqual(await inboxOf(db, u.follow), ['LAUNCH_SOON|launch-soon:lch_s']);
    assert.deepEqual(await inboxOf(db, u.both), ['LAUNCH_SOON|launch-soon:lch_s'], 'on both lists, still told once');
    assert.deepEqual(await inboxOf(db, u.other), []);

    // It opens: waitlist is told "open now" and marked NOTIFIED; followers hear about the new launch.
    const later = new Date(now.getTime() + 55 * 60_000);
    assert.deepEqual(await sweepLaunchSchedule(db, later), { reminded: 0, opened: 1 });
    assert.deepEqual(await sweepLaunchSchedule(db, later), { reminded: 0, opened: 0 });
    assert.ok((await inboxOf(db, u.wait)).includes('DROP_WAITLIST|waitlist:lch_s'));
    assert.ok((await inboxOf(db, u.both)).includes('DROP_WAITLIST|waitlist:lch_s'));
    assert.ok(!(await inboxOf(db, u.both)).some(k => k.startsWith('CREATOR_FOLLOW')), 'a waitlisted follower is not told twice');
    assert.ok((await inboxOf(db, u.follow)).includes('CREATOR_FOLLOW|follow-launch:lch_s'));
    assert.deepEqual(await inboxOf(db, u.other), []);
    const statuses = (await db.prepare("SELECT status FROM drop_waitlist ORDER BY id").all<{ status: string }>()).map(r => r.status);
    assert.deepEqual(statuses, ['NOTIFIED', 'NOTIFIED']);
  } finally { await db.close(); }
});

test('a launch that already opened (or opened long ago) is never announced by the sweeper', async () => {
  const db = await openTestDatabase();
  try {
    const u = await seed(db);
    const now = new Date();
    await db.prepare("INSERT INTO creator_follows(user_id,creator_id,alerts_opt_in,created_at) VALUES(?,'cr_s',1,?)").run(u.follow, now.toISOString());
    // Opened two days ago and never marked: outside the 24h window, so skipped rather than blasted.
    await launch(db, new Date(now.getTime() - 2 * 86_400_000).toISOString());
    assert.deepEqual(await sweepLaunchSchedule(db, now), { reminded: 0, opened: 0 });
    // Opened immediately at activation (open_notified_at set): also skipped.
    await db.prepare("UPDATE launches SET starts_at = ?, open_notified_at = ?, opens_reminded_at = ? WHERE id = 'lch_s'").run(now.toISOString(), now.toISOString(), now.toISOString());
    assert.deepEqual(await sweepLaunchSchedule(db, new Date(now.getTime() + 1000)), { reminded: 0, opened: 0 });
    assert.deepEqual(await inboxOf(db, u.follow), []);
  } finally { await db.close(); }
});

test('the sweeper knows exactly when to wake: the reminder, then the opening, never a minute early', async () => {
  const db = await openTestDatabase();
  try {
    await seed(db);
    const now = new Date();
    const at = (ms: number) => new Date(now.getTime() + ms).toISOString();
    assert.equal(await msUntilNextLaunchEvent(db, now), null, 'nothing scheduled, nothing to wake for');
    await launch(db, at(3 * 3_600_000));
    assert.equal(await msUntilNextLaunchEvent(db, now), 3 * 3_600_000 - REMINDER_LEAD_MS);
    await sweepLaunchSchedule(db, new Date(now.getTime() + 2.5 * 3_600_000));
    assert.equal(await msUntilNextLaunchEvent(db, new Date(now.getTime() + 2.5 * 3_600_000)), 0.5 * 3_600_000);
  } finally {
    await db.close();
  }
});
