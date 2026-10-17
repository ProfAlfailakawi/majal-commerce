import test from 'node:test';
import assert from 'node:assert/strict';
import { upcomingSeasons } from './adSeasons';

test('seasons are upcoming, ordered, well-formed and start today when already running', () => {
  const list = upcomingSeasons('2026-02-10');
  assert.ok(list.length >= 4);
  for (const s of list) {
    assert.match(s.startsOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(s.endsOn >= s.startsOn, s.key);
    assert.ok(s.endsOn >= '2026-02-10', `${s.key} already over`);
  }
  // Ramadan 1447 begins in mid/late February 2026 (Umm al-Qura: 18–19 Feb).
  const ramadan = list.find(s => s.label === 'رمضان');
  assert.ok(ramadan && ramadan.startsOn >= '2026-02-17' && ramadan.startsOn <= '2026-02-20', JSON.stringify(ramadan));
  const midRamadan = upcomingSeasons('2026-03-01').find(s => s.label === 'رمضان');
  assert.equal(midRamadan?.active, true);
  assert.equal(midRamadan?.startsOn, '2026-03-01');
  assert.deepEqual(list.map(s => s.startsOn), [...list.map(s => s.startsOn)].sort());
});
