import { createHmac, randomUUID } from 'node:crypto';
import { MajalDatabase } from './database';
import { ledgerHashAtSeq, ledgerHead } from './ledger';

/**
 * Tamper-Evident Time
 * -------------------
 * Periodically binds the ledger head (seq + hash) to a timestamp source. With an external
 * RFC 3161 Time-Stamp Authority configured, the anchor is independently verifiable and even
 * a database administrator cannot backdate history. Without a TSA, a clearly-labelled
 * LOCAL_UNVERIFIED anchor still detects retroactive edits of the ledger PREFIX (by hash
 * recomputation) — it just cannot prove the wall-clock time.
 */

export interface TimeAnchor {
  id: string;
  ledgerSeq: number;
  headHash: string;
  source: 'RFC3161_TSA' | 'LOCAL_UNVERIFIED';
  token: string;
  createdAt: string;
}

async function fetchRfc3161Token(headHash: string): Promise<string | null> {
  const url = process.env.TSA_URL?.trim();
  if (!url) return null;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/timestamp-query' },
      body: Buffer.from(headHash, 'hex'),
      signal: AbortSignal.timeout(8_000)
    });
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer()).toString('base64');
  } catch {
    return null;
  }
}

/** Creates an anchor over the current ledger head. Uses the TSA when configured, else local. */
export async function createTimeAnchor(db: MajalDatabase): Promise<TimeAnchor> {
  const head = await ledgerHead(db);
  const createdAt = new Date().toISOString();
  const tsaToken = await fetchRfc3161Token(head.hash);
  const source: TimeAnchor['source'] = tsaToken ? 'RFC3161_TSA' : 'LOCAL_UNVERIFIED';
  // The local token is a keyed digest over (seq, hash, time) — evidence of "seen by this
  // instance", explicitly NOT a trusted external timestamp.
  const localSecret = process.env.LEDGER_ANCHOR_SECRET?.trim() || 'majal-local-anchor';
  const token = tsaToken ?? createHmac('sha256', localSecret).update(`${head.seq}|${head.hash}|${createdAt}`).digest('base64');
  const id = `anc_${randomUUID()}`;
  await db.prepare('INSERT INTO ledger_time_anchors(id, ledger_seq, head_hash, source, token, created_at) VALUES(?, ?, ?, ?, ?, ?)')
    .run(id, head.seq, head.hash, source, token, createdAt);
  return { id, ledgerSeq: head.seq, headHash: head.hash, source, token, createdAt };
}

export interface AnchorVerification {
  checked: number;
  valid: boolean;
  firstBrokenSeq: number | null;
  reason: string | null;
}

/**
 * Recomputes the ledger hash at every anchored seq and confirms it still matches. A mismatch
 * proves the ledger prefix up to that anchor was rewritten after it was anchored.
 */
export async function verifyTimeAnchors(db: MajalDatabase): Promise<AnchorVerification> {
  const anchors = await db.prepare('SELECT ledger_seq, head_hash FROM ledger_time_anchors ORDER BY ledger_seq ASC')
    .all<{ ledger_seq: number|string; head_hash: string }>();
  for (const anchor of anchors) {
    const seq = Number(anchor.ledger_seq);
    const recomputed = await ledgerHashAtSeq(db, seq);
    if (recomputed === null) return { checked: anchors.length, valid: false, firstBrokenSeq: seq, reason: 'LEDGER_PREFIX_UNRECONSTRUCTABLE' };
    if (recomputed !== anchor.head_hash) return { checked: anchors.length, valid: false, firstBrokenSeq: seq, reason: 'ANCHOR_HASH_DIVERGED' };
  }
  return { checked: anchors.length, valid: true, firstBrokenSeq: null, reason: null };
}
