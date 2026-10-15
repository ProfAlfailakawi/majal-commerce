import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { countUpValue, drawKey, easeOutToken, markDrawn, shouldArm } from './drawIn';
import { alreadyPlayed, resetPlayedForTests } from './journeyReveal';

const env = { reducedMotion: false, canObserve: true };

beforeEach(() => resetPlayedForTests());

test('draw arms only when enabled, observable and motion is allowed', () => {
  assert.equal(shouldArm({ enabled: true, playKey: 'a', ...env }), true);
  assert.equal(shouldArm({ enabled: false, playKey: 'a', ...env }), false);
  assert.equal(shouldArm({ enabled: true, playKey: 'a', ...env, canObserve: false }), false);
  assert.equal(shouldArm({ enabled: true, playKey: 'a', ...env, reducedMotion: true }), false);
});

test('a key plays once per session and never collides with a stepper key', () => {
  assert.equal(shouldArm({ enabled: true, playKey: 'k', ...env }), true);
  markDrawn('k', false);
  assert.equal(shouldArm({ enabled: true, playKey: 'k', ...env }), false);
  assert.equal(drawKey('k'), 'draw:k');
  assert.equal(alreadyPlayed('k'), false);
  assert.equal(shouldArm({ enabled: true, ...env }), true, 'no key: plays on each mount');
});

test('count-up ends exactly on the final value and keeps integers whole', () => {
  assert.equal(countUpValue(120, 0, 700), 0);
  assert.equal(countUpValue(120, 700, 700), 120);
  assert.equal(countUpValue(120, 5000, 700), 120);
  const mid = countUpValue(120, 200, 700);
  assert.ok(Number.isInteger(mid) && mid > 0 && mid < 120);
  assert.equal(countUpValue(120, 100, 0), 120);
  assert.ok(Number.isNaN(countUpValue(NaN, 100, 700)));
});

test('ease-out token curve is monotonic and front-loaded', () => {
  let prev = 0;
  for (let i = 1; i <= 20; i += 1) {
    const v = easeOutToken(i / 20);
    assert.ok(v >= prev);
    prev = v;
  }
  assert.ok(easeOutToken(0.2) > 0.6);
  assert.equal(easeOutToken(1), 1);
});
