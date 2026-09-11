import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Lock, Building2, Store } from 'lucide-react';
import { MajalMark } from '../brand/MajalMark';

/**
 * «الغرفة البيضاء» — the full-screen opening overture.
 *
 * A luxurious white veil covers the viewport once per browser session. The four
 * movements of the model enter from the four screen edges like instruments,
 * interleave around the centre, and fuse into one large MAJAL mark. The mark
 * takes a single calm breath, then glides down into its natural seat inside the
 * hero constellation as the veil lifts — at which point the existing in-hero
 * entrance choreography is released and plays as the reveal, so the whole thing
 * reads as one continuous sequence rather than two stacked intros.
 *
 * Everything animates with transform + opacity only. The final glide is WAAPI
 * because it has to target the live position of the hero mark, which CSS
 * keyframes cannot measure.
 */

const SEEN_KEY = 'majal_overture_seen';

/** Decide once, before anything mounts: reduced motion or a repeat visit in the
    same session means the overture never exists and the page is exactly today's. */
export const shouldPlayOverture = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    if (window.sessionStorage.getItem(SEEN_KEY)) return false;
  } catch {
    return false;
  }
  return true;
};

/** The four instruments: same movements, re-toned for the white room. */
const instruments = [
  { icon: <Sparkles className="w-5 h-5" />, label: 'ابتكار', edge: { x: '-56vw', y: '-16vh', r: '-18deg' }, seat: { x: '0rem', y: '-4.6rem', r: '4deg' }, d: '0ms' },
  { icon: <Lock className="w-5 h-5" />, label: 'حماية', edge: { x: '58vw', y: '-20vh', r: '14deg' }, seat: { x: '4.6rem', y: '0rem', r: '-5deg' }, d: '90ms' },
  { icon: <Building2 className="w-5 h-5" />, label: 'إنتاج', edge: { x: '56vw', y: '24vh', r: '-12deg' }, seat: { x: '0rem', y: '4.6rem', r: '5deg' }, d: '180ms' },
  { icon: <Store className="w-5 h-5" />, label: 'إطلاق', edge: { x: '-54vw', y: '20vh', r: '16deg' }, seat: { x: '-4.6rem', y: '0rem', r: '-4deg' }, d: '270ms' }
];

/* Timeline (ms from mount) — total ~3s:
   0    veil breathes in, instruments begin their entry
   1650 instruments have fused; large mark is in and starts its breath
   2350 glide: mark travels to its hero seat (or bows out where the seat is hidden),
        veil starts lifting, the hero choreography underneath is released
   3000 overlay unmounts */
const T_GLIDE = 2350;
const T_DONE = 3050;

interface OvertureProps {
  /** Releases the in-hero entrance choreography (removes the hold class). */
  onReveal: () => void;
  /** Unmounts the overlay. */
  onDone: () => void;
}

export const Overture: React.FC<OvertureProps> = ({ onReveal, onDone }) => {
  const veilRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const finishedRef = useRef(false);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* private mode — the overture simply plays again next time */
    }

    const glide = () => {
      if (finishedRef.current) return;
      setLeaving(true);
      onReveal();

      const markEl = markRef.current;
      const veilEl = veilRef.current;
      const seat = document.querySelector('[data-hero-mark]');
      if (markEl) {
        const from = markEl.getBoundingClientRect();
        const to = seat instanceof HTMLElement && seat.offsetParent !== null ? seat.getBoundingClientRect() : null;
        if (to && from.width > 0) {
          const dx = to.left + to.width / 2 - (from.left + from.width / 2);
          const dy = to.top + to.height / 2 - (from.top + from.height / 2);
          const s = to.width / from.width;
          markEl.animate(
            [
              { transform: 'translate3d(0,0,0) scale(1)', opacity: 1 },
              { transform: `translate3d(${dx}px, ${dy}px, 0) scale(${s})`, opacity: 1, offset: 0.82 },
              { transform: `translate3d(${dx}px, ${dy}px, 0) scale(${s})`, opacity: 0 }
            ],
            { duration: 640, easing: 'cubic-bezier(0.55, 0, 0.2, 1)', fill: 'forwards' }
          );
        } else {
          // No visible seat (below xl): the mark bows out in place instead.
          markEl.animate(
            [
              { transform: 'translate3d(0,0,0) scale(1)', opacity: 1 },
              { transform: 'translate3d(0, -1.5rem, 0) scale(0.62)', opacity: 0 }
            ],
            { duration: 560, easing: 'cubic-bezier(0.55, 0, 0.2, 1)', fill: 'forwards' }
          );
        }
      }
      veilEl?.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 560,
        delay: 120,
        easing: 'ease-out',
        fill: 'forwards'
      });
    };

    const finish = () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      onDone();
    };

    const t1 = window.setTimeout(glide, T_GLIDE);
    const t2 = window.setTimeout(finish, T_DONE);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [onReveal, onDone]);

  const skip = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onReveal();
    onDone();
  };

  return (
    <div className="fixed inset-0 z-[120]" style={{ pointerEvents: leaving ? 'none' : 'auto' }}>
      {/* The white room itself — a warm ivory field, no chrome, no glow. */}
      <div ref={veilRef} aria-hidden="true" className="absolute inset-0 majal-overture-veil" />

      <div className="absolute inset-0 grid place-items-center overflow-hidden">
        <div className="relative grid place-items-center">
          {instruments.map(inst => (
            <div
              key={inst.label}
              aria-hidden="true"
              className="absolute majal-overture-instrument flex flex-col items-center gap-1.5"
              style={{
                '--edge-x': inst.edge.x,
                '--edge-y': inst.edge.y,
                '--edge-r': inst.edge.r,
                '--seat-x': inst.seat.x,
                '--seat-y': inst.seat.y,
                '--seat-r': inst.seat.r,
                '--inst-d': inst.d
              } as React.CSSProperties}
            >
              <span className="w-12 h-12 rounded-2xl border border-[#a8843c]/30 bg-white/70 text-[#a8843c] grid place-items-center shadow-[0_10px_30px_rgba(31,26,14,0.08)]">
                {inst.icon}
              </span>
              <span className="text-[11px] font-black text-[#4a3d22]">{inst.label}</span>
            </div>
          ))}

          <div ref={markRef} className="majal-overture-mark">
            <MajalMark size={176} withGround title="مجال" />
          </div>
        </div>
      </div>

      {!leaving && (
        <button
          onClick={skip}
          className="absolute bottom-8 start-8 px-4 py-2 rounded-full border border-[#a8843c]/30 text-[#6b5527] text-xs font-semibold bg-white/60 hover:bg-white transition-colors majal-overture-skip"
        >
          تخطي
        </button>
      )}
    </div>
  );
};
