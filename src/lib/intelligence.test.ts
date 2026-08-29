import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveRecipeDisclosureLevel } from './intelligence';
import { CreatorProduct, RecipeAccessGrant, User } from '../types/majal';

// Minimal shims: effectiveRecipeDisclosureLevel only reads role, creatorId,
// product.creatorId and the grant fields, so we cast narrow fixtures.
const user = (role: User['role'], creatorId?: string): User =>
  ({ id: 'u', name: 'n', email: 'e@test', phone: '+96500000000', role, status: 'ACTIVE', creatorId } as User);

const product = (creatorId: string): CreatorProduct => ({ creatorId } as CreatorProduct);

const grant = (level: RecipeAccessGrant['disclosureLevel'], status: RecipeAccessGrant['status'], expiresAt?: string): RecipeAccessGrant =>
  ({ disclosureLevel: level, status, expiresAt } as RecipeAccessGrant);

test('the owning creator always sees L3 of their own product', () => {
  assert.equal(effectiveRecipeDisclosureLevel(user('CREATOR', 'c1'), product('c1'), undefined, 3), 3);
});

test('a non-owner with no grant is capped at their role maximum, never above', () => {
  // HOST_CHEF has VIEW_RECIPE_L1/L2 but not L3; requesting L3 without a grant → 0
  // because grant level gates it (no APPROVED grant present).
  assert.equal(effectiveRecipeDisclosureLevel(user('HOST_CHEF', undefined), product('c1'), undefined, 3), 0);
});

test('disclosure is the literal minimum of requested, role max, and grant level', () => {
  // HOST_OWNER (L1+L2) with an APPROVED L2 grant, requesting L3 → min(3,2,2) = 2.
  const level = effectiveRecipeDisclosureLevel(user('HOST_OWNER'), product('c1'), grant(2, 'APPROVED'), 3);
  assert.equal(level, 2);
});

test('an expired grant contributes zero even when APPROVED', () => {
  const past = new Date(Date.now() - 60_000).toISOString();
  const level = effectiveRecipeDisclosureLevel(user('HOST_OWNER'), product('c1'), grant(2, 'APPROVED', past), 2);
  assert.equal(level, 0);
});

test('a revoked grant is ignored entirely', () => {
  const level = effectiveRecipeDisclosureLevel(user('HOST_OWNER'), product('c1'), grant(3, 'REVOKED'), 2);
  assert.equal(level, 0);
});
