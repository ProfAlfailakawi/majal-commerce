/*
 * Pure logic behind the journey-stepper intro (useJourneyReveal). Presentation only:
 * the real step states are the truth; the intro only decides how many of the
 * already-true lit stations are shown so far.
 */

export type JourneyState = 'done' | 'current' | 'pending' | 'returned' | 'blocked';

const PLAYED_PREFIX = 'majal:journey-played:';
const played = new Set<string>();

/** Number of stations that are really lit: index of the last done/current step + 1. */
export function revealTarget(states: readonly JourneyState[]): number {
  for (let i = states.length - 1; i >= 0; i -= 1) {
    if (states[i] === 'done' || states[i] === 'current') return i + 1;
  }
  return 0;
}

/** ~4s in total, but never faster than 350ms or slower than 750ms per station. */
export function defaultStepMs(count: number): number {
  const n = Math.max(1, count);
  return Math.min(750, Math.max(350, Math.round(4000 / n)));
}

/**
 * Visible share the stepper must reach before the intro starts. A stepper taller than the
 * viewport can never be 50% visible, so the requirement is capped at what a ~90% tall
 * viewport can show (never below 15%); otherwise the stations would stay hidden forever.
 */
export function effectiveThreshold(threshold: number, elementHeight: number, viewportHeight: number): number {
  if (!(elementHeight > 0) || !(viewportHeight > 0)) return threshold;
  return Math.min(threshold, Math.max(0.15, (0.9 * viewportHeight) / elementHeight));
}

/** During the intro a station shows its real state only once the reveal has reached it. */
export function shownState(real: JourneyState, index: number, lit: number | null): JourneyState {
  return lit === null || index < lit ? real : 'pending';
}

export function alreadyPlayed(playKey?: string): boolean {
  if (!playKey) return false;
  if (played.has(playKey)) return true;
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(PLAYED_PREFIX + playKey) === '1';
  } catch {
    return false;
  }
}

/** `persist: false` remembers the key for this page load only (a hard reload plays the intro again). */
export function markPlayed(playKey?: string, persist = true): void {
  if (!playKey) return;
  played.add(playKey);
  if (!persist) return;
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(PLAYED_PREFIX + playKey, '1');
  } catch {
    /* storage unavailable: the in-memory set still prevents a replay in this tab session */
  }
}

/** Test helper. */
export function resetPlayedForTests(): void {
  played.clear();
}

/* ------------------------------------------------------------------------------------------
 * Framework-free controller behind useJourneyReveal. The React hook is a thin adapter, so the
 * rules (arm / play once / re-arm on a new key / hold / ready / dwell fallback) are unit-tested
 * in node with fake timers and a fake observer.
 * ---------------------------------------------------------------------------------------- */

export interface VisibilityInfo {
  isIntersecting: boolean;
  /** Visible share of the stepper (already reduced by any clipping ancestor). */
  ratio: number;
  elementHeight: number;
  /** Height the stepper could ever be shown in: the viewport, or a smaller clipping container. */
  viewportHeight: number;
}

export interface RevealDeps {
  reducedMotion: () => boolean;
  canObserve: () => boolean;
  /** Start observing the stepper; returns a stop function. */
  observe: (cb: (v: VisibilityInfo) => void) => () => void;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (id: unknown) => void;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
}

export interface RevealConfig {
  /** Stations that are really lit (revealTarget). Read live, so data arriving mid-intro is honoured. */
  target: number;
  stepMs: number;
  threshold: number;
  enabled: boolean;
  /** False while the data is still a placeholder: nothing arms and nothing is marked as played. */
  ready: boolean;
  /** Armed (all pending) but the start waits. */
  hold: boolean;
  playKey?: string;
  /** false: remembered for this page load only. */
  persist: boolean;
  /** Optional extra gate before the first tick; returns a cancel function. */
  gate?: (go: () => void) => () => void;
}

/** A stepper that cannot reach its threshold (clipped by a container) still plays after this dwell. */
export const DWELL_MS = 1200;

export class JourneyRevealController {
  /** Stations shown so far; null means settled: render the real states. */
  lit: number | null = null;
  cfg: RevealConfig;
  private armed = false;
  private started = false;
  private key: string | undefined;
  private stopObserve: (() => void) | undefined;
  private cancelGate: (() => void) | undefined;
  private interval: unknown;
  private dwell: unknown;
  private playing = false;

  constructor(private deps: RevealDeps, private emit: () => void, cfg: RevealConfig) {
    this.cfg = cfg;
    this.key = cfg.playKey;
  }

  /** Call from a layout effect whenever an arming-relevant input changed. */
  configure(): void {
    const c = this.cfg;
    if (this.key !== c.playKey) {
      /* A reused stepper now shows another entity: forget the previous reveal and decide afresh. */
      this.detach();
      this.key = c.playKey;
      this.started = false;
      this.armed = false;
      if (this.lit !== null) { this.lit = null; this.emit(); }
    }
    if (!this.started && c.enabled && c.ready && c.target > 0 && this.deps.canObserve() && !this.deps.reducedMotion() && !alreadyPlayed(c.playKey)) {
      this.started = true;
      this.armed = true;
      this.lit = 0;
      this.emit();
    }
    this.detach();
    if (this.armed && !c.hold) this.attach();
  }

  /** Cleanup: stops observing and ticking but keeps the armed state (StrictMode remounts re-attach). */
  detach(): void {
    this.stopObserve?.(); this.stopObserve = undefined;
    this.cancelGate?.(); this.cancelGate = undefined;
    this.clearDwell();
    if (this.interval !== undefined) { this.deps.clearInterval(this.interval); this.interval = undefined; }
    this.playing = false;
  }

  private clearDwell() {
    if (this.dwell !== undefined) { this.deps.clearTimeout(this.dwell); this.dwell = undefined; }
  }

  private attach() {
    this.stopObserve = this.deps.observe(v => this.onVisible(v));
  }

  private onVisible(v: VisibilityInfo) {
    if (this.playing) return;
    const need = effectiveThreshold(this.cfg.threshold, v.elementHeight, v.viewportHeight);
    if (v.isIntersecting && v.ratio >= need - 0.01) { this.go(); return; }
    if (v.isIntersecting) {
      /* Never reaches the threshold (clipped by a container): any continuous visibility is enough after a dwell. */
      if (this.dwell === undefined) this.dwell = this.deps.setTimeout(() => { this.dwell = undefined; this.go(); }, DWELL_MS);
    } else this.clearDwell();
  }

  private go() {
    if (this.playing) return;
    this.playing = true;
    this.clearDwell();
    this.stopObserve?.(); this.stopObserve = undefined;
    const gate = this.cfg.gate;
    if (gate) this.cancelGate = gate(() => this.start()); else this.start();
  }

  private start() {
    markPlayed(this.cfg.playKey, this.cfg.persist);
    let n = this.lit ?? 0;
    this.interval = this.deps.setInterval(() => {
      n += 1;
      if (n > this.cfg.target) {
        this.deps.clearInterval(this.interval); this.interval = undefined;
        this.lit = null; this.armed = false; this.playing = false;
      } else this.lit = n;
      this.emit();
    }, this.cfg.stepMs);
  }
}
