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
