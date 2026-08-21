import { randomUUID } from 'node:crypto';
import { MajalDatabase, withTransaction } from './database';

/**
 * Trust Kill Switch
 * -----------------
 * High-privilege breach containment. Each switch freezes one blast surface or performs
 * one bounded revocation. It NEVER destroys business data: it revokes access, freezes
 * flows, and invalidates sessions/temporary grants — all of which are recoverable
 * (re-login, re-grant, release the freeze). Every action is written to an append-only
 * audit table. Engaging requires SUPER_ADMIN plus a second confirmation secret, enforced
 * at the router layer.
 */

export const KILL_SWITCHES = ['RECIPE_REVEALS', 'SETTLEMENTS', 'WEBHOOKS', 'TEMP_GRANTS', 'SESSIONS'] as const;
export type KillSwitchName = (typeof KILL_SWITCHES)[number];

const now = () => new Date().toISOString();

/** Freeze surfaces (RECIPE_REVEALS/SETTLEMENTS/WEBHOOKS) can be released; action switches cannot un-happen. */
const FREEZE_SWITCHES: KillSwitchName[] = ['RECIPE_REVEALS', 'SETTLEMENTS', 'WEBHOOKS'];

export async function isKillSwitchEngaged(db: MajalDatabase, name: KillSwitchName): Promise<boolean> {
  const row = await db.prepare('SELECT state FROM security_kill_switches WHERE name = ?').get<{ state: string }>(name);
  return row?.state === 'ENGAGED';
}

/** Throws a 503 domain-style error when the named surface is frozen. Used by guarded routes. */
export async function assertKillSwitchClear(db: MajalDatabase, name: KillSwitchName) {
  if (await isKillSwitchEngaged(db, name)) throw Object.assign(new Error(`KILL_SWITCH_ENGAGED_${name}`), { status: 503 });
}

export interface KillSwitchResult {
  name: KillSwitchName;
  state: 'ENGAGED' | 'CLEAR';
  affectedCount: number;
  reversible: boolean;
}

export async function engageKillSwitch(db: MajalDatabase, name: KillSwitchName, actorUserId: string, reason: string, requestId: string): Promise<KillSwitchResult> {
  return withTransaction(db, async tx => {
    const stamp = now();
    await tx.prepare("UPDATE security_kill_switches SET state = 'ENGAGED', reason = ?, actor_user_id = ?, engaged_at = ?, released_at = NULL, updated_at = ? WHERE name = ?")
      .run(reason, actorUserId, stamp, stamp, name);

    // Bounded, recoverable side effects — never a DELETE of business records.
    let affected = 0;
    if (name === 'SESSIONS') {
      affected = (await tx.prepare('DELETE FROM sessions').run()).changes; // users simply re-authenticate
    } else if (name === 'TEMP_GRANTS') {
      const grants = await tx.prepare("UPDATE secret_exposure_grants SET status = 'REVOKED', closed_at = ?, updated_at = ? WHERE status = 'ACTIVE'").run(stamp, stamp);
      const access = await tx.prepare("UPDATE recipe_access_grants SET status = 'REVOKED', updated_at = ? WHERE status IN ('REQUESTED', 'APPROVED')").run(stamp);
      affected = grants.changes + access.changes;
    }

    await tx.prepare('INSERT INTO security_kill_switch_events(id, name, action, actor_user_id, reason, affected_count, request_id, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)')
      .run(`kse_${randomUUID()}`, name, 'ENGAGE', actorUserId, reason, affected, requestId, stamp);
    return { name, state: 'ENGAGED' as const, affectedCount: affected, reversible: FREEZE_SWITCHES.includes(name) };
  });
}

export async function releaseKillSwitch(db: MajalDatabase, name: KillSwitchName, actorUserId: string, reason: string, requestId: string): Promise<KillSwitchResult> {
  if (!FREEZE_SWITCHES.includes(name)) throw Object.assign(new Error(`KILL_SWITCH_NOT_RELEASABLE_${name}`), { status: 409 });
  return withTransaction(db, async tx => {
    const stamp = now();
    await tx.prepare("UPDATE security_kill_switches SET state = 'CLEAR', released_at = ?, updated_at = ? WHERE name = ?").run(stamp, stamp, name);
    await tx.prepare('INSERT INTO security_kill_switch_events(id, name, action, actor_user_id, reason, affected_count, request_id, created_at) VALUES(?, ?, ?, ?, ?, 0, ?, ?)')
      .run(`kse_${randomUUID()}`, name, 'RELEASE', actorUserId, reason, requestId, stamp);
    return { name, state: 'CLEAR' as const, affectedCount: 0, reversible: true };
  });
}

export interface KillSwitchStatusRow {
  name: KillSwitchName;
  state: 'CLEAR' | 'ENGAGED';
  reason: string | null;
  engagedAt: string | null;
  releasedAt: string | null;
  reversible: boolean;
}

export async function killSwitchStatus(db: MajalDatabase): Promise<KillSwitchStatusRow[]> {
  const rows = await db.prepare('SELECT name, state, reason, engaged_at, released_at FROM security_kill_switches ORDER BY name')
    .all<{ name: string; state: string; reason: string | null; engaged_at: string | null; released_at: string | null }>();
  return rows.map(r => ({
    name: r.name as KillSwitchName,
    state: r.state as 'CLEAR' | 'ENGAGED',
    reason: r.reason,
    engagedAt: r.engaged_at,
    releasedAt: r.released_at,
    reversible: FREEZE_SWITCHES.includes(r.name as KillSwitchName)
  }));
}
