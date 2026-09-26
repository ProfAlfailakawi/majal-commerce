import assert from 'node:assert/strict';
import test from 'node:test';
import { firebaseMirrorStatus, isFirebaseMirrorEnabled, mirrorDoc } from './firebase-mirror';

/**
 * The Firestore mirror must FAIL CLOSED: with no service-account credentials configured it is
 * a safe no-op, and a mirror call must never throw (so it can't break the authoritative path).
 */
test('firebase mirror is disabled and inert without credentials', async () => {
  delete process.env.FIREBASE_PROJECT_ID;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

  // Must not throw even though nothing is configured.
  await mirrorDoc('orders', 'ord_test', { id: 'ord_test', consumerId: 'u1' });

  assert.equal(isFirebaseMirrorEnabled(), false);
  const status = firebaseMirrorStatus();
  assert.equal(status.enabled, false);
  assert.equal(status.reason, 'FIREBASE_MIRROR_UNCONFIGURED');
});

test('public collections are mirrored as an allow-listed projection only', async () => {
  const { publicProjection } = await import('./firebase-mirror');
  const product = publicProjection('products', {
    id: 'p1', creatorId: 'c1', title: 'مجبوس', status: 'LIVE', priceKwd: 3.5,
    recipeVault: 'secret', costPerUnitKwd: 1.2, marginPct: 40, hostShareKwd: 0.4
  });
  assert.deepEqual(Object.keys(product).sort(), ['creatorId', 'id', 'priceKwd', 'status', 'title']);
  const creator = publicProjection('creators', { id: 'c1', displayName: 'نورة', phone: '+96590000000', iban: 'KW00', userId: 'u1' });
  assert.deepEqual(Object.keys(creator).sort(), ['displayName', 'id']);
  // Private collections are not projected (their rules already restrict reads).
  assert.equal(publicProjection('orders', { id: 'o1', consumerId: 'u' }).consumerId, 'u');
});

test('role claim sync sets the rules claim and clears it for suspended accounts', async () => {
  const { syncRoleClaim, __setClaimSetterForTests } = await import('./firebase-mirror');
  assert.equal(await syncRoleClaim('u1', 'ADMIN'), false, 'no-op when unconfigured');
  const calls: Array<[string, unknown]> = [];
  __setClaimSetterForTests(async (uid, claims) => { calls.push([uid, claims]); });
  try {
    assert.equal(await syncRoleClaim('u1', 'ADMIN'), true);
    await syncRoleClaim('u2', 'ADMIN', 'SUSPENDED');
    assert.deepEqual(calls, [['u1', { role: 'ADMIN' }], ['u2', { role: null }]]);
    __setClaimSetterForTests(async () => { throw new Error('boom'); });
    assert.equal(await syncRoleClaim('u3', 'ADMIN'), false, 'never throws');
  } finally { __setClaimSetterForTests(null); }
});
