import React, { useId } from 'react';

/** Daily bars with a faint area behind them; the last bar is highlighted. Pure SVG, no library. */
export const TrendBars: React.FC<{ points: { day: string; value: number }[]; label: string; unit?: string; height?: number }> = ({ points, label, unit = '', height = 150 }) => {
  const uid = useId().replace(/:/g, '');
  const max = Math.max(1, ...points.map(p => p.value));
  const w = 600, pad = 6, gap = 3, bw = (w - pad * 2 - gap * (points.length - 1)) / Math.max(1, points.length);
  const y = (v: number) => height - 18 - (v / max) * (height - 34);
  const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('ar-KW-u-nu-latn', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${w} ${height}`} role="img" aria-label={label} className="w-full h-auto overflow-visible">
        <defs><linearGradient id={`g${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d4b061" /><stop offset="1" stopColor="#d4b061" stopOpacity="0.25" /></linearGradient></defs>
        {[0.25, 0.5, 0.75, 1].map(f => <line key={f} x1={pad} x2={w - pad} y1={y(max * f)} y2={y(max * f)} stroke="currentColor" strokeOpacity="0.08" strokeDasharray="3 5" />)}
        {points.map((p, i) => {
          const x = pad + i * (bw + gap), top = y(p.value), last = i === points.length - 1;
          return (
            <g key={p.day}>
              <rect x={x} y={top} width={bw} height={Math.max(2, height - 18 - top)} rx={Math.min(4, bw / 2)} fill={last ? '#34d399' : `url(#g${uid})`}>
                <title>{`${fmt(p.day)}: ${p.value.toLocaleString('ar-KW-u-nu-latn')}${unit}`}</title>
              </rect>
            </g>
          );
        })}
        <text x={pad} y={height - 3} fontSize="11" fill="currentColor" fillOpacity="0.55">{points[0] ? fmt(points[0].day) : ''}</text>
        <text x={w - pad} y={height - 3} fontSize="11" textAnchor="end" fill="currentColor" fillOpacity="0.55">{points.at(-1) ? fmt(points.at(-1)!.day) : ''}</text>
        <text x={w - pad} y={11} fontSize="11" textAnchor="end" fill="currentColor" fillOpacity="0.55">{max.toLocaleString('ar-KW-u-nu-latn')}</text>
      </svg>
    </figure>
  );
};

/** Horizontal share bars: the figure that reads fastest when there are 4–7 categories. */
export const ShareBars: React.FC<{ rows: { key: string; label: string; value: number; tone?: string }[]; unit?: string }> = ({ rows, unit = '' }) => {
  const total = Math.max(1, rows.reduce((a, r) => a + r.value, 0));
  const max = Math.max(1, ...rows.map(r => r.value));
  return (
    <ul className="space-y-2.5 m-0 p-0 list-none">
      {rows.map(r => (
        <li key={r.key} className="space-y-1">
          <div className="flex justify-between gap-3 text-xs"><span className="font-bold truncate">{r.label}</span><span className="text-slate-400 shrink-0">{r.value.toLocaleString('ar-KW-u-nu-latn')}{unit} · {Math.round((r.value / total) * 100).toLocaleString('ar-KW-u-nu-latn')}%</span></div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className={`h-full rounded-full ${r.tone ?? 'bg-gold-400'}`} style={{ width: `${Math.max(3, (r.value / max) * 100)}%` }} /></div>
        </li>
      ))}
    </ul>
  );
};

/** Seven weekday columns (Sunday first); the busiest one is picked out. */
export const WeekdayBars: React.FC<{ values: number[] }> = ({ values }) => {
  const names = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const short = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
  const max = Math.max(1, ...values);
  const top = values.indexOf(Math.max(...values));
  return (
    <div className="flex items-end gap-2 h-28" role="img" aria-label="الزيارات حسب أيام الأسبوع">
      {values.map((v, i) => (
        <div key={names[i]} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
          <div className={`w-full rounded-t-lg ${i === top && v > 0 ? 'bg-emerald-400' : 'bg-gold-400/60'}`} style={{ height: `${Math.max(4, (v / max) * 78)}%` }} title={`${names[i]}: ${v.toLocaleString('ar-KW-u-nu-latn')}`} />
          <span className="text-[10px] text-slate-400 leading-none">{short[i]}</span>
        </div>
      ))}
    </div>
  );
};
