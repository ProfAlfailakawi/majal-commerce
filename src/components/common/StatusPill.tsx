import React from 'react';
import { statusLabel, statusTone, toneClasses } from '../../lib/statusLabels';

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
      size === 'sm' ? 'px-2.5 py-1 text-[10px]' : 'px-3 py-1.5 text-[11px]'
    } ${toneClasses[statusTone(status)]} ${className}`}
  >
    {prefix && <span className="opacity-60 font-bold">{prefix}</span>}
    {statusLabel(status)}
  </span>
);
