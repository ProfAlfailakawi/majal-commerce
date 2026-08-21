import { createHash, randomUUID } from 'node:crypto';
import { MajalDatabase, withTransaction } from './database';

/**
 * Deterministic Replay Ledger
 * ---------------------------
 * A hash-chained, append-only record of every money movement. Each entry commits to
 * the previous entry's hash, so any retroactive edit, deletion, or reordering breaks
 * the chain and is provable by recomputation — turning "audit" from trust into proof.
 *
 * The chain is global and strictly ordered by `seq`. Appends serialize on a single
 * head row: SQLite via BEGIN IMMEDIATE, PostgreSQL via SELECT ... FOR UPDATE. This is
 * why appendLedgerEntry MUST run inside a transaction.
 */

export const GENESIS_HASH = '0'.repeat(64);
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const canonical = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
};

export interface LedgerInput {
  scope: string;                 // e.g. 'PAYMENT', 'SETTLEMENT', 'REFUND'
  entryType: string;             // e.g. 'PAYMENT_CAPTURED', 'SETTLEMENT_PAID'
  entityType: string;            // e.g. 'PAYMENT_INTENT', 'SETTLEMENT_BATCH'
  entityId: string;
  amountFils: number;            // integer fils; sign encodes direction (+in / -out)
  currency?: 'KWD';
  meta?: unknown;                // non-secret context; only its sha256 is stored
  occurredAt?: string;
}

export interface LedgerEntry extends LedgerInput {
  id: string;
  seq: number;
  metaSha256: string;
  prevHash: string;
  entryHash: string;
  currency: 'KWD';
  occurredAt: string;
}

/** Pure, dialect-free hash of a single ledger link. Identical inputs → identical hash. */
export function computeEntryHash(prevHash: string, core: {
  seq: number; scope: string; entryType: string; entityType: string; entityId: string;
  amountFils: number; currency: string; metaSha256: string; occurredAt: string;
}): string {
  return sha256(`${prevHash}|${core.seq}|${canonical(core)}`);
}

/**
 * Appends one entry to the tamper-evident chain. Call inside a transaction so the head
 * lock is held for the read-compute-write cycle. Returns the committed entry.
 */
