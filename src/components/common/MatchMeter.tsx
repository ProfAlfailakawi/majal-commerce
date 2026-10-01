import React from 'react';
import { Info } from 'lucide-react';

export interface MatchBar { label: string; value: number }

/** Score as a thin ring with the number kept in the middle. Pure display of an existing value. */
export const ScoreRing: React.FC<{ value: number; caption?: string; suffix?: string; size?: number }> = ({ value, caption, suffix = '', size = 56 }) => {
  const r = 22;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="relative shrink-0 grid place-items-center text-center" style={{ width: size, height: size }} role="img" aria-label={`${caption ?? ''} ${value}${suffix}`.trim()}>
      <svg viewBox="0 0 56 56" className="absolute inset-0 w-full h-full -rotate-90" aria-hidden="true">
        <circle cx="28" cy="28" r={r} fill="none" strokeWidth="3.5" className="stroke-white/10" />
        <circle cx="28" cy="28" r={r} fill="none" strokeWidth="3.5" strokeLinecap="round" className="stroke-gold-400" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      </svg>
      <span className="relative text-base font-black text-gold-300 tabular-nums leading-none">{value}{suffix}</span>
    </div>
  );
};

/** Thin labelled bars, one per fit dimension, number kept beside each. */
export const MicroBars: React.FC<{ bars: MatchBar[]; suffix?: string }> = ({ bars, suffix = '%' }) => (
  <ul className="space-y-2 text-xs">
    {bars.map(b => (
      <li key={b.label} className="grid grid-cols-[minmax(0,6.5rem)_1fr_2.75rem] items-center gap-2">
        <span className="text-slate-400 truncate">{b.label}</span>
        <span className="h-1.5 rounded-full bg-white/10 overflow-hidden" aria-hidden="true">
          <span className="block h-full rounded-full bg-gold-400/80" style={{ width: `${Math.max(0, Math.min(100, b.value))}%` }} />
        </span>
        <strong className="text-slate-100 tabular-nums text-end">{b.value}{suffix}</strong>
      </li>
    ))}
  </ul>
);

/** The explanation sentence stays in the page, folded behind a native disclosure. */
export const FoldedNote: React.FC<{ summary: string; children: React.ReactNode }> = ({ summary, children }) => (
  <details className="group rounded-xl bg-slate-950/45 border border-white/10 text-xs">
    <summary className="cursor-pointer list-none flex items-center gap-1.5 px-3 py-2 text-slate-400 hover:text-slate-200 [&::-webkit-details-marker]:hidden">
      <Info className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> <span>{summary}</span>
    </summary>
    <p className="px-3 pb-3 leading-6 text-slate-400">{children}</p>
  </details>
);
