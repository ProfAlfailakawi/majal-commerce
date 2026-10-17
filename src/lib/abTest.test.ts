import assert from 'node:assert/strict';
import test from 'node:test';
import { abVerdict } from './abTest';

test('no verdict before both variants have enough impressions', () => {
  assert.deepEqual(abVerdict({ impressions: 499, clicks: 40 }, { impressions: 2000, clicks: 200 }), { state: 'not_enough_data', needed: 500 });
  assert.equal(abVerdict({ impressions: 2000, clicks: 80 }, { impressions: 10, clicks: 9 }).state, 'not_enough_data');
});

test('a clear difference names the winner and its lift', () => {
  const v = abVerdict({ impressions: 1000, clicks: 40 }, { impressions: 1000, clicks: 70 });
  assert.equal(v.state, 'winner');
  if (v.state === 'winner') { assert.equal(v.winner, 'B'); assert.equal(v.liftPercent, 75); assert.ok(v.zScore > 2.9 && v.zScore < 3); }
  const flipped = abVerdict({ impressions: 1000, clicks: 70 }, { impressions: 1000, clicks: 40 });
  assert.equal(flipped.state === 'winner' && flipped.winner, 'A');
});

test('a small difference is not called a winner; degenerate data is safe', () => {
  assert.equal(abVerdict({ impressions: 1000, clicks: 50 }, { impressions: 1000, clicks: 55 }).state, 'no_difference');
  assert.deepEqual(abVerdict({ impressions: 800, clicks: 0 }, { impressions: 800, clicks: 0 }), { state: 'no_difference', zScore: 0 });
  assert.deepEqual(abVerdict({ impressions: 800, clicks: 800 }, { impressions: 800, clicks: 800 }), { state: 'no_difference', zScore: 0 });
});
