import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { countUpValue, markDrawn, readMotionEnv, shouldArm } from '../../lib/drawIn';

export interface CountUpOptions {
  playKey?: string;
  enabled?: boolean;
  durationMs?: number;
  threshold?: number;
}

/**
 * Counts 0 -> value once per playKey (per session) the first time the element is mostly in
 * view. The initial state is decided synchronously: anything that cannot or should not
 * animate (no IntersectionObserver, reduced motion, already played, disabled) renders the
 * final value from the very first frame. After it has played, value changes snap.
 */
export function useCountUp(value: number, { playKey, enabled = true, durationMs = 700, threshold = 0.4 }: CountUpOptions = {}) {
  const el = useRef<Element | null>(null);
  const ref = useCallback((node: Element | null) => { el.current = node; }, []);
  const [phase, setPhase] = useState<'wait' | 'run' | 'done'>(() =>
    shouldArm({ enabled, playKey, ...readMotionEnv() }) ? 'wait' : 'done');
  const [shown, setShown] = useState(0);
  const latest = useRef(value);
  latest.current = value;
  const positive = Number.isFinite(value) && value > 0;

  useLayoutEffect(() => {
    if (phase !== 'wait' || !positive || !el.current) return;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry || !entry.isIntersecting || entry.intersectionRatio < threshold - 0.01) return;
      io.disconnect();
      if (typeof document !== 'undefined' && document.hidden) { setPhase('done'); return; }
      markDrawn(playKey);
      setPhase('run');
    }, { threshold: [0, threshold] });
    io.observe(el.current);
    return () => io.disconnect();
  }, [phase, positive, playKey, threshold]);

  useEffect(() => {
    if (phase !== 'run') return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const elapsed = now - t0;
      setShown(countUpValue(latest.current, elapsed, durationMs));
      if (elapsed >= durationMs) { setPhase('done'); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, durationMs]);

  /* 'wait' shows 0 only while the number is off-screen; a zero/unknown value is shown as is. */
  const display = phase === 'done' || !positive ? value : phase === 'wait' ? 0 : shown;
  return { ref, display, playing: phase === 'run' };
}
