import assert from 'node:assert/strict';
import test from 'node:test';
import { reportError, resolveTrustProxyHops } from './observability';

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

test('reportError emits a Cloud Error Reporting entry with the stack, never secrets', () => {
  const lines: string[] = [];
  const original = console.log;
  console.log = (line: string) => { lines.push(line); };
  try {
    reportError('request_failed', new TypeError('boom'), { path: '/api/x', sessionToken: 'must-not-appear' });
  } finally {
    console.log = original;
  }
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.severity, 'ERROR');
  assert.equal(entry['@type'], 'type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent');
  assert.match(entry.message, /^TypeError: boom\n\s+at /);
  assert.equal(entry.serviceContext.service, 'majal');
  assert.equal(entry.path, '/api/x');
  assert.equal('sessionToken' in entry, false);
});
