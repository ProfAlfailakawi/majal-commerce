import test from 'node:test';
import assert from 'node:assert/strict';
import { alreadyPlayed, defaultStepMs, markPlayed, resetPlayedForTests, revealTarget, shownState } from './journeyReveal';

test('revealTarget counts up to the last done/current step, tolerating gaps', () => {
  assert.equal(revealTarget([]), 0);
  assert.equal(revealTarget(['pending', 'pending']), 0);
  assert.equal(revealTarget(['done', 'current', 'pending']), 2);
  assert.equal(revealTarget(['done', 'pending', 'done', 'pending']), 3);
  assert.equal(revealTarget(['done', 'done', 'returned']), 2);
  assert.equal(revealTarget(['done', 'blocked']), 1);
});

test('defaultStepMs clamps to 350..750 and caps the total near 4s', () => {
  assert.equal(defaultStepMs(3), 750);
  assert.equal(defaultStepMs(6), 667);
  assert.equal(defaultStepMs(16), 350);
  assert.equal(defaultStepMs(0), 750);
});

test('shownState never lights a station beyond the reveal point or past its real state', () => {
  assert.equal(shownState('done', 0, 0), 'pending');
  assert.equal(shownState('done', 0, 1), 'done');
  assert.equal(shownState('current', 2, 2), 'pending');
  assert.equal(shownState('pending', 0, 5), 'pending');
  assert.equal(shownState('returned', 1, 5), 'returned');
  assert.equal(shownState('blocked', 3, null), 'blocked');
});

test('playKey is remembered so remounts of the same entity do not replay', () => {
  resetPlayedForTests();
  assert.equal(alreadyPlayed('order-1'), false);
  assert.equal(alreadyPlayed(undefined), false);
  markPlayed('order-1');
  assert.equal(alreadyPlayed('order-1'), true);
  assert.equal(alreadyPlayed('order-2'), false);
});

test('collaboration phases: contiguous, complete and honest about unknown position', async () => {
  const { STAGE_ORDER, STAGE_PHASES, phaseStates } = await import('./collaborationPhases');
  assert.deepEqual(STAGE_PHASES.flatMap(p => p.stages), STAGE_ORDER);
  assert.equal(phaseStates('DISPUTED'), null);
  assert.deepEqual(phaseStates('INTEREST'), ['current', 'pending', 'pending', 'pending', 'pending', 'pending']);
  assert.deepEqual(phaseStates('SIGNED'), ['done', 'done', 'done', 'current', 'pending', 'pending']);
  assert.deepEqual(phaseStates('ENDED'), ['done', 'done', 'done', 'done', 'done', 'done']);
});

test('payout stepper: a reversed line (even if it was locked/paid) never claims approval or payment as skipped', async () => {
  const { visiblePayoutStations, payoutStationDone } = await import('./payoutStages');
  assert.deepEqual(visiblePayoutStations('REVERSED'), ['PENDING']);
  assert.equal(payoutStationDone('REVERSED', 'PENDING'), true);
  assert.equal(payoutStationDone('REVERSED', 'APPROVED'), false);
  assert.deepEqual(visiblePayoutStations('APPROVED'), ['PENDING', 'APPROVED', 'PAID']);
  assert.equal(payoutStationDone('APPROVED', 'APPROVED'), true);
  assert.equal(payoutStationDone('APPROVED', 'PAID'), false);
  assert.equal(payoutStationDone('PAID', 'PAID'), true);
});

test('effectiveThreshold caps the requirement for steppers taller than the viewport', async () => {
  const { effectiveThreshold } = await import('./journeyReveal');
  assert.equal(effectiveThreshold(0.6, 100, 800), 0.6);
  assert.equal(effectiveThreshold(0.5, 1600, 800), 0.45);
  assert.equal(effectiveThreshold(0.5, 10000, 800), 0.15);
  assert.equal(effectiveThreshold(0.5, 0, 800), 0.5);
  assert.equal(effectiveThreshold(0.6, 300, 0), 0.6);
});
