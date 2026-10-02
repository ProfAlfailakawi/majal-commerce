import React from 'react';
import { CheckCircle2, CircleAlert, Clock3, Loader, Minus, Sparkles, type LucideIcon } from 'lucide-react';
import { statusLabel, statusTone, toneClasses, type StatusTone } from '../../lib/statusLabels';

/** A small shape per tone so the state never rests on colour alone. */
const toneIcons: Record<StatusTone, LucideIcon> = {
  neutral: Minus,
  progress: Loader,
  success: CheckCircle2,
  warn: Clock3,
  danger: CircleAlert,
  gold: Sparkles
};

interface StatusPillProps {
  status: string;
  /** Prefix such as «الحالة» when the pill sits away from its subject. */
  prefix?: string;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * One badge for every state in the product.
 *
 * Before this, each surface hand-rolled its own pill, so the same state changed colour
 * between screens and several rendered the raw enum. Reading a status should never
 * require knowing which screen you are on.
 */
export const StatusPill: React.FC<StatusPillProps> = ({ status, prefix, size = 'sm', className = '' }) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full border font-black whitespace-nowrap ${
      size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-xs'
    } ${toneClasses[statusTone(status)]} ${className}`}
  >
    {React.createElement(toneIcons[statusTone(status)], { className: 'w-3 h-3 shrink-0', 'aria-hidden': true })}
    {prefix && <span className="opacity-60 font-bold">{prefix}</span>}
    {statusLabel(status)}
  </span>
);
