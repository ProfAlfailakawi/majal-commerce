import React, { useId } from 'react';
import { drawOptions, useDrawIn } from '../dna/useDrawIn';

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
  /** When given, each legend chip also shows its value and share (display only). */
  formatValue?: (value: number) => React.ReactNode;
  /** Opt-in: arcs draw one after another, once (string = playKey). */
  draw?: boolean | string;
}

/**
 * Presentation-only donut: arcs are value/total of numbers the screen already shows.
 * It never computes money — it only draws the proportions it is given.
 */
export const ShareDonut: React.FC<ShareDonutProps> = ({ segments, total, size = 112, stroke = 14, ariaLabel, icon, centerValue, centerLabel, legendBeside, formatValue, draw }) => {
  const drawProps = useDrawIn(drawOptions(draw));
  const maskId = useId();
  const sum = total && total > 0 ? total : segments.reduce((acc, s) => acc + Math.max(0, s.value), 0);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const mid = size / 2;
  let offset = 0;
  return (
    <div className={`flex flex-wrap items-center gap-x-6 gap-y-3 w-full ${legendBeside ? 'justify-start' : 'justify-center'} ${formatValue ? 'gap-x-10 max-w-xl mx-auto rounded-2xl border border-white/10 bg-white/[0.03] p-5' : ''}`}>
      <div ref={drawProps.ref as React.Ref<HTMLDivElement>} data-draw={drawProps['data-draw']} role="img" aria-label={centerValue !== undefined ? `${ariaLabel}، الإجمالي ${centerValue}${centerLabel ? ' ' + centerLabel : ''}` : ariaLabel} className="relative shrink-0" style={{ inlineSize: size, blockSize: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="-rotate-90">
          <defs>
            {/* One sweep over the whole ring (a single transition on the shared curve) instead of one eased
                transition per slice, which read as stop-and-go. At rest the mask is a full circle. */}
            <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={size} height={size}>
              <circle cx={mid} cy={mid} r={r} fill="none" stroke="white" strokeWidth={stroke + 2} strokeDasharray={`${c + 2} ${c + 2}`} className="dna-draw-arc" style={{ ['--draw-dur' as string]: '900ms' } as React.CSSProperties} />
            </mask>
          </defs>
          <circle cx={mid} cy={mid} r={r} fill="none" strokeWidth={stroke} className="stroke-white/10" />
          <g mask={`url(#${maskId})`}>
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
          </g>
        </svg>
        {centerValue !== undefined && <div className="absolute inset-0 flex flex-col items-center justify-center leading-tight text-center" aria-hidden="true"><span className="text-lg font-black font-mono text-slate-100">{centerValue}</span>{centerLabel && <span className="text-xs text-slate-400">{centerLabel}</span>}</div>}
        {icon && <div className="absolute inset-0 flex items-center justify-center text-slate-400" aria-hidden="true">{icon}</div>}
      </div>
      <ul className={`flex gap-2 text-xs text-slate-300 ${legendBeside ? 'flex-col items-start' : formatValue ? 'flex-col items-stretch min-w-[14rem]' : 'flex-wrap justify-center'}`}>
        {segments.map(seg => (
          <li key={seg.key} className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/5 border border-white/10"><span aria-hidden="true" className={`w-2.5 h-2.5 rounded-full ${seg.dotClass}`} /><span className="flex-1">{seg.label}</span>{formatValue && <span className="font-mono tabular-nums text-slate-100 ms-3">{formatValue(seg.value)}</span>}{formatValue && sum > 0 && <span className="font-mono tabular-nums text-slate-400 min-w-[2.75rem] text-end">{Math.round(Math.max(0, seg.value) / sum * 100)}%</span>}</li>
        ))}
      </ul>
    </div>
  );
};
