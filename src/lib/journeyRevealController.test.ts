import test from 'node:test';
import assert from 'node:assert/strict';
import { DWELL_MS, JourneyRevealController, resetPlayedForTests, type RevealConfig, type RevealDeps, type VisibilityInfo } from './journeyReveal';

/* A manual clock plus a fake observer: the reveal rules are exercised without a DOM. */
function rig(opts: { reduced?: boolean; observe?: boolean } = {}) {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; every?: number; fn: () => void }>();
  let listener: ((v: VisibilityInfo) => void) | null = null;
  let observers = 0;
  let intervalsStarted = 0;
  const deps: RevealDeps = {
    reducedMotion: () => !!opts.reduced,
    canObserve: () => opts.observe !== false,
    observe: cb => { observers += 1; listener = cb; return () => { if (listener === cb) listener = null; }; },
    setInterval: (fn, ms) => { intervalsStarted += 1; const id = nextId++; timers.set(id, { at: now + ms, every: ms, fn }); return id; },
    clearInterval: id => { timers.delete(id as number); },
    setTimeout: (fn, ms) => { const id = nextId++; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimeout: id => { timers.delete(id as number); },
  };
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      const [id, t] = due;
      now = t.at;
      if (t.every) t.at += t.every; else timers.delete(id);
      t.fn();
    }
    now = end;
  };
  const see = (v: Partial<VisibilityInfo> = {}) => listener?.({ isIntersecting: true, ratio: 1, elementHeight: 100, viewportHeight: 800, ...v });
  return { deps, advance, see, get observing() { return listener !== null; }, get observers() { return observers; }, get intervalsStarted() { return intervalsStarted; }, pending: () => timers.size };
}

const base: RevealConfig = { target: 3, stepMs: 100, threshold: 0.5, enabled: true, ready: true, hold: false, playKey: undefined, persist: true };
function make(r: ReturnType<typeof rig>, cfg: Partial<RevealConfig> = {}) {
  let emits = 0;
  const c = new JourneyRevealController(r.deps, () => { emits += 1; }, { ...base, ...cfg });
  return { c, emits: () => emits };
}

test('reduced motion: never arms, the real states render at once', () => {
  resetPlayedForTests();
  const r = rig({ reduced: true });
  const { c } = make(r);
  c.configure();
  assert.equal(c.lit, null);
  assert.equal(r.observing, false);
});

test('no IntersectionObserver: final state, nothing observed', () => {
  resetPlayedForTests();
  const r = rig({ observe: false });
  const { c } = make(r);
  c.configure();
  assert.equal(c.lit, null);
  assert.equal(r.observing, false);
});

test('arms all-pending, waits for visibility, plays up to the real target and settles', () => {
  resetPlayedForTests();
  const r = rig();
  const { c } = make(r);
  c.configure();
  assert.equal(c.lit, 0);
  r.advance(1000);
  assert.equal(c.lit, 0, 'nothing happens before the stepper is visible');
  r.see({ ratio: 0.2 });
  assert.equal(c.lit, 0, 'below the threshold it keeps waiting');
  r.see({ ratio: 0.9 });
  const seen: (number | null)[] = [];
  for (let i = 0; i < 5; i += 1) { r.advance(100); seen.push(c.lit); }
  assert.deepEqual(seen, [1, 2, 3, null, null], 'stops at the target, then settles');
  assert.equal(r.pending(), 0, 'no timer left behind');
});

test('data changing mid-intro is honoured: never past the live target', () => {
  resetPlayedForTests();
  const r = rig();
  const { c } = make(r, { target: 2 });
  c.configure();
  r.see();
  r.advance(100);
  c.cfg = { ...c.cfg, target: 4 };
  r.advance(100); r.advance(100); r.advance(100);
  assert.equal(c.lit, 4);
  r.advance(100);
  assert.equal(c.lit, null);
});

test('no replay: a settled stepper stays settled and a new mount with the same key does not play', () => {
  resetPlayedForTests();
  const first = rig();
  const a = make(first, { playKey: 'order-1' });
  a.c.configure();
  first.see();
  first.advance(1000);
  assert.equal(a.c.lit, null);
  a.c.configure(); a.c.configure();
  assert.equal(a.c.lit, null, 're-render / live data update does not re-arm');
  const second = rig();
  const b = make(second, { playKey: 'order-1' });
  b.c.configure();
  assert.equal(b.c.lit, null, 'a remount of the same entity does not replay');
  assert.equal(second.observing, false);
});

test('persist:false is remembered for the page load only (module set, not storage)', () => {
  resetPlayedForTests();
  const r1 = rig();
  const a = make(r1, { playKey: 'landing', persist: false });
  a.c.configure(); r1.see(); r1.advance(1000);
  const r2 = rig();
  const b = make(r2, { playKey: 'landing', persist: false });
  b.c.configure();
  assert.equal(b.c.lit, null, 'SPA remount: no replay');
  resetPlayedForTests(); // what a hard reload does to the module state
  const r3 = rig();
  const d = make(r3, { playKey: 'landing', persist: false });
  d.c.configure();
  assert.equal(d.c.lit, 0, 'hard reload: plays again, like the original landing');
});

