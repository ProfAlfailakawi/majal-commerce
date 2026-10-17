import { MajalDatabase } from './database';
import { createOrCoalesceNotification, type CreateNotificationInput } from './notifications';

/*
 * Who gets told what. Every producer in the platform goes through here so that:
 *  - a failure to notify can never fail the action that caused it,
 *  - the person who did the thing is not told about their own action,
 *  - recipients are resolved from membership tables (never from a request body),
 *  - the bell opens the right surface for the recipient's role.
 */

export type NotifyInput = Omit<CreateNotificationInput, 'userId'>;

/** Surfaces a bell item can open, per recipient kind. */
export const SURFACE = { creator: 'CREATOR', host: 'HOST', supplier: 'SUPPLIER', admin: 'ADMIN', consumer: 'CONSUMER' } as const;

/** Roles that run a facility day to day; finance/marketing/support are told only about what concerns them. */
export const HOST_DECIDERS = ['HOST_OWNER', 'HOST_OPERATIONS'] as const;
export const HOST_PRODUCT = ['HOST_OWNER', 'HOST_OPERATIONS', 'HOST_CHEF'] as const;
export const HOST_MONEY = ['HOST_OWNER', 'HOST_OPERATIONS', 'HOST_FINANCE'] as const;

export async function notify(db: MajalDatabase, userIds: ReadonlyArray<string | null | undefined>, input: NotifyInput, exceptUserId?: string) {
  const unique = [...new Set(userIds.filter((id): id is string => !!id && id !== exceptUserId))];
  for (const userId of unique) {
    try { await createOrCoalesceNotification(db, { ...input, userId }); } catch { /* never fail the caller */ }
  }
}

export async function creatorUserId(db: MajalDatabase, creatorId: string | null | undefined) {
  if (!creatorId) return undefined;
  return (await db.prepare('SELECT user_id FROM creator_profiles WHERE id = ?').get<{ user_id: string }>(creatorId))?.user_id;
}

/** Active members of an organisation, optionally limited to some roles. */
export async function orgMemberIds(db: MajalDatabase, organizationId: string | null | undefined, roles: ReadonlyArray<string> = HOST_DECIDERS) {
  if (!organizationId) return [];
  const rows = await db.prepare("SELECT user_id, role FROM organization_memberships WHERE organization_id = ? AND status = 'ACTIVE' LIMIT 200").all<{ user_id: string; role: string }>(organizationId);
  return rows.filter(r => roles.includes(r.role)).map(r => r.user_id);
}

export async function adminIds(db: MajalDatabase) {
  return (await db.prepare("SELECT id FROM users WHERE role IN ('ADMIN','SUPER_ADMIN') AND status = 'ACTIVE' LIMIT 20").all<{ id: string }>()).map(r => r.id);
}

/** One inbox item per kind for every active administrator; repeats coalesce into a counter. */
export async function notifyAdmins(db: MajalDatabase, kind: string, title: string, body = 'بانتظار قرارك في تبويب الاعتمادات.') {
  try {
    await notify(db, await adminIds(db), {
      category: 'ADMIN_REVIEW', priority: 'SOON', title, body, actionLabel: 'افتح الاعتمادات', actionSurface: SURFACE.admin, dedupeKey: `admin-pending:${kind}`
    });
  } catch { /* the submission already succeeded */ }
}

/** The two sides of a collaboration, resolved to user ids. */
export async function collaborationSides(db: MajalDatabase, collaborationId: string) {
  const col = await db.prepare('SELECT creator_id, organization_id FROM collaborations WHERE id = ?').get<{ creator_id: string; organization_id: string }>(collaborationId);
  if (!col) return undefined;
  return { creatorUser: await creatorUserId(db, col.creator_id), hostUsers: await orgMemberIds(db, col.organization_id, HOST_PRODUCT), organizationId: col.organization_id, creatorId: col.creator_id };
}

/** Everyone with a stake in a launch: its creator, and the facility's money and product people. */
export async function launchParties(db: MajalDatabase, launchId: string) {
  const row = await db.prepare('SELECT l.id, l.organization_id, c.creator_id, p.public_name FROM launches l JOIN products p ON p.id = l.product_id JOIN collaborations c ON c.id = l.collaboration_id WHERE l.id = ?')
    .get<{ id: string; organization_id: string; creator_id: string; public_name: string }>(launchId);
  if (!row) return undefined;
  return { launchId: row.id, title: row.public_name, creatorUser: await creatorUserId(db, row.creator_id), hostUsers: await orgMemberIds(db, row.organization_id, HOST_MONEY) };
}
