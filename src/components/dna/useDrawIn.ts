import './dna.css';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { markDrawn, readMotionEnv, shouldArm, type DrawPhase } from '../../lib/drawIn';
import { effectiveThreshold } from '../../lib/journeyReveal';

export interface DrawInOptions {
  /** Opt-in switch; false renders the final state and never observes. */
  enabled?: boolean;
  /** Same key => the draw plays once per session, even across remounts. */
  playKey?: string;
  /** Visible share required before it starts. */
  threshold?: number;
  /** ms after which the phase returns to idle (final state, no data attribute). */
  settleMs?: number;
}

/**
 * ONE shared hook behind every ring / donut / bar / sparkline / timeline draw. It returns
 * props to spread on the element that wraps the drawn parts:
 *   `data-draw` is absent (final state) unless JS has decided to play; then
 *   'armed' (collapsed, applied before first paint) -> 'go' (CSS transitions to the real
 *   value) -> absent again. All the CSS lives under `[data-draw]` in dna.css.
 */
export function useDrawIn({ enabled = true, playKey, threshold = 0.4, settleMs = 1800 }: DrawInOptions = {}) {
  const el = useRef<Element | null>(null);
  const ref = useCallback((node: Element | null) => { el.current = node; }, []);
  const [phase, setPhase] = useState<DrawPhase>('idle');

  useLayoutEffect(() => {
    const node = el.current;
    if (!node || !shouldArm({ enabled, playKey, ...readMotionEnv() })) {
      setPhase('idle');
      return;
    }
    let settle: number | undefined;
    setPhase('armed');
    const io = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry || !entry.isIntersecting) return;
      // A wrapper taller than the viewport can never show `threshold` of itself: cap the share (same rule as the journey reveal).
      const need = effectiveThreshold(threshold, entry.boundingClientRect.height, window.innerHeight);
      if (entry.intersectionRatio < need - 0.01) return;
      io.disconnect();
      markDrawn(playKey);
      setPhase('go');
      settle = window.setTimeout(() => setPhase('idle'), settleMs);
    }, { threshold: [0, 0.05, 0.1, 0.15, 0.2, 0.3, threshold] });
    io.observe(node);
    return () => {
      io.disconnect();
      window.clearTimeout(settle);
    };
  }, [enabled, playKey, threshold, settleMs]);

  return { ref, 'data-draw': phase === 'idle' ? undefined : phase } as const;
}

/** Accepts the public `draw` prop of the ring components: true, or a string playKey. */
export function drawOptions(draw: boolean | string | undefined): DrawInOptions {
  return { enabled: Boolean(draw), playKey: typeof draw === 'string' ? draw : undefined };
}

/** Ordered delay for grouped bars: <=60ms apart, whole group <=420ms. */
export const dnaDrawDelay = (index: number): CSSProperties =>
  ({ ['--draw-delay' as string]: `${Math.min(index, 7) * 60}ms` }) as CSSProperties;

/**
 * True for ~1.3s after `value` genuinely changes (never on first render, never loops).
 * Used for the one-time change-highlight on live counts.
 */
export function useChangeFlash(value: unknown, holdMs = 1300): boolean {
  const prev = useRef(value);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (Object.is(prev.current, value)) return;
    prev.current = value;
    setFlash(true);
    const t = window.setTimeout(() => setFlash(false), holdMs);
    return () => window.clearTimeout(t);
  }, [value, holdMs]);
  return flash;
}