test('playKey change re-arms for the new entity (and a played key does not)', () => {
  resetPlayedForTests();
  const r = rig();
  const { c } = make(r, { playKey: 'A' });
  c.configure(); r.see(); r.advance(1000);
  assert.equal(c.lit, null);
  c.cfg = { ...c.cfg, playKey: 'B' };
  c.configure();
  assert.equal(c.lit, 0, 'new entity: all pending again');
  r.see(); r.advance(1000);
  assert.equal(c.lit, null);
  c.cfg = { ...c.cfg, playKey: 'A' };
  c.configure();
  assert.equal(c.lit, null, 'back to an entity that already played: no replay');
});

test('playKey change mid-intro cancels the old timer', () => {
  resetPlayedForTests();
  const r = rig();
  const { c } = make(r, { playKey: 'A' });
  c.configure(); r.see(); r.advance(100);
  assert.equal(c.lit, 1);
  c.cfg = { ...c.cfg, playKey: 'B' };
  c.configure();
  assert.equal(c.lit, 0);
  r.advance(500);
  assert.equal(c.lit, 0, 'the old interval is gone; the new reveal waits for visibility');
});

test('hold: armed and all-pending, but nothing starts until released', () => {
  resetPlayedForTests();
  const r = rig();
  const { c } = make(r, { hold: true });
  c.configure();
  assert.equal(c.lit, 0);
  assert.equal(r.observing, false, 'not even observing while held');
  r.advance(2000);
  assert.equal(c.lit, 0);
  c.cfg = { ...c.cfg, hold: false };
  c.configure();
  assert.equal(r.observing, true);
  r.see(); r.advance(100);
  assert.equal(c.lit, 1);
});

test('ready=false: placeholder data neither arms nor counts as played; arms once ready', () => {
  resetPlayedForTests();
  const r = rig();
  const { c } = make(r, { ready: false, playKey: 'deal-1' });
  c.configure();
  assert.equal(c.lit, null, 'real (placeholder) states render, no intro');
  r.see();
  assert.equal(r.observing, false);
  c.cfg = { ...c.cfg, ready: true };
  c.configure();
  assert.equal(c.lit, 0, 'data arrived: the intro is still available');
  r.see(); r.advance(1000);
  assert.equal(c.lit, null);
});

test('target 0 (nothing lit) does not arm', () => {
  resetPlayedForTests();
  const r = rig();
  const { c } = make(r, { target: 0 });
  c.configure();
  assert.equal(c.lit, null);
});

test('StrictMode-style effect replay (configure, detach, configure) still plays exactly once', () => {
  resetPlayedForTests();
  const r = rig();
  const { c } = make(r);
  c.configure(); c.detach(); c.configure();
  assert.equal(c.lit, 0);
  r.see(); r.advance(1000);
  assert.equal(c.lit, null);
  assert.equal(r.intervalsStarted, 1, 'a single interval ran');
});

test('unmount cleanup leaves no timer or observer behind', () => {
  resetPlayedForTests();
  const r = rig();
  const { c } = make(r);
  c.configure(); r.see(); r.advance(100);
  c.detach();
  assert.equal(r.pending(), 0);
  assert.equal(r.observing, false);
});

test('clipped stepper that cannot reach the threshold still plays after a short dwell', () => {
  resetPlayedForTests();
  const r = rig();
  const { c } = make(r, { threshold: 0.6 });
  c.configure();
  r.see({ ratio: 0.2, elementHeight: 400, viewportHeight: 4000 });
  r.advance(DWELL_MS - 50);
  assert.equal(c.lit, 0);
  r.advance(100);
  r.advance(100);
  assert.equal(c.lit, 1, 'dwell elapsed, the intro runs the real states');
});

test('dwell is cancelled when the stepper leaves the viewport', () => {
  resetPlayedForTests();
  const r = rig();
  const { c } = make(r, { threshold: 0.6 });
  c.configure();
  r.see({ ratio: 0.2, elementHeight: 400, viewportHeight: 4000 });
  r.advance(DWELL_MS - 100);
  r.see({ isIntersecting: false, ratio: 0 });
  r.advance(5000);
  assert.equal(c.lit, 0);
});

test('a taller-than-container stepper uses the attainable threshold (no dwell needed)', () => {
  resetPlayedForTests();
  const r = rig();
  const { c } = make(r, { threshold: 0.5 });
  c.configure();
  /* 1600px tall in an 800px box: 90% of 800 / 1600 = 45% is the most that can ever show. */
  r.see({ ratio: 0.45, elementHeight: 1600, viewportHeight: 800 });
  r.advance(100);
  assert.equal(c.lit, 1);
});

test('the optional gate delays the first tick and can be cancelled', () => {
  resetPlayedForTests();
  const r = rig();
  let open: (() => void) | null = null;
  let cancelled = false;
  const { c } = make(r, { gate: go => { open = go; return () => { cancelled = true; }; } });
  c.configure(); r.see(); r.advance(500);
  assert.equal(c.lit, 0, 'gate closed: still all pending');
  (open as unknown as () => void)();
  r.advance(100);
  assert.equal(c.lit, 1);
  c.detach();
  assert.equal(cancelled, true);
});

test('phase label: current phase, closed collaborations report the last phase, DISPUTED none', async () => {
  const { currentPhaseLabel } = await import('./collaborationPhases');
  assert.equal(currentPhaseLabel('INTEREST'), 'الوصول');
  assert.equal(currentPhaseLabel('SIGNED'), 'العقد');
  assert.equal(currentPhaseLabel('ENDED'), 'المراجعة');
  assert.equal(currentPhaseLabel('DISPUTED'), null);
});
