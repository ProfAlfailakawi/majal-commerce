/*
 * Pure rules behind the opt-in "draw" effect (rings, donuts, bars, sparklines) and the
 * count-up. Presentation only. They reuse the journey-reveal play-once store, so a key plays
 * once per session no matter which primitive asked.
 */
import { alreadyPlayed, markPlayed } from './journeyReveal';

export type DrawPhase = 'idle' | 'armed' | 'go';

export interface MotionEnv {
  reducedMotion: boolean;
  canObserve: boolean;
}

/** Namespaced so a draw key can never collide with a stepper key. */
export const drawKey = (playKey?: string): string | undefined => (playKey ? `draw:${playKey}` : undefined);

/**
 * Whether an opt-in effect should start from its collapsed state. Anything that cannot
 * observe (jsdom, SSR, old browsers), reduced motion or an already-played key shows the
 * FINAL state at once, so nothing is ever left invisible by default.
 */
export function shouldArm(opts: { enabled: boolean; playKey?: string } & MotionEnv): boolean {
  if (!opts.enabled || opts.reducedMotion || !opts.canObserve) return false;
  return !alreadyPlayed(drawKey(opts.playKey));
}

export function markDrawn(playKey?: string, persist = true): void {
  markPlayed(drawKey(playKey), persist);
}

/** Environment probe shared by the hooks (safe on the server). */
export function readMotionEnv(): MotionEnv {
  if (typeof window === 'undefined') return { reducedMotion: true, canObserve: false };
  return {
    reducedMotion: Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches),
    canObserve: typeof IntersectionObserver !== 'undefined',
  };
}

/* ---------------------------------------------------------------- count-up */

/** Same curve as the --ease-out token: cubic-bezier(0.16, 1, 0.3, 1). */
export function easeOutToken(t: number): number {
  const x1 = 0.16, y1 = 1, x2 = 0.3, y2 = 1;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const bez = (a: number, b: number, u: number) => 3 * a * (1 - u) * (1 - u) * u + 3 * b * (1 - u) * u * u + u * u * u;
  let lo = 0, hi = 1, u = t;
  for (let i = 0; i < 24; i += 1) {
    u = (lo + hi) / 2;
    if (bez(x1, x2, u) < t) lo = u; else hi = u;
  }
  return bez(y1, y2, u);
}

/** The number to show `elapsed` ms into a count-up toward `final` (integers stay integers). */
export function countUpValue(final: number, elapsed: number, durationMs: number): number {
  if (!Number.isFinite(final)) return final;
  if (durationMs <= 0 || elapsed >= durationMs) return final;
  const v = final * easeOutToken(elapsed / durationMs);
  return Number.isInteger(final) ? Math.round(v) : v;
}
