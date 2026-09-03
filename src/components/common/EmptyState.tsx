import React from 'react';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  /** Why it is empty, in the user's terms — not "no data". */
  body: string;
  action?: { label: string; onClick: () => void };
  /** `panel` for a full section, `inline` for a slot inside an existing card. */
  variant?: 'panel' | 'inline';
  className?: string;
}

/**
 * The empty state.
 *
 * The design system already required every production workflow to own an Empty state
 * that explains itself and offers the next step, but most surfaces shipped a single
 * grey sentence in the middle of a large panel — which tells the user nothing about
 * whether something is broken, still loading, or simply not started yet.
 *
 * An icon that matches the section, a reason, and a way forward when one exists.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  body,
  action,
  variant = 'panel',
  className = ''
}) => (
  <div
    className={`text-center ${
      variant === 'panel'
        ? 'glass-card rounded-3xl border border-white/10 px-6 py-12'
        : 'rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 py-9'
    } ${className}`}
  >
    <span
      aria-hidden="true"
      className="w-14 h-14 mx-auto rounded-2xl bg-white/[0.04] border border-white/10 grid place-items-center text-slate-500"
    >
      {icon}
    </span>
    <h4 className="mt-4 text-sm font-black text-slate-200">{title}</h4>
    <p className="mt-2 text-xs text-slate-400 leading-6 max-w-sm mx-auto">{body}</p>
    {action && (
      <button
        onClick={action.onClick}
        className="mt-5 px-5 py-2.5 rounded-xl bg-gold-500 hover:bg-gold-400 text-slate-950 text-xs font-black transition-colors"
      >
        {action.label}
      </button>
    )}
  </div>
);
