import { createHash } from 'node:crypto';

/**
 * Binary Merkle tree with domain-separated hashing.
 * Leaf and internal nodes use distinct prefixes to prevent second-preimage attacks.
 * Odd nodes at a level are promoted (hashed with themselves) so the tree stays balanced.
 */

const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest();
const hashLeaf = (data: Buffer) => sha256(Buffer.concat([Buffer.from([0x00]), data]));
const hashNode = (left: Buffer, right: Buffer) => sha256(Buffer.concat([Buffer.from([0x01]), left, right]));

export interface MerkleTree {
  root: string;                 // hex
  layers: Buffer[][];           // layers[0] = leaves, last = [root]
  leafCount: number;
}

export function buildMerkleTree(leaves: Buffer[]): MerkleTree {
  if (leaves.length === 0) {
    const empty = sha256(Buffer.from('MAJAL_EMPTY_MERKLE'));
    return { root: empty.toString('hex'), layers: [[empty]], leafCount: 0 };
  }
  const base = leaves.map(hashLeaf);
  const layers: Buffer[][] = [base];
  let current = base;
  while (current.length > 1) {
    const next: Buffer[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i];
      const right = i + 1 < current.length ? current[i + 1] : current[i]; // promote odd node
      next.push(hashNode(left, right));
    }
    layers.push(next);
    current = next;
  }
  return { root: layers[layers.length - 1][0].toString('hex'), layers, leafCount: leaves.length };
}

export interface MerkleProofStep { hash: string; position: 'left' | 'right'; }

/** Sibling path from a leaf position up to the root. */
export function merkleProof(tree: MerkleTree, leafIndex: number): MerkleProofStep[] {
  if (leafIndex < 0 || leafIndex >= tree.leafCount) throw new Error('MERKLE_INDEX_OUT_OF_RANGE');
  const proof: MerkleProofStep[] = [];
  let index = leafIndex;
  for (let level = 0; level < tree.layers.length - 1; level += 1) {
    const layer = tree.layers[level];
    const isRight = index % 2 === 1;
    const siblingIndex = isRight ? index - 1 : (index + 1 < layer.length ? index + 1 : index);
    proof.push({ hash: layer[siblingIndex].toString('hex'), position: isRight ? 'left' : 'right' });
    index = Math.floor(index / 2);
  }
  return proof;
}

/** Recomputes the root from a leaf preimage + sibling path; compares to the expected root. */
export function verifyMerkleProof(leafData: Buffer, proof: MerkleProofStep[], expectedRoot: string): boolean {
  let acc = hashLeaf(leafData);
  for (const step of proof) {
    const sibling = Buffer.from(step.hash, 'hex');
    acc = step.position === 'left' ? hashNode(sibling, acc) : hashNode(acc, sibling);
  }
  return acc.toString('hex') === expectedRoot;
}
