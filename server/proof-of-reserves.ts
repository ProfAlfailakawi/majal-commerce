import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { MajalDatabase } from './database';
import { buildMerkleTree, merkleProof, verifyMerkleProof } from './merkle';
import { ledgerHead } from './ledger';

/**
 * Proof-of-Reserves
 * -----------------
 * Publishes a Merkle commitment over every creator's outstanding liability, plus the
 * reserve implied by the ledger (captured − settled). Each creator can prove their own
 * amount is included under the published root WITHOUT seeing anyone else's figures. Turns
 * "trust our books" into a cryptographic inclusion proof, and flags insolvency loudly.
 */

const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex');
const leafData = (creatorId: string, amountFils: number, salt: string) => Buffer.from(`${creatorId}:${amountFils}:${salt}`, 'utf8');

export interface ReserveAttestation {
  id: string;
  merkleRoot: string;
  totalLiabilitiesFils: number;
  reserveFils: number;
  solvent: boolean;
  leafCount: number;
  ledgerHeadHash: string;
  createdAt: string;
}

/** Per-creator outstanding liability = accruals not yet paid out. */
export async function gatherLiabilities(db: MajalDatabase): Promise<{ creatorId: string; amountFils: number }[]> {
  const rows = await db.prepare(`SELECT creator_id, COALESCE(SUM(amount_fils),0) AS amount
    FROM accruals WHERE status IN ('PENDING','ELIGIBLE','LOCKED') GROUP BY creator_id HAVING SUM(amount_fils) > 0 ORDER BY creator_id ASC`)
    .all<{ creator_id: string; amount: number|string }>();
  return rows.map(r => ({ creatorId: r.creator_id, amountFils: Number(r.amount) }));
}

/** Reserve = money captured into the platform minus what has already been settled out. */
export async function computeReserve(db: MajalDatabase): Promise<number> {
  const captured = await db.prepare("SELECT COALESCE(SUM(amount_fils),0) AS v FROM financial_ledger WHERE entry_type = 'PAYMENT_CAPTURED'").get<{ v: number|string }>();
  const settled = await db.prepare("SELECT COALESCE(SUM(-amount_fils),0) AS v FROM financial_ledger WHERE entry_type = 'SETTLEMENT_PAID'").get<{ v: number|string }>();
  const refunded = await db.prepare("SELECT COALESCE(SUM(-amount_fils),0) AS v FROM financial_ledger WHERE entry_type = 'PAYMENT_REFUNDED'").get<{ v: number|string }>();
  return Number(captured?.v || 0) - Number(settled?.v || 0) - Number(refunded?.v || 0);
}

/** Builds and persists a reserve attestation. Leaf preimages are stored for per-creator proofs. */
export async function buildReserveAttestation(db: MajalDatabase, createdByUserId: string): Promise<ReserveAttestation> {
  const liabilities = await gatherLiabilities(db);
  const reserveFils = await computeReserve(db);
  const head = await ledgerHead(db);
  const totalLiabilitiesFils = liabilities.reduce((sum, l) => sum + l.amountFils, 0);
  const leaves = liabilities.map(l => ({ ...l, salt: randomBytes(16).toString('base64url') }));
  const tree = buildMerkleTree(leaves.map(l => leafData(l.creatorId, l.amountFils, l.salt)));
  const id = `res_${randomUUID()}`;
  const createdAt = new Date().toISOString();
  const solvent = reserveFils >= totalLiabilitiesFils;

  await db.transaction(async tx => {
    await tx.prepare(`INSERT INTO reserve_attestations(id, merkle_root, total_liabilities_fils, reserve_fils, solvent, leaf_count, ledger_head_hash, created_by_user_id, created_at)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, tree.root, totalLiabilitiesFils, reserveFils, solvent ? 1 : 0, leaves.length, head.hash, createdByUserId, createdAt);
    for (let i = 0; i < leaves.length; i += 1) {
      const l = leaves[i];
      await tx.prepare('INSERT INTO reserve_attestation_leaves(attestation_id, position, creator_id, amount_fils, salt, leaf_hash) VALUES(?, ?, ?, ?, ?, ?)')
        .run(id, i, l.creatorId, l.amountFils, l.salt, sha256Hex(leafData(l.creatorId, l.amountFils, l.salt).toString('utf8')));
    }
  });

  return { id, merkleRoot: tree.root, totalLiabilitiesFils, reserveFils, solvent, leafCount: leaves.length, ledgerHeadHash: head.hash, createdAt };
}

export interface ReserveInclusionProof {
  attestationId: string;
  merkleRoot: string;
  creatorId: string;
  amountFils: number;
  salt: string;
  proof: ReturnType<typeof merkleProof>;
  verified: boolean;
}

/** Returns a creator's own inclusion proof under the published root. Others' amounts stay hidden. */
export async function reserveProofForCreator(db: MajalDatabase, attestationId: string, creatorId: string): Promise<ReserveInclusionProof | undefined> {
  const attestation = await db.prepare('SELECT merkle_root FROM reserve_attestations WHERE id = ?').get<{ merkle_root: string }>(attestationId);
  if (!attestation) return undefined;
  const leaves = await db.prepare('SELECT position, creator_id, amount_fils, salt FROM reserve_attestation_leaves WHERE attestation_id = ? ORDER BY position ASC')
    .all<{ position: number|string; creator_id: string; amount_fils: number|string; salt: string }>(attestationId);
  const mine = leaves.find(l => l.creator_id === creatorId);
  if (!mine) return undefined;
  const tree = buildMerkleTree(leaves.map(l => leafData(l.creator_id, Number(l.amount_fils), l.salt)));
  const proof = merkleProof(tree, Number(mine.position));
  const data = leafData(creatorId, Number(mine.amount_fils), mine.salt);
  return { attestationId, merkleRoot: attestation.merkle_root, creatorId, amountFils: Number(mine.amount_fils), salt: mine.salt, proof, verified: verifyMerkleProof(data, proof, attestation.merkle_root) };
}

/** Stateless verification a counterparty can run with only the public root + their leaf + path. */
export function verifyReserveInclusion(creatorId: string, amountFils: number, salt: string, proof: ReturnType<typeof merkleProof>, merkleRoot: string): boolean {
  return verifyMerkleProof(leafData(creatorId, amountFils, salt), proof, merkleRoot);
}
