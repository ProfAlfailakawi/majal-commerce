import assert from 'node:assert/strict';
import test from 'node:test';
import { clockLabel, refreshDue } from './autoRefresh';

test('a refresh is due after a full interval and never while the tab is hidden', () => {
  assert.equal(refreshDue(0, 59_999, false), false);
  assert.equal(refreshDue(0, 60_000, false), true);
  assert.equal(refreshDue(0, 600_000, true), false, 'hidden tabs do not poll');
  assert.equal(refreshDue(1000, 31_000, false, 30_000), true, 'custom interval');
});

test('the last-updated label is Kuwait time in Latin digits', () => {
  assert.equal(clockLabel(new Date('2026-10-18T11:05:09Z')), '14:05:09');
  assert.match(clockLabel(new Date()), /^[0-9]{2}:[0-9]{2}:[0-9]{2}$/);
});
