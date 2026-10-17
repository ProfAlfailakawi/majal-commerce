import React, { useEffect, useRef, useState } from 'react';
import { countdownLabelAr, countdownParts, type CountdownParts } from '../../lib/countdown';

/** Ticks once a second until the opening time, then stops. `offsetMs` is server − device clock. */
export function useLaunchClock(opensAtIso: string | null | undefined, offsetMs = 0) {
  const target = opensAtIso ? Date.parse(opensAtIso) : NaN;
  const valid = Number.isFinite(target);
  const [now, setNow] = useState(() => Date.now());
  const left = valid ? target - (now + offsetMs) : 0;
  const open = !valid || left <= 0;
  useEffect(() => {
    if (!valid || open) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [valid, open]);
  return { parts: countdownParts(left), open, valid };
}

const UNITS: Array<[keyof Omit<CountdownParts, 'done'>, string]> = [['days', 'يوم'], ['hours', 'ساعة'], ['minutes', 'دقيقة'], ['seconds', 'ثانية']];

interface Props {
  opensAt: string;
  offsetMs?: number;
  /** Inline one-line form for cards. */
  compact?: boolean;
  onOpen?: () => void;
}

export const LaunchCountdown: React.FC<Props> = ({ opensAt, offsetMs = 0, compact = false, onOpen }) => {
  const { parts, open } = useLaunchClock(opensAt, offsetMs);
  const announced = useRef(false);
  useEffect(() => {
    if (open && !announced.current) { announced.current = true; onOpen?.(); }
  }, [open, onOpen]);

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5 font-black tabular-nums text-gold-300" role="timer" aria-label={countdownLabelAr(parts)}>
        <bdi dir="ltr">{parts.days > 0 ? `${parts.days}:` : ''}{String(parts.hours).padStart(2, '0')}:{String(parts.minutes).padStart(2, '0')}:{String(parts.seconds).padStart(2, '0')}</bdi>
      </span>
    );
  }
  // Days drop out once under a day, so the last day reads hours · minutes · seconds.
  const shown = UNITS.filter(([key]) => key !== 'days' || parts.days > 0);
  return (
    <div role="timer" aria-label={countdownLabelAr(parts)} className="flex items-stretch justify-center gap-2 sm:gap-3" dir="rtl">
      {shown.map(([key, label]) => (
        <div key={key} className="min-w-[3.6rem] sm:min-w-[4.4rem] rounded-2xl px-2 py-2.5 text-center bg-white/5 border border-gold-300/25">
          <div className="text-2xl sm:text-3xl font-black text-gold-300 tabular-nums leading-none"><bdi dir="ltr">{String(parts[key]).padStart(2, '0')}</bdi></div>
          <div className="text-[11px] text-slate-400 mt-1.5">{label}</div>
        </div>
      ))}
    </div>
  );
};

/** «الخميس 8:00 م» in Kuwait time, regardless of the visitor's timezone. */
export const formatOpening = (iso: string) =>
  new Intl.DateTimeFormat('ar-KW-u-nu-latn', { timeZone: 'Asia/Kuwait', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
