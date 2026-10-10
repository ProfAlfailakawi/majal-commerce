import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { alreadyPlayed, defaultStepMs, effectiveThreshold, markPlayed } from '../../lib/journeyReveal';

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
  /** While true the stepper stays armed (all pending) and the start waits. */
  hold?: boolean;
  /** Same key => the intro plays once, even across remounts. */
  playKey?: string;
  /** Optional extra gate before the first tick (e.g. a boot splash); returns a cancel function. */
  gate?: (go: () => void) => () => void;
}

/**
 * Visual-only reveal: stations light one after another, once, when the stepper scrolls
 * into view. `lit` is how many stations are shown so far; null means settled (render the
 * real states: reduced motion, no IntersectionObserver, already played, or finished).
 */
export function useJourneyReveal({ target, count, stepMs, threshold = 0.5, enabled = true, hold = false, playKey, gate }: JourneyRevealOptions) {
  const ref = useRef<HTMLElement | null>(null);
  const [lit, setLit] = useState<number | null>(null);
  const [armed, setArmed] = useState(false);
  const targetRef = useRef(target);
  targetRef.current = target;
  const ms = stepMs ?? defaultStepMs(count);
  /* Arm at most once per mount, but also when data arrives after the first render (target 0 -> >0). */
  const startedRef = useRef(false);
  const keyRef = useRef(playKey);
  const hasTarget = target > 0;

  useLayoutEffect(() => {
    /* A reused stepper now shows another entity: drop the previous reveal state (the effect below
       cleans up the old observer/timer because playKey is one of its deps) and decide afresh. */
    if (keyRef.current !== playKey) {
      keyRef.current = playKey;
      startedRef.current = false;
      setLit(null);
      setArmed(false);
    }
    if (!enabled || !hasTarget || startedRef.current || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (alreadyPlayed(playKey)) return;
    startedRef.current = true;
    setLit(0);
    setArmed(true);
  }, [enabled, hasTarget, playKey]);

  useEffect(() => {
    if (!armed || hold || !ref.current) return;
    let timer: number | undefined;
    let cancelGate: (() => void) | undefined;
    const start = () => {
      markPlayed(playKey);
      let n = 0;
      timer = window.setInterval(() => {
        n += 1;
        if (n > targetRef.current) {
          window.clearInterval(timer);
          setLit(null);
          setArmed(false);
        } else {
          setLit(n);
        }
      }, ms);
    };
    const io = new IntersectionObserver(([entry]) => {
      /* isIntersecting turns true on any overlap; wait for a real share, capped to what the viewport can show. */
      if (!entry?.isIntersecting) return;
      const need = effectiveThreshold(threshold, entry.boundingClientRect.height, entry.rootBounds?.height ?? window.innerHeight);
      if (entry.intersectionRatio < need - 0.01) return;
      io.disconnect();
      if (gate) cancelGate = gate(start); else start();
    }, { threshold: STEPS });
    io.observe(ref.current);
    return () => { io.disconnect(); cancelGate?.(); window.clearInterval(timer); };
  }, [armed, hold, ms, threshold, playKey, gate]);

  return { ref, lit };
}
