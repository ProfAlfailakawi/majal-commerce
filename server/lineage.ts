import { randomUUID } from 'node:crypto';
import { MajalDatabase } from './database';

/**
 * Recipe Lineage Graph
 * --------------------
 * A provenance graph over the IMMUTABLE recipe_versions: Origin → Revision → Test batch →
 * Approved variant → Licensed variant → Market launch. It proves who created which
 * version, when, and how versions relate — WITHOUT ever exposing the secret payload.
 * Nodes carry only non-secret metadata (version number, author, commitment hash, sealed
 * flag); the encrypted content never leaves storage.
 */

export const LINEAGE_RELATIONS = ['ORIGIN', 'REVISION', 'TEST_BATCH', 'APPROVED_VARIANT', 'LICENSED_VARIANT', 'MARKET_LAUNCH'] as const;
export type LineageRelation = (typeof LINEAGE_RELATIONS)[number];

export interface LineageNode {
  recipeVersionId: string;
  versionNumber: number;
  createdByUserId: string;
  createdAt: string;
  payloadSha256: string;   // commitment only — proves identity, not content
  sealed: boolean;
}
export interface LineageEdge {
  id: string;
  parentRecipeVersionId: string | null;
  childRecipeVersionId: string;
  relation: LineageRelation;
  note: string;
  createdAt: string;
}

export interface AddEdgeInput {
  productId: string;
  parentRecipeVersionId: string | null;
  childRecipeVersionId: string;
  relation: LineageRelation;
  note: string;
  createdByUserId: string;
}

/** Validates that both endpoints belong to the product, then records one provenance edge. */
export async function addLineageEdge(db: MajalDatabase, input: AddEdgeInput) {
  const child = await db.prepare('SELECT id FROM recipe_versions WHERE id = ? AND product_id = ?').get<{ id: string }>(input.childRecipeVersionId, input.productId);
  if (!child) throw Object.assign(new Error('CHILD_VERSION_NOT_IN_PRODUCT'), { status: 400 });
  if (input.relation === 'ORIGIN') {
    if (input.parentRecipeVersionId !== null) throw Object.assign(new Error('ORIGIN_HAS_NO_PARENT'), { status: 400 });
  } else {
    if (!input.parentRecipeVersionId) throw Object.assign(new Error('PARENT_REQUIRED'), { status: 400 });
    if (input.parentRecipeVersionId === input.childRecipeVersionId) throw Object.assign(new Error('SELF_EDGE_FORBIDDEN'), { status: 400 });
    const parent = await db.prepare('SELECT id FROM recipe_versions WHERE id = ? AND product_id = ?').get<{ id: string }>(input.parentRecipeVersionId, input.productId);
    if (!parent) throw Object.assign(new Error('PARENT_VERSION_NOT_IN_PRODUCT'), { status: 400 });
    if (await createsCycle(db, input.productId, input.parentRecipeVersionId, input.childRecipeVersionId)) {
      throw Object.assign(new Error('LINEAGE_CYCLE_FORBIDDEN'), { status: 409 });
    }
  }
  const id = `lin_${randomUUID()}`;
  const createdAt = new Date().toISOString();
  await db.prepare('INSERT INTO recipe_lineage_edges(id, product_id, parent_recipe_version_id, child_recipe_version_id, relation, note, created_by_user_id, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, input.productId, input.parentRecipeVersionId, input.childRecipeVersionId, input.relation, input.note, input.createdByUserId, createdAt);
  return { id, relation: input.relation, parentRecipeVersionId: input.parentRecipeVersionId, childRecipeVersionId: input.childRecipeVersionId, createdAt };
}

/** Walks ancestors of `parent`; if we reach `child`, adding parent→child would close a loop. */
async function createsCycle(db: MajalDatabase, productId: string, parentId: string, childId: string): Promise<boolean> {
  const edges = await db.prepare('SELECT parent_recipe_version_id, child_recipe_version_id FROM recipe_lineage_edges WHERE product_id = ? AND parent_recipe_version_id IS NOT NULL')
    .all<{ parent_recipe_version_id: string; child_recipe_version_id: string }>(productId);
  const parentsOf = new Map<string, string[]>();
  for (const e of edges) {
    const list = parentsOf.get(e.child_recipe_version_id) ?? [];
    list.push(e.parent_recipe_version_id);
    parentsOf.set(e.child_recipe_version_id, list);
  }
  const stack = [parentId];
  const seen = new Set<string>();
  while (stack.length) {
    const node = stack.pop()!;
    if (node === childId) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const p of parentsOf.get(node) ?? []) stack.push(p);
  }
  return false;
}

/** Builds the non-secret provenance graph for a product. Never returns encrypted payload. */
export async function buildLineageGraph(db: MajalDatabase, productId: string): Promise<{ nodes: LineageNode[]; edges: LineageEdge[] }> {
  const versions = await db.prepare(`SELECT rv.id, rv.version_number, rv.created_by_user_id, rv.created_at, rv.payload_sha256,
      CASE WHEN rs.id IS NULL THEN 0 ELSE 1 END AS sealed
    FROM recipe_versions rv LEFT JOIN recipe_seals rs ON rs.recipe_version_id = rv.id
    WHERE rv.product_id = ? ORDER BY rv.version_number ASC`)
    .all<{ id: string; version_number: number | string; created_by_user_id: string; created_at: string; payload_sha256: string; sealed: number | string }>(productId);
  const edges = await db.prepare('SELECT id, parent_recipe_version_id, child_recipe_version_id, relation, note, created_at FROM recipe_lineage_edges WHERE product_id = ? ORDER BY created_at ASC, id ASC')
    .all<{ id: string; parent_recipe_version_id: string | null; child_recipe_version_id: string; relation: string; note: string; created_at: string }>(productId);

  return {
    nodes: versions.map(v => ({
      recipeVersionId: v.id, versionNumber: Number(v.version_number), createdByUserId: v.created_by_user_id,
      createdAt: v.created_at, payloadSha256: v.payload_sha256, sealed: Number(v.sealed) === 1
    })),
    edges: edges.map(e => ({
      id: e.id, parentRecipeVersionId: e.parent_recipe_version_id, childRecipeVersionId: e.child_recipe_version_id,
      relation: e.relation as LineageRelation, note: e.note, createdAt: e.created_at
    }))
  };
}
