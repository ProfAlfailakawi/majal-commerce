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

export function markPlayed(playKey?: string): void {
  if (!playKey) return;
  played.add(playKey);
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
