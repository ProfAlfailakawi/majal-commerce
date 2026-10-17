import assert from 'node:assert/strict';
import test from 'node:test';
import { clockOffsetMs, countdownLabelAr, countdownParts } from './countdown';

test('parts split a duration and never go negative', () => {
  assert.deepEqual(countdownParts(2 * 86_400_000 + 3 * 3_600_000 + 4 * 60_000 + 5_000), { days: 2, hours: 3, minutes: 4, seconds: 5, done: false });
  assert.deepEqual(countdownParts(999), { days: 0, hours: 0, minutes: 0, seconds: 0, done: true }, 'under a second counts as open');
  assert.equal(countdownParts(-5_000).done, true);
  assert.equal(countdownParts(Number.NaN).done, true);
});

test('the offset corrects a wrong device clock and is zero without a server time', () => {
  const device = 1_000_000;
  assert.equal(clockOffsetMs(new Date(device + 90_000).toISOString(), device), 90_000, 'device is 90s behind');
  assert.equal(clockOffsetMs(new Date(device - 30_000).toISOString(), device), -30_000, 'device is 30s ahead');
  assert.equal(clockOffsetMs(undefined, device), 0);
  assert.equal(clockOffsetMs('garbage', device), 0);
});

test('the spoken label agrees in number and drops minutes once days remain', () => {
  assert.equal(countdownLabelAr(countdownParts(86_400_000 + 2 * 3_600_000)), 'يفتح بعد يوم وساعتان');
  assert.equal(countdownLabelAr(countdownParts(3 * 86_400_000 + 5 * 3_600_000 + 20 * 60_000)), 'يفتح بعد 3 أيام و5 ساعات');
  assert.equal(countdownLabelAr(countdownParts(45 * 60_000)), 'يفتح بعد 45 دقيقة');
  assert.equal(countdownLabelAr(countdownParts(5 * 60_000)), 'يفتح بعد 5 دقائق');
  assert.equal(countdownLabelAr(countdownParts(0)), 'فُتح الإطلاق الآن');
});
