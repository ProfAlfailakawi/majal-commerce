import assert from 'node:assert/strict';
import test from 'node:test';
import { ACTIVE_WINDOW_MS, IDLE_MS, isActive, nextDelayMs, noteActivity } from './idle-aware';

test('busy: the normal cadence; quiet: sleeps long so the database can suspend', () => {
  assert.equal(nextDelayMs({ active: true, activeMs: 5_000 }), 5_000);
  assert.equal(nextDelayMs({ active: false, activeMs: 5_000 }), IDLE_MS);
});

test('a scheduled launch wakes the loop on time even while quiet, never faster than 5s', () => {
  assert.equal(nextDelayMs({ active: false, activeMs: 60_000, wakeInMs: 90_000 }), 90_000);
  assert.equal(nextDelayMs({ active: false, activeMs: 60_000, wakeInMs: 0 }), 5_000);
  assert.equal(nextDelayMs({ active: false, activeMs: 60_000, wakeInMs: 3 * IDLE_MS }), IDLE_MS);
});

test('real visitors make it active, then it relaxes after the window', () => {
  const now = Date.now();
  noteActivity(now);
  assert.equal(isActive(now + 1_000), true);
  assert.equal(isActive(now + ACTIVE_WINDOW_MS + 1), false);
});
