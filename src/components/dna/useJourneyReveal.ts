import { useLayoutEffect, useReducer, useRef } from 'react';
import { defaultStepMs, JourneyRevealController, type RevealDeps, type VisibilityInfo } from '../../lib/journeyReveal';

/* Fine-grained thresholds so the callback re-evaluates as the visible share changes. */
const STEPS = Array.from({ length: 21 }, (_, i) => i / 20);

export interface JourneyRevealOptions {
  /** How many stations are really lit (see revealTarget). The intro never goes past it. */
  target: number;
  /** Total stations; only used for the default step duration. */
  count: number;
  stepMs?: number;
  /** Visible share of the stepper required before the intro starts. */
  threshold?: number;
  enabled?: boolean;
  /** False while the data is still a placeholder: nothing arms and nothing counts as played. */
  ready?: boolean;
  /** While true the stepper stays armed (all pending) and the start waits. */
  hold?: boolean;
  /** Same key => the intro plays once, even across remounts (and across reloads of the tab unless persist is false). */
  playKey?: string;
  /** false: remember the key for this page load only, so a hard reload plays again. */
  persist?: boolean;
  /** Optional extra gate before the first tick (e.g. a boot splash); returns a cancel function. */
  gate?: (go: () => void) => () => void;
}

/** Smallest height the stepper can ever be shown in: the viewport, or a clipping ancestor (modal body, scroll box). */
function visibleCap(el: HTMLElement, base: number): number {
  let cap = base;
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if (o !== 'visible' && p.clientHeight > 0) cap = Math.min(cap, p.clientHeight);
  }
  return cap;
}

/**
 * Visual-only reveal: stations light one after another, once, when the stepper scrolls
 * into view. `lit` is how many stations are shown so far; null means settled (render the
 * real states: reduced motion, no IntersectionObserver, already played, or finished).
 * The rules live in JourneyRevealController (unit-tested); this hook only wires React and the DOM.
 */
export function useJourneyReveal({ target, count, stepMs, threshold = 0.5, enabled = true, ready = true, hold = false, playKey, persist = true, gate }: JourneyRevealOptions) {
  const ref = useRef<HTMLElement | null>(null);
  const [, emit] = useReducer((n: number) => n + 1, 0);
  const ms = stepMs ?? defaultStepMs(count);
  const ctrl = useRef<JourneyRevealController | null>(null);
  if (!ctrl.current) {
    const deps: RevealDeps = {
      reducedMotion: () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches),
      canObserve: () => typeof IntersectionObserver !== 'undefined' && !!ref.current,
      observe: cb => {
        const el = ref.current!;
        const io = new IntersectionObserver(([entry]) => {
          if (!entry) return;
          const info: VisibilityInfo = {
            isIntersecting: entry.isIntersecting,
            ratio: entry.intersectionRatio,
            elementHeight: entry.boundingClientRect.height,
            viewportHeight: visibleCap(el, entry.rootBounds?.height ?? window.innerHeight),
          };
          cb(info);
        }, { threshold: STEPS });
        io.observe(el);
        return () => io.disconnect();
      },
      setInterval: (fn, t) => window.setInterval(fn, t),
      clearInterval: id => window.clearInterval(id as number),
      setTimeout: (fn, t) => window.setTimeout(fn, t),
      clearTimeout: id => window.clearTimeout(id as number),
    };
    ctrl.current = new JourneyRevealController(deps, emit, { target, stepMs: ms, threshold, enabled, ready, hold, playKey, persist, gate });
  }
  const c = ctrl.current;
  /* Read live by the controller (data may arrive or change mid-intro). */
  c.cfg = { target, stepMs: ms, threshold, enabled, ready, hold, playKey, persist, gate };
  const hasTarget = target > 0;

  useLayoutEffect(() => {
    c.configure();
    return () => c.detach();
  }, [c, enabled, ready, hasTarget, playKey, hold, ms, threshold, persist, gate]);

  return { ref, lit: c.lit };
}
