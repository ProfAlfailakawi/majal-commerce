/*
 * DNA kit — calm infographic primitives (stepper, timeline, status header,
 * ring, living hub map, icon tile, pills, segmented switcher, stat tile,
 * sparkline, heat strip, empty state). Presentation only: every component is
 * driven by props the host already has; none of them fetches or mutates data.
 */
import * as React from 'react';
import './dna.css';

export type DnaTone =
  | 'accent'
  | 'mint'
  | 'amber'
  | 'indigo'
  | 'coral'
  | 'lilac'
  | 'sky'
  | 'sand'
  | 'slate'
  | 'warn'
  | 'danger'
  | 'info'
  | 'neutral';

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

const isLatin = (node: React.ReactNode) => typeof node === 'string' && /^[\x20-\x7E]+$/.test(node);

function CheckGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/* ---------------------------------------------------------------- tile */

export interface DnaIconTileProps {
  icon: React.ReactNode;
  tone?: DnaTone;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  badge?: React.ReactNode;
  label?: string;
  className?: string;
}

export function DnaIconTile({ icon, tone = 'accent', size = 'md', badge, label, className }: DnaIconTileProps) {
  return (
    <span
      className={cx('dna', 'dna-tile', className)}
      data-dna-tone={tone}
      data-size={size}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {icon}
      {badge != null && badge !== false && <span className="dna-tileb">{badge}</span>}
    </span>
  );
}

/* --------------------------------------------------------------- pills */

export function DnaLive({ on = true, label, className }: { on?: boolean; label: React.ReactNode; className?: string }) {
  return (
    <span className={cx('dna', 'dna-live', className)} data-on={on ? 'true' : 'false'}>
      <i aria-hidden="true" />
      {label}
    </span>
  );
}

export function DnaCount({
  value,
  icon,
  label,
  className,
}: {
  value: React.ReactNode;
  icon?: React.ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <span className={cx('dna', 'dna-count', className)} title={label} aria-label={label ? `${label}: ${String(value)}` : undefined}>
      {icon}
      {value}
    </span>
  );
}

/* ------------------------------------------------------------- stepper */

export type DnaStepState = 'done' | 'current' | 'pending' | 'returned' | 'blocked';

export interface DnaStep {
  key: string;
  label: React.ReactNode;
  state: DnaStepState;
  icon?: React.ReactNode;
  /** Initials drawn as a signature stamp when the step is done. */
  stamp?: string;
  badge?: React.ReactNode;
  title?: string;
}

const DEFAULT_STATE_TEXT: Record<DnaStepState, string> = {
  done: 'مكتملة',
  current: 'الحالية',
  pending: 'لاحقة',
  returned: 'مُرجَعة',
  blocked: 'متوقفة',
};

export interface DnaStepperProps {
  steps: DnaStep[];
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showLabels?: boolean;
  ariaLabel?: string;
  stateText?: Partial<Record<DnaStepState, string>>;
  className?: string;
}