export async function appendLedgerEntry(tx: MajalDatabase, input: LedgerInput): Promise<LedgerEntry> {
  if (!Number.isSafeInteger(input.amountFils)) throw new Error('LEDGER_AMOUNT_NOT_INTEGER');
  const forUpdate = tx.dialect === 'postgres' ? ' FOR UPDATE' : '';
  const head = await tx.prepare(`SELECT last_seq, last_hash FROM financial_ledger_head WHERE id = 1${forUpdate}`)
    .get<{ last_seq: number | string; last_hash: string }>();
  if (!head) throw new Error('LEDGER_HEAD_MISSING');

  const seq = Number(head.last_seq) + 1;
  const prevHash = head.last_hash;
  const currency = input.currency ?? 'KWD';
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const metaSha256 = sha256(canonical(input.meta ?? null));
  const core = { seq, scope: input.scope, entryType: input.entryType, entityType: input.entityType, entityId: input.entityId, amountFils: input.amountFils, currency, metaSha256, occurredAt };
  const entryHash = computeEntryHash(prevHash, core);
  const id = `led_${randomUUID()}`;
  const createdAt = new Date().toISOString();

  await tx.prepare(`INSERT INTO financial_ledger(id, seq, scope, entry_type, entity_type, entity_id, amount_fils, currency, meta_sha256, occurred_at, prev_hash, entry_hash, created_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, seq, input.scope, input.entryType, input.entityType, input.entityId, input.amountFils, currency, metaSha256, occurredAt, prevHash, entryHash, createdAt);
  await tx.prepare('UPDATE financial_ledger_head SET last_seq = ?, last_hash = ?, updated_at = ? WHERE id = 1')
    .run(seq, entryHash, createdAt);

  return { id, seq, prevHash, entryHash, metaSha256, currency, occurredAt, scope: input.scope, entryType: input.entryType, entityType: input.entityType, entityId: input.entityId, amountFils: input.amountFils };
}

/** Convenience wrapper for callers that are not already inside a transaction. */
export async function recordLedgerEntry(db: MajalDatabase, input: LedgerInput): Promise<LedgerEntry> {
  return withTransaction(db, tx => appendLedgerEntry(tx, input));
}

export interface LedgerVerification {
  valid: boolean;
  count: number;
  headHash: string;
  brokenAtSeq: number | null;
  reason: string | null;
}

/**
 * Recomputes the entire chain from genesis and proves integrity. Any tampered amount,
 * reordered row, gap in `seq`, or broken prev-link is reported with the exact seq.
 */
export async function verifyLedgerChain(db: MajalDatabase): Promise<LedgerVerification> {
  const rows = await db.prepare(`SELECT seq, scope, entry_type, entity_type, entity_id, amount_fils, currency, meta_sha256, occurred_at, prev_hash, entry_hash
    FROM financial_ledger ORDER BY seq ASC`).all<{
      seq: number | string; scope: string; entry_type: string; entity_type: string; entity_id: string;
      amount_fils: number | string; currency: string; meta_sha256: string; occurred_at: string; prev_hash: string; entry_hash: string;
    }>();

  let prevHash = GENESIS_HASH;
  let expectedSeq = 1;
  for (const row of rows) {
    const seq = Number(row.seq);
    if (seq !== expectedSeq) return { valid: false, count: rows.length, headHash: prevHash, brokenAtSeq: seq, reason: `NON_CONTIGUOUS_SEQ_EXPECTED_${expectedSeq}` };
    if (row.prev_hash !== prevHash) return { valid: false, count: rows.length, headHash: prevHash, brokenAtSeq: seq, reason: 'PREV_HASH_MISMATCH' };
    const recomputed = computeEntryHash(prevHash, {
      seq, scope: row.scope, entryType: row.entry_type, entityType: row.entity_type, entityId: row.entity_id,
      amountFils: Number(row.amount_fils), currency: row.currency, metaSha256: row.meta_sha256, occurredAt: row.occurred_at
    });
    if (recomputed !== row.entry_hash) return { valid: false, count: rows.length, headHash: prevHash, brokenAtSeq: seq, reason: 'ENTRY_HASH_MISMATCH' };
    prevHash = row.entry_hash;
    expectedSeq += 1;
  }

  const head = await db.prepare('SELECT last_hash FROM financial_ledger_head WHERE id = 1').get<{ last_hash: string }>();
  if (head && head.last_hash !== prevHash) return { valid: false, count: rows.length, headHash: prevHash, brokenAtSeq: null, reason: 'HEAD_HASH_DIVERGED' };
  return { valid: true, count: rows.length, headHash: prevHash, brokenAtSeq: null, reason: null };
}

/** Current committed head of the chain (seq 0 / genesis hash when empty). */
export async function ledgerHead(db: MajalDatabase): Promise<{ seq: number; hash: string }> {
  const head = await db.prepare('SELECT last_seq, last_hash FROM financial_ledger_head WHERE id = 1').get<{ last_seq: number | string; last_hash: string }>();
  return { seq: Number(head?.last_seq ?? 0), hash: head?.last_hash ?? GENESIS_HASH };
}

/** Recomputes the chain hash at a given seq by replaying entries up to it. Detects prefix tampering. */
export async function ledgerHashAtSeq(db: MajalDatabase, targetSeq: number): Promise<string | null> {
  if (targetSeq <= 0) return GENESIS_HASH;
  const rows = await db.prepare(`SELECT seq, scope, entry_type, entity_type, entity_id, amount_fils, currency, meta_sha256, occurred_at
    FROM financial_ledger WHERE seq <= ? ORDER BY seq ASC`).all<{
      seq: number|string; scope: string; entry_type: string; entity_type: string; entity_id: string;
      amount_fils: number|string; currency: string; meta_sha256: string; occurred_at: string;
    }>(targetSeq);
  let prevHash = GENESIS_HASH;
  let expected = 1;
  for (const row of rows) {
    if (Number(row.seq) !== expected) return null;
    prevHash = computeEntryHash(prevHash, { seq: Number(row.seq), scope: row.scope, entryType: row.entry_type, entityType: row.entity_type, entityId: row.entity_id, amountFils: Number(row.amount_fils), currency: row.currency, metaSha256: row.meta_sha256, occurredAt: row.occurred_at });
    expected += 1;
  }
  return expected - 1 === targetSeq ? prevHash : null;
}

/** Non-secret transparency view: every money entry touching one entity, in order. */
export async function ledgerForEntity(db: MajalDatabase, entityType: string, entityId: string) {
  return db.prepare(`SELECT seq, scope, entry_type, entity_type, entity_id, amount_fils, currency, occurred_at, entry_hash, prev_hash
    FROM financial_ledger WHERE entity_type = ? AND entity_id = ? ORDER BY seq ASC LIMIT 500`)
    .all<Record<string, unknown>>(entityType, entityId);
}
