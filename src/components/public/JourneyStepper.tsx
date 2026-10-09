import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { DnaStepper } from '../dna/DnaKit';
import { journeyStages } from '../../data/journey';

const STEP_MS = 750;

/** Runs `cb` once the boot splash (#majal-splash) has faded out; returns a cancel function. */
function whenBootReady(cb: () => void): () => void {
  const root = document.documentElement;
  if (root.classList.contains('majal-ready')) { cb(); return () => {}; }
  let t: number | undefined;
  const mo = new MutationObserver(() => {
    if (!root.classList.contains('majal-ready')) return;
    mo.disconnect();
    t = window.setTimeout(cb, 560);
  });
  mo.observe(root, { attributes: true, attributeFilter: ['class'] });
  return () => { mo.disconnect(); window.clearTimeout(t); };
}

/**
 * Visual-only reveal: the stations light up one after another (each gate "opens", then
 * the next lights) once, when the stepper scrolls into view. `lit` is how many stations
 * are lit; null means fully complete (reduced motion, no IntersectionObserver, finished).
 */
function useSequentialReveal(enabled: boolean, count: number, hold: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [lit, setLit] = useState<number | null>(null);
  const [armed, setArmed] = useState(false);
  useLayoutEffect(() => {
    if (!enabled || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    setLit(0);
    setArmed(true);
  }, [enabled]);
  useEffect(() => {
    /* While an intro overlay is up the stepper is already armed (all pending); only the start waits. */
    if (!armed || hold || !ref.current) return;
    let timer: number | undefined;
    let cancelReady: (() => void) | undefined;
    const io = new IntersectionObserver(([entry]) => {
      /* isIntersecting turns true on any overlap; wait for the real 60% before starting. */
      if (!entry?.isIntersecting || entry.intersectionRatio < 0.6) return;
      io.disconnect();
      cancelReady = whenBootReady(() => {
        let n = 0;
        timer = window.setInterval(() => {
          n += 1;
          if (n >= count + 1) { window.clearInterval(timer); setLit(null); setArmed(false); } else setLit(n);
        }, STEP_MS);
      });
    }, { threshold: 0.6 });
    io.observe(ref.current);
    return () => { io.disconnect(); cancelReady?.(); window.clearInterval(timer); };
  }, [armed, count, hold]);
  return { ref, lit };
}

/**
 * The six MAJAL stations as one connected stepper in the single accent. The order is
 * the message; each station's explanation stays available as the node's tooltip and in
 * the «تفاصيل المحطات» disclosure, so no copy from src/data/journey.tsx is lost.
 */
export const JourneyStepper: React.FC<{ detail?: 'body' | 'brief'; className?: string; animate?: boolean; hold?: boolean }> = ({ detail = 'body', className, animate = false, hold = false }) => {
  const { ref, lit } = useSequentialReveal(animate, journeyStages.length, hold);
  return (
  <div ref={ref} className={`journey-dna space-y-5 ${className ?? ''}`} data-reveal={lit === null ? undefined : lit}>
    <DnaStepper
      size="lg"
      ariaLabel="محطات رحلة مجال"
      stateText={{ done: '', pending: '' }}
      steps={journeyStages.map((stage, i) => ({
        key: stage.index,
        state: (lit === null || i < lit ? 'done' : 'pending') as 'done' | 'pending',
        icon: stage.icon,
        title: stage[detail],
        label: (
          <>
            <span className="journey-dna-title">{stage.title}</span>
            <span className="journey-dna-actor">{stage.actor}</span>
          </>
        )
      }))}
    />
    <details className="journey-dna-more group max-w-2xl mx-auto">
      <summary className="list-none mx-auto w-fit flex min-h-11 items-center gap-1.5 px-3 text-xs font-bold text-slate-400 hover:text-gold-300 cursor-pointer rounded-xl">
        تفاصيل المحطات
        <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <ol className="mt-3 divide-y divide-dashed divide-slate-700/60 text-start">
        {journeyStages.map(stage => (
          <li key={stage.index} className="flex gap-3 py-3">
            <span className="text-xs font-black text-gold-300 shrink-0 w-4" aria-hidden="true">{stage.index}</span>
            <p className="text-xs text-slate-400 leading-7">
              <span className="font-black text-slate-200">{stage.title}</span> · {stage[detail]}
            </p>
          </li>
        ))}
      </ol>
    </details>
  </div>
  );
};
