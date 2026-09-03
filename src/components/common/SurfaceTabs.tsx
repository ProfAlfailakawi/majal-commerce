import React from 'react';

export type SurfaceTone = 'gold' | 'sky' | 'fuchsia' | 'emerald';

export interface SurfaceTab<T extends string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
  /** Rendered as a badge rather than baked into the label text. */
  count?: number;
}

interface SurfaceTabsProps<T extends string> {
  tabs: SurfaceTab<T>[];
  active: T;
  /** NoInfer: a React setter's SetStateAction would otherwise widen T to `string`. */
  onChange: (id: NoInfer<T>) => void;
  /** Each surface owns a tone in the design system; the structure is shared, not the colour. */
  tone?: SurfaceTone;
  label: string;
}

const activeTone: Record<SurfaceTone, string> = {
  gold: 'bg-gold-500 text-slate-950',
  sky: 'bg-sky-400 text-slate-950',
  fuchsia: 'bg-fuchsia-300 text-slate-950',
  emerald: 'bg-emerald-400 text-slate-950'
};

const countTone: Record<SurfaceTone, string> = {
  gold: 'bg-gold-500/15 text-gold-200 border-gold-300/25',
  sky: 'bg-sky-500/15 text-sky-200 border-sky-400/25',
  fuchsia: 'bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-400/25',
  emerald: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/25'
};

/**
 * Portal navigation.
 *
 * Four portals had four hand-rolled versions of this row: different paddings, different
 * weights, some with icons and some without, counts spliced into the label as «منتجاتي (3)»,
 * and none of them exposing tab semantics — so a screen reader announced six unrelated
 * buttons instead of one tab set with a current selection.
 *
 * Structure and behaviour are shared here; the accent stays per-surface, because that
 * colour is how the design system signals which layer of the product you are standing in.
 */
export function SurfaceTabs<T extends string>({ tabs, active, onChange, tone = 'gold', label }: SurfaceTabsProps<T>) {
  const onKeyDown = (event: React.KeyboardEvent) => {
    const index = tabs.findIndex(t => t.id === active);
    // RTL: ArrowLeft advances, matching the direction the row is read.
    const next = event.key === 'ArrowLeft' ? index + 1 : event.key === 'ArrowRight' ? index - 1 : null;
    if (next === null) return;
    event.preventDefault();
    onChange(tabs[(next + tabs.length) % tabs.length].id);
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="flex gap-2 overflow-x-auto no-scrollbar border-b border-white/10 pb-3"
    >
      {tabs.map(tab => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={`px-4 py-2.5 rounded-xl whitespace-nowrap text-xs font-bold flex items-center gap-2 transition-colors ${
              isActive ? activeTone[tone] : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-slate-100'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {typeof tab.count === 'number' && (
              <span
                className={`min-w-5 px-1.5 h-5 grid place-items-center rounded-full border text-[10px] font-black tabular-nums ${
                  isActive ? 'bg-slate-950/15 text-slate-950 border-slate-950/15' : countTone[tone]
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
