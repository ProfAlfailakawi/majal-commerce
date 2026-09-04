import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTrustProxyHops } from './observability';

// resolveTrustProxyHops emits structured warnings for invalid/insecure settings; silence them
// so the test output stays readable.
function withSilencedLogs<T>(run: () => T): T {
  const originalLog = console.log;
  console.log = () => {};
  try {
    return run();
  } finally {
    console.log = originalLog;
  }
}

test('SECURITY regression: trust proxy hops default to 1 in production so req.ip is the real client', () => {
  withSilencedLogs(() => {
    // The old default of 0 made every request behind Cloud Run share one rate-limit bucket.
    assert.equal(resolveTrustProxyHops(undefined, true), 1);
    assert.equal(resolveTrustProxyHops('', true), 1);
    assert.equal(resolveTrustProxyHops('   ', true), 1);

    // A direct local run has no proxy in front of it.
    assert.equal(resolveTrustProxyHops(undefined, false), 0);

    // Explicit values are honoured within the safe range.
    assert.equal(resolveTrustProxyHops('2', true), 2);
    assert.equal(resolveTrustProxyHops(' 3 ', false), 3);
    assert.equal(resolveTrustProxyHops('0', true), 0);

    // Anything invalid or out of range falls back to the default instead of being coerced —
    // trusting more hops than really exist would let a client forge X-Forwarded-For.
    assert.equal(resolveTrustProxyHops('99', true), 1);
    assert.equal(resolveTrustProxyHops('-1', true), 1);
    assert.equal(resolveTrustProxyHops('1.5', true), 1);
    assert.equal(resolveTrustProxyHops('abc', true), 1);
    assert.equal(resolveTrustProxyHops('abc', false), 0);
  });
});
