import React from 'react';

export interface ShareSegment {
  key: string;
  label: string;
  value: number;
  /** Tailwind stroke class (project colour token), e.g. `stroke-gold-400`. */
  strokeClass: string;
  /** Tailwind background class for the legend dot. */
  dotClass: string;
}

interface ShareDonutProps {
  segments: ShareSegment[];
  /** Denominator for the arcs. Defaults to the sum of the segments. */
  total?: number;
  size?: number;
  stroke?: number;
  ariaLabel: string;
  icon?: React.ReactNode;
}

/**
 * Presentation-only donut: arcs are value/total of numbers the screen already shows.
 * It never computes money — it only draws the proportions it is given.
 */
export const ShareDonut: React.FC<ShareDonutProps> = ({ segments, total, size = 112, stroke = 14, ariaLabel, icon }) => {
  const sum = total && total > 0 ? total : segments.reduce((acc, s) => acc + Math.max(0, s.value), 0);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const mid = size / 2;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div role="img" aria-label={ariaLabel} className="relative shrink-0" style={{ inlineSize: size, blockSize: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="-rotate-90 rtl:scale-x-[-1]">
          <circle cx={mid} cy={mid} r={r} fill="none" strokeWidth={stroke} className="stroke-white/10" />
          {sum > 0 && segments.map(seg => {
            const len = (Math.max(0, seg.value) / sum) * c;
            const node = len > 0 ? (
              <circle
                key={seg.key}
                cx={mid}
                cy={mid}
                r={r}
                fill="none"
                strokeWidth={stroke}
                strokeDasharray={`${Math.max(0, len - 1.5)} ${c}`}
                strokeDashoffset={-offset}
                className={seg.strokeClass}
              />
            ) : null;
            offset += len;
            return node;
          })}
        </svg>
        {icon && <div className="absolute inset-0 flex items-center justify-center text-slate-400" aria-hidden="true">{icon}</div>}
      </div>
      <ul className="space-y-1.5 text-xs text-slate-300">
        {segments.map(seg => (
          <li key={seg.key} className="flex items-center gap-2"><span aria-hidden="true" className={`w-2.5 h-2.5 rounded-full ${seg.dotClass}`} />{seg.label}</li>
        ))}
      </ul>
    </div>
  );
};
