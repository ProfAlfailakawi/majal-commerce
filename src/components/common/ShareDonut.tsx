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
  /** Optional centre readout (a figure the screen already shows). */
  centerValue?: React.ReactNode;
  centerLabel?: React.ReactNode;
  /** Keep the legend beside the donut as a stacked list instead of centred chips. */
  legendBeside?: boolean;
}

/**
 * Presentation-only donut: arcs are value/total of numbers the screen already shows.
 * It never computes money — it only draws the proportions it is given.
 */
export const ShareDonut: React.FC<ShareDonutProps> = ({ segments, total, size = 112, stroke = 14, ariaLabel, icon, centerValue, centerLabel, legendBeside }) => {
  const sum = total && total > 0 ? total : segments.reduce((acc, s) => acc + Math.max(0, s.value), 0);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const mid = size / 2;
  let offset = 0;
  return (
    <div className={`flex flex-wrap items-center gap-x-6 gap-y-3 w-full ${legendBeside ? 'justify-start' : 'justify-center'}`}>
      <div role="img" aria-label={centerValue !== undefined ? `${ariaLabel}، الإجمالي ${centerValue}${centerLabel ? ' ' + centerLabel : ''}` : ariaLabel} className="relative shrink-0" style={{ inlineSize: size, blockSize: size }}>
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
        {centerValue !== undefined && <div className="absolute inset-0 flex flex-col items-center justify-center leading-tight text-center" aria-hidden="true"><span className="text-lg font-black font-mono text-slate-100">{centerValue}</span>{centerLabel && <span className="text-[11px] text-slate-400">{centerLabel}</span>}</div>}
        {icon && <div className="absolute inset-0 flex items-center justify-center text-slate-400" aria-hidden="true">{icon}</div>}
      </div>
      <ul className={`flex gap-2 text-xs text-slate-300 ${legendBeside ? 'flex-col items-start' : 'flex-wrap justify-center'}`}>
        {segments.map(seg => (
          <li key={seg.key} className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/5 border border-white/10"><span aria-hidden="true" className={`w-2.5 h-2.5 rounded-full ${seg.dotClass}`} />{seg.label}</li>
        ))}
      </ul>
    </div>
  );
};
