import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { MajalDatabase } from './database';
import { Share, combine, decodeShare, encodeShare, split } from './shamir';

/**
 * Threshold Recipe Escrow
 * -----------------------
 * Seals a recipe under a random data key, then splits that key k-of-n across independent
 * holders (e.g. creator + platform + neutral party) via Shamir Secret Sharing. The whole
 * key is NEVER persisted — only per-holder share commitments (hashes). Revealing requires
 * presenting at least `threshold` valid shares, so no single party (the platform included)
 * can decrypt the recipe alone; compromising fewer than `threshold` holders yields nothing.
 */

const sha256 = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');

export interface Holder { ref: string; }
export interface IssuedShare { holderRef: string; shareIndex: number; share: string; }

export interface CreateThresholdEscrowInput {
  productId: string;
  recipeVersionId: string;
  holders: Holder[];
  threshold: number;
  recipe: unknown;
  createdByUserId: string;
}

/** Seals the recipe and returns each holder's share EXACTLY once (never stored server-side). */
export async function createThresholdEscrow(db: MajalDatabase, input: CreateThresholdEscrowInput) {
  const n = input.holders.length;
  if (!Number.isInteger(input.threshold) || input.threshold < 2 || n < input.threshold || n > 255) {
    throw Object.assign(new Error('THRESHOLD_INVALID_PARAMS'), { status: 400 });
  }
  const id = `tesc_${randomUUID()}`;
  const dataKey = randomBytes(32);                       // AES-256 key, split and then discarded
  const iv = randomBytes(12);
  const aad = Buffer.from(`${id}|${input.recipeVersionId}`);
  const cipher = createCipheriv('aes-256-gcm', dataKey, iv);
  cipher.setAAD(aad);
  const plaintext = Buffer.from(JSON.stringify(input.recipe), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  const shares = split(dataKey, n, input.threshold);
  dataKey.fill(0);                                       // best-effort wipe of the whole key
  const now = new Date().toISOString();

  const issued: IssuedShare[] = [];
  await db.transaction(async tx => {
    await tx.prepare(`INSERT INTO threshold_escrows(id, product_id, recipe_version_id, ciphertext, iv, tag, aad, threshold, holder_count, status, created_by_user_id, created_at, updated_at)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 'SEALED', ?, ?, ?)`)
      .run(id, input.productId, input.recipeVersionId, ciphertext.toString('base64'), iv.toString('base64url'), tag.toString('base64url'), aad.toString('base64url'), input.threshold, n, input.createdByUserId, now, now);
    for (let i = 0; i < shares.length; i += 1) {
      const encoded = encodeShare(shares[i]);
      await tx.prepare('INSERT INTO threshold_escrow_shares(escrow_id, share_index, holder_ref, share_commitment_sha256, created_at) VALUES(?, ?, ?, ?, ?)')
        .run(id, shares[i].x, input.holders[i].ref, sha256(encoded), now);
      issued.push({ holderRef: input.holders[i].ref, shareIndex: shares[i].x, share: encoded });
    }
  });

  return { id, status: 'SEALED' as const, threshold: input.threshold, holderCount: n, shares: issued };
}

export interface RevealResult { recipe: unknown; usedShareIndexes: number[]; }

/**
 * Reveals the recipe if at least `threshold` presented shares match stored commitments.
 * Fewer valid shares → refused. Wrong/forged share → commitment mismatch → refused.
 */
export async function revealThresholdEscrow(db: MajalDatabase, escrowId: string, presentedShares: string[]): Promise<RevealResult> {
  const escrow = await db.prepare('SELECT * FROM threshold_escrows WHERE id = ?').get<Record<string, unknown>>(escrowId);
  if (!escrow) throw Object.assign(new Error('THRESHOLD_ESCROW_NOT_FOUND'), { status: 404 });
  if (escrow.status === 'REVOKED') throw Object.assign(new Error('THRESHOLD_ESCROW_REVOKED'), { status: 409 });
  const commitments = await db.prepare('SELECT share_index, share_commitment_sha256 FROM threshold_escrow_shares WHERE escrow_id = ?')
    .all<{ share_index: number | string; share_commitment_sha256: string }>(escrowId);
  const commitmentByIndex = new Map(commitments.map(c => [Number(c.share_index), c.share_commitment_sha256]));

  // Keep only shares that structurally decode AND match their stored commitment; de-dup by index.
  const validByIndex = new Map<number, Share>();
  for (const presented of presentedShares) {
    let share: Share;
    try { share = decodeShare(presented); } catch { continue; }
    const expected = commitmentByIndex.get(share.x);
    if (!expected || sha256(presented) !== expected) continue;
    validByIndex.set(share.x, share);
  }

  const threshold = Number(escrow.threshold);
  if (validByIndex.size < threshold) throw Object.assign(new Error('THRESHOLD_INSUFFICIENT_SHARES'), { status: 403, have: validByIndex.size, need: threshold });

  const dataKey = combine([...validByIndex.values()].slice(0, threshold));
  try {
    const decipher = createDecipheriv('aes-256-gcm', dataKey, Buffer.from(String(escrow.iv), 'base64url'));
    decipher.setAAD(Buffer.from(String(escrow.aad), 'base64url'));
    decipher.setAuthTag(Buffer.from(String(escrow.tag), 'base64url'));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(String(escrow.ciphertext), 'base64')), decipher.final()]);
    return { recipe: JSON.parse(plaintext.toString('utf8')), usedShareIndexes: [...validByIndex.keys()].slice(0, threshold) };
  } catch {
    // GCM tag failure means the reconstructed key was wrong — treated as an authorization failure.
    throw Object.assign(new Error('THRESHOLD_RECONSTRUCTION_FAILED'), { status: 403 });
  } finally {
    dataKey.fill(0);
  }
}

export async function revokeThresholdEscrow(db: MajalDatabase, escrowId: string) {
  const now = new Date().toISOString();
  const result = await db.prepare("UPDATE threshold_escrows SET status = 'REVOKED', updated_at = ? WHERE id = ? AND status <> 'REVOKED'").run(now, escrowId);
  return { id: escrowId, status: 'REVOKED' as const, changed: result.changes > 0 };
}