export function DnaStepper({ steps, size = 'md', showLabels = true, ariaLabel, stateText, className }: DnaStepperProps) {
  const text = { ...DEFAULT_STATE_TEXT, ...stateText };
  const labels = showLabels && size !== 'xs';
  return (
    <ol className={cx('dna', 'dna-steps', className)} data-size={size} aria-label={ariaLabel}>
      {steps.map((step, i) => {
        const prev = i > 0 ? steps[i - 1] : null;
        const link = !prev ? 'none' : step.state === 'returned' ? 'returned' : prev.state === 'done' ? 'done' : 'pending';
        const stamped = Boolean(step.stamp) && step.state === 'done';
        return (
          <li
            key={step.key}
            className="dna-stepi"
            data-state={step.state}
            data-link={link}
            data-stamp={stamped ? 'true' : undefined}
            aria-current={step.state === 'current' ? 'step' : undefined}
            title={step.title ?? (size === 'xs' && typeof step.label === 'string' ? step.label : undefined)}
          >
            <span className="dna-node" aria-hidden="true">
              {stamped ? (
                <span className="dna-stamp">{step.stamp}</span>
              ) : step.icon ? (
                step.icon
              ) : step.state === 'done' ? (
                <CheckGlyph />
              ) : (
                <span className="dna-num">{i + 1}</span>
              )}
              {stamped && (
                <span className="dna-ok">
                  <CheckGlyph />
                </span>
              )}
              {step.badge != null && step.badge !== false && <span className="dna-bdg">{step.badge}</span>}
            </span>
            <span className={labels ? 'dna-lbl' : 'dna-sr'}>{step.label}</span>
            <span className="dna-sr">{text[step.state]}</span>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------ timeline */

export interface DnaEvent {
  key: string;
  title: React.ReactNode;
  icon?: React.ReactNode;
  tone?: DnaTone;
  date?: React.ReactNode;
  meta?: React.ReactNode;
}

export function DnaTimeline({
  items,
  ariaLabel,
  maxHeight,
  wrapMeta = false,
  className,
}: {
  items: DnaEvent[];
  ariaLabel?: string;
  maxHeight?: number | string;
  wrapMeta?: boolean;
  className?: string;
}) {
  return (
    <ol
      className={cx('dna', 'dna-tline', className)}
      aria-label={ariaLabel}
      data-wrap={wrapMeta ? 'true' : undefined}
      style={maxHeight != null ? { maxHeight, overflowY: 'auto' } : undefined}
    >
      {items.map((item) => (
        <li key={item.key} className="dna-tli" data-dna-tone={item.tone ?? 'accent'}>
          <span className="dna-dot" aria-hidden="true">
            {item.icon ?? <span className="dna-pip" />}
          </span>
          <div className="dna-tbody">
            <div className="dna-tttl">
              <span className="dna-tt">{item.title}</span>
              {item.date != null && item.date !== false && <span className="dna-date">{item.date}</span>}
            </div>
            {item.meta != null && item.meta !== false && <div className="dna-meta">{item.meta}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------- status header */

export interface DnaStatusHeaderProps {
  icon: React.ReactNode;
  title: React.ReactNode;
  tone?: DnaTone;
  subtitle?: React.ReactNode;
  /** Existing buttons of the screen (keep their handlers); style with dna-btnp / dna-ibtn. */
  actions?: React.ReactNode;
  children?: React.ReactNode;
  divider?: 'solid' | 'dashed';
  headingLevel?: 2 | 3 | 4;
  className?: string;
  as?: 'section' | 'div' | 'header';
}

export function DnaStatusHeader({
  icon,
  title,
  tone = 'accent',
  subtitle,
  actions,
  children,
  divider = 'solid',
  headingLevel = 3,
  className,
  as = 'section',
}: DnaStatusHeaderProps) {
  const Root = as as React.ElementType;
  const Heading = `h${headingLevel}` as React.ElementType;
  return (
    <Root className={cx('dna', 'dna-head', className)} data-divider={divider}>
      <div className="dna-headrow">
        <DnaIconTile icon={icon} tone={tone} size="md" />
        <div className="dna-headtxt">
          <Heading className="dna-htitle">{title}</Heading>
          {subtitle != null && subtitle !== false && <p className="dna-hsub">{subtitle}</p>}
        </div>
        {actions != null && actions !== false && <div className="dna-headact">{actions}</div>}
      </div>
      {children != null && children !== false && <div className="dna-headbody">{children}</div>}
    </Root>
  );
}

/* ---------------------------------------------------------------- ring */

export interface DnaRingProps {
  value: number | null | undefined;
  max?: number;
  size?: number;
  stroke?: number;
  tone?: DnaTone;
  label?: React.ReactNode;
  sublabel?: React.ReactNode;
  ariaLabel?: string;
  className?: string;
}

export function DnaRing({ value, max = 100, size = 52, stroke = 4, tone = 'accent', label, sublabel, ariaLabel, className }: DnaRingProps) {
  const has = typeof value === 'number' && Number.isFinite(value) && max > 0;
  const fraction = has ? Math.min(1, Math.max(0, (value as number) / max)) : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const mid = size / 2;
  return (
    <div
      className={cx('dna', 'dna-ring', className)}
      data-dna-tone={tone}
      style={{ inlineSize: size, blockSize: size }}
      role="img"
      aria-label={ariaLabel}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="dna-ringt" cx={mid} cy={mid} r={r} fill="none" strokeWidth={stroke} strokeDasharray={has ? undefined : '3 4'} />
        {has && fraction > 0 && (
          <circle
            className="dna-ringv"
            cx={mid}
            cy={mid}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * fraction} ${c}`}
            transform={`rotate(-90 ${mid} ${mid})`}
          />
        )}
      </svg>
      <div className="dna-ringc" aria-hidden="true">
        {label ?? (has ? `${Math.round(fraction * 100)}%` : '—')}
        {sublabel != null && sublabel !== false && <small>{sublabel}</small>}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- segmented */

export interface DnaSegOption<T extends string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  count?: React.ReactNode;
  disabled?: boolean;
}

export function DnaSegmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: DnaSegOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div className={cx('dna', 'dna-seg', className)} role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          className="dna-segb"
          aria-selected={option.value === value}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          <span>{option.label}</span>
          {option.count != null && option.count !== false && <span className="dna-count">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ----------------------------------------------------- sparkline + stat */

export function DnaSpark({
  values,
  width = 96,
  height = 30,
  tone = 'accent',
  ariaLabel,
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  tone?: DnaTone;
  ariaLabel?: string;
  className?: string;
}) {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return null;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  const pad = 3;
  const pts = clean.map((v, i) => [
    pad + (i * (width - pad * 2)) / (clean.length - 1),
    height - pad - ((v - min) / span) * (height - pad * 2),
  ]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${height} L${pts[0][0].toFixed(1)},${height} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg
      className={cx('dna', 'dna-spark', className)}
      data-dna-tone={tone}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      <path className="dna-sparka" d={area} />
      <path className="dna-sparkl" d={line} />
      <circle cx={last[0]} cy={last[1]} r={2.6} />
    </svg>
  );
}

export function DnaStat({
  icon,
  tone = 'accent',
  label,
  value,
  sub,
  spark,
  className,
}: {
  icon: React.ReactNode;
  tone?: DnaTone;
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  spark?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('dna', 'dna-stat', className)}>
      <DnaIconTile icon={icon} tone={tone} size="md" />
      <div className="dna-statx">
        <span className="dna-statl">{label}</span>
        <strong className="dna-statv">{value}</strong>
        {sub}
      </div>
      {spark}
    </div>
  );
}

/* ------------------------------------------------------------ heat strip */

export function DnaHeat({
  cells,
  max,
  columns,
  tone = 'accent',
  ariaLabel,
  className,
}: {
  cells: Array<{ key: string; value: number; label?: string }>;
  max?: number;
  columns?: number;
  tone?: DnaTone;
  ariaLabel?: string;
  className?: string;
}) {
  const top = max ?? Math.max(0, ...cells.map((c) => c.value));
  return (
    <div
      className={cx('dna', 'dna-heat', className)}
      data-dna-tone={tone}
      role="img"
      aria-label={ariaLabel}
      style={{ ['--cols' as string]: columns ?? cells.length } as React.CSSProperties}
    >
      {cells.map((cell) => (
        <span
          key={cell.key}
          className="dna-heatc"
          data-zero={cell.value <= 0 ? 'true' : undefined}
          title={cell.label}
          style={{ ['--v' as string]: top > 0 ? Math.min(1, cell.value / top) : 0 } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

/* ----------------------------------------------------------- empty state */

export function DnaEmpty({
  icon,
  title,
  hint,
  action,
  tone = 'accent',
  className,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  tone?: DnaTone;
  className?: string;
}) {
  return (
    <div className={cx('dna', 'dna-void', className)} data-dna-tone={tone}>
      <div className="dna-voida" aria-hidden="true">
        <svg viewBox="0 0 116 116" width="116" height="116">
          <circle className="dna-voido2" cx="58" cy="58" r="55" />
          <circle className="dna-voido1" cx="58" cy="58" r="42" />
          <circle className="dna-voidd" cx="100" cy="30" r="3.5" />
          <circle className="dna-voidd" cx="14" cy="72" r="3" />
          <circle className="dna-voidd" cx="80" cy="104" r="2.6" />
        </svg>
        <DnaIconTile icon={icon} tone={tone} size="lg" />
      </div>
      <p className="dna-voidh">{title}</p>
      {hint != null && hint !== false && <p className="dna-voids">{hint}</p>}
      {action}
    </div>
  );
}

/* ------------------------------------------------------------- hub map */

export interface DnaHubNode {
  key: string;
  icon: React.ReactNode;
  label: React.ReactNode;
  tone?: DnaTone;
  value?: React.ReactNode;
  /** ok: normal · attention: red value badge · off: greyed tile + grey link · dashed: grey link (simulated/not configured) */
  state?: 'ok' | 'attention' | 'off' | 'dashed';
  onClick?: () => void;
  ariaLabel?: string;
  title?: string;
}

export interface DnaHubMapProps {
  center: { icon?: React.ReactNode; value?: React.ReactNode; label?: React.ReactNode; ariaLabel?: string };
  nodes: DnaHubNode[];
  live?: { on: boolean; label: React.ReactNode } | null;
  count?: { value: React.ReactNode; icon?: React.ReactNode; label?: string } | null;
  overline?: React.ReactNode;
  title?: React.ReactNode;
  action?: { icon: React.ReactNode; label: string; onClick: () => void } | null;
  spark?: React.ReactNode;
  animate?: boolean;
  ariaLabel?: string;
  minHeight?: number;
  className?: string;
}

const ORBIT_DOT_ANGLES = [205, 332, 24, 152];

export function DnaHubMap({
  center,
  nodes,
  live,
  count,
  overline,
  title,
  action,
  spark,
  animate = true,
  ariaLabel,
  minHeight,
  className,
}: DnaHubMapProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [box, setBox] = React.useState<{ w: number; rtl: boolean }>({ w: 0, rtl: true });

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const rtl = getComputedStyle(el).direction === 'rtl';
      setBox((prev) => (prev.w === w && prev.rtl === rtl ? prev : { w, rtl }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const w = box.w;
  const narrow = w > 0 && w < 520;
  const tile = narrow ? 44 : 54;
  const hub = narrow ? 66 : 84;
  const nodeW = narrow ? 92 : 116;
  const rowGap = tile + (narrow ? 32 : 36);
  const n = nodes.length;
  const startCount = Math.ceil(n / 2);
  const endCount = n - startCount;
  const rows = Math.max(startCount, 1);
  const hasCaption = Boolean(title || overline || action);
  const topPad = 56;
  const bottomPad = hasCaption ? 74 : 30;
  const inner = Math.max(hub * 2.3, rows * rowGap);
  const height = Math.max(minHeight ?? 0, topPad + bottomPad + inner);
  const mx = w / 2;
  const my = topPad + inner / 2;
  const maxOffset = ((rows - 1) / 2) * rowGap || 1;
  const rx = Math.max(hub / 2 + tile + 12, w / 2 - nodeW / 2 - (narrow ? 8 : 26));
  const startSide = box.rtl ? 1 : -1;

  const column = (count: number, side: number) =>
    Array.from({ length: count }, (_, i) => {
      const offset = (i - (count - 1) / 2) * rowGap;
      const f = offset / maxOffset;
      const bulge = 0.8 + 0.2 * Math.sqrt(Math.max(0, 1 - f * f));
      return { x: mx + side * rx * bulge, y: my + offset, side };
    });
  const points = [...column(startCount, startSide), ...column(endCount, -startSide)];

  const links = points.map((p) => {
    const sx = mx + p.side * (hub / 2 + 5);
    const sy = my + (p.y - my) * 0.2;
    const ex = p.x - p.side * (tile / 2 + 7);
    const ey = p.y;
    const dx = Math.abs(ex - sx);
    const d = `M${sx.toFixed(1)},${sy.toFixed(1)} C${(sx + p.side * dx * 0.5).toFixed(1)},${sy.toFixed(1)} ${(ex - p.side * dx * 0.5).toFixed(1)},${ey.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`;
    return { d, ex, ey };
  });

  const r1 = hub * 0.82;
  const r2 = hub * 1.2;
  const r3 = hub * 1.62;

  return (
    <div
      ref={ref}
      className={cx('dna', 'dna-hub', className)}
      data-animate={animate ? 'true' : 'false'}
      data-dir={box.rtl ? 'rtl' : 'ltr'}
      role="group"
      aria-label={ariaLabel}
      style={{ blockSize: w ? height : minHeight ?? 360, ['--tile' as string]: `${tile}px` } as React.CSSProperties}
    >
      {w > 0 && (
        <>
          <svg className="dna-hubs" width={w} height={height} viewBox={`0 0 ${w} ${height}`} aria-hidden="true">
            <circle className="dna-hubo3" cx={mx} cy={my} r={r3} />
            <circle className="dna-hubo2" cx={mx} cy={my} r={r2} />
            <circle className="dna-hubo1" cx={mx} cy={my} r={r1} />
            {links.map((link, i) => (
              <g key={nodes[i].key} data-dna-tone={nodes[i].tone ?? 'accent'}>
                <path className="dna-hubln" data-state={nodes[i].state ?? 'ok'} d={link.d} />
                <circle className="dna-hubend" data-state={nodes[i].state ?? 'ok'} cx={link.ex} cy={link.ey} r={4} />
              </g>
            ))}
            {ORBIT_DOT_ANGLES.map((deg) => {
              const a = (deg * Math.PI) / 180;
              return <circle key={deg} className="dna-hubd" cx={mx + r3 * Math.cos(a)} cy={my + r3 * Math.sin(a)} r={3.6} />;
            })}
          </svg>

          <div
            className="dna-hubc"
            style={{ inlineSize: hub, blockSize: hub, left: mx - hub / 2, top: my - hub / 2 }}
            role={center.ariaLabel ? 'img' : undefined}
            aria-label={center.ariaLabel}
          >
            {center.value != null && center.value !== false ? <span className="dna-hubcv">{center.value}</span> : center.icon}
            {center.label != null && center.label !== false && <span className="dna-hubcl">{center.label}</span>}
          </div>

          {spark && (
            <span className="dna-hubspark" style={{ left: mx - 15, top: my - r2 - 15 }} aria-hidden="true">
              {spark}
            </span>
          )}

          {nodes.map((node, i) => {
            const p = points[i];
            const style = { left: p.x - nodeW / 2, top: p.y - tile / 2, inlineSize: nodeW };
            const body = (
              <>
                <span className="dna-hubt">
                  {node.icon}
                  {node.value != null && node.value !== false && <span className="dna-hubv">{node.value}</span>}
                </span>
                <span className="dna-hubl">{node.label}</span>
              </>
            );
            return node.onClick ? (
              <button
                key={node.key}
                type="button"
                className="dna-hubn"
                data-dna-tone={node.tone ?? 'accent'}
                data-state={node.state ?? 'ok'}
                style={style}
                onClick={node.onClick}
                aria-label={node.ariaLabel}
                title={node.title}
              >
                {body}
              </button>
            ) : (
              <div
                key={node.key}
                className="dna-hubn"
                data-dna-tone={node.tone ?? 'accent'}
                data-state={node.state ?? 'ok'}
                style={style}
                aria-label={node.ariaLabel}
                title={node.title}
              >
                {body}
              </div>
            );
          })}
        </>
      )}

      {(live || count) && (
        <div className="dna-hubp">
          {live && <DnaLive on={live.on} label={live.label} />}
          {count && <DnaCount value={count.value} icon={count.icon} label={count.label} />}
        </div>
      )}

      {(overline || title) && (
        <div className="dna-hubcap">
          {overline != null && overline !== false && (
            <span className="dna-over" data-latin={isLatin(overline) ? 'true' : undefined}>
              {overline}
            </span>
          )}
          {title != null && title !== false && <strong className="dna-ttl2">{title}</strong>}
        </div>
      )}

      {action && (
        <button type="button" className="dna-hubact" onClick={action.onClick} aria-label={action.label} title={action.label}>
          {action.icon}
        </button>
      )}
    </div>
  );
}
