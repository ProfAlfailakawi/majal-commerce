import React from 'react';

/** Display-only micro-visuals drawn from numbers a screen already has. No state, no behaviour. */

export interface Seg { value: number; className: string; label?: string }

/** Thin segmented bar. Segments share the width in proportion to value; `total` (optional) pads the rest.
 *  `legend` adds a visible text key (colour dot + label + count) so colour is never the only explanation. */
export const SegBar: React.FC<{ segs: Seg[]; total?: number; className?: string; height?: number; label?: string; legend?: boolean }> = ({ segs, total, className = '', height = 6, label, legend = false }) => {
  const sum = total ?? segs.reduce((a, s) => a + Math.max(0, s.value), 0);
  const bar = (
    <div role="img" aria-label={label} className={`flex w-full overflow-hidden rounded-full bg-white/10 gap-px ${className}`} style={{ height }}>
      {sum > 0 && segs.filter(s => s.value > 0).map((s, i) => <span key={i} title={s.label} className={`${s.className} h-full`} style={{ width: `${(s.value / sum) * 100}%` }} />)}
    </div>
  );
  if (!legend) return bar;
  return (
    <div className="space-y-1.5">
      {bar}
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
        {segs.filter(s => s.label && s.value > 0).map((s, i) => (
          <li key={i} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`w-2 h-2 rounded-full ${s.className}`} />{s.label} <bdi className="font-mono text-slate-300">{s.value}</bdi></li>
        ))}
      </ul>
    </div>
  );
};

/** Single-value ring (0..1) with the number centred. */
export const MiniRing: React.FC<{ value: number; size?: number; stroke?: number; className?: string; children?: React.ReactNode }> = ({ value, size = 44, stroke = 5, className = 'text-gold-400', children }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <span className={`relative inline-grid place-items-center shrink-0 ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * v} ${c}`} />
      </svg>
      {children !== undefined && <span className="absolute inset-0 grid place-items-center text-xs font-black tabular-nums text-slate-100">{children}</span>}
    </span>
  );
};

/** Dot with three states: none / partial / full. */
export const StateDot: React.FC<{ have: number; of: number; title?: string }> = ({ have, of, title }) => {
  const state = have <= 0 ? 'none' : have >= of ? 'full' : 'part';
  return (
    <span title={title} className={`inline-block w-3.5 h-3.5 rounded-full border ${state === 'full' ? 'bg-gold-400 border-gold-300' : state === 'part' ? 'border-gold-400 bg-gradient-to-t from-gold-400 from-50% to-transparent to-50%' : 'border-white/20 bg-transparent'}`} />
  );
};
