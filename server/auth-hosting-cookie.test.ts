import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthConfig } from './auth';

// Firebase Hosting forwards only `__session` to Cloud Run. If production auth is moved to any
// other cookie name, logins through majal.web.app silently stop working.
test('production session cookie is the one Firebase Hosting forwards', () => {
  const previous = { s: process.env.AUTH_SESSION_SECRET, e: process.env.AUTH_ENCRYPTION_KEY };
  process.env.AUTH_SESSION_SECRET = 'x'.repeat(40);
  process.env.AUTH_ENCRYPTION_KEY = 'y'.repeat(40);
  try {
    assert.equal(createAuthConfig(true).cookieName, '__session');
    assert.equal(createAuthConfig(false).cookieName, 'majal_session');
  } finally {
    if (previous.s === undefined) delete process.env.AUTH_SESSION_SECRET; else process.env.AUTH_SESSION_SECRET = previous.s;
    if (previous.e === undefined) delete process.env.AUTH_ENCRYPTION_KEY; else process.env.AUTH_ENCRYPTION_KEY = previous.e;
  }
});
