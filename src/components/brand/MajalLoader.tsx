import React, { useEffect, useState } from 'react';

/**
 * Shows `true` only after `delayMs` — used so loaders never flash for
 * operations that finish in under ~250ms.
 */
export const useDelayedVisible = (delayMs = 250) => {
  const [visible, setVisible] = useState(delayMs <= 0);
  useEffect(() => {
    if (delayMs <= 0) return;
    const timer = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs]);
  return visible;
};

interface MajalLoaderProps {
  /** 16 in buttons, 24–32 in cards/controls, 32–48 in panels. */
  size?: 16 | 20 | 24 | 32 | 40 | 48;
  /** Screen-reader status label (Arabic). */
  label?: string;
  /** Delay before painting; the box always reserves its space. */
  delayMs?: number;
  className?: string;
}

/**
 * MAJAL micro loader: the four platform pieces (ابتكار/حماية/إنتاج/إطلاق)
 * converge ONCE into a seed at the center, then only the seed breathes.
 * CSS-driven (transform + opacity), inherits `currentColor`, respects
 * prefers-reduced-motion (assembled shape with a gentle opacity pulse).
 */
export const MajalLoader: React.FC<MajalLoaderProps> = ({
  size = 24,
  label = 'جاري المعالجة…',
  delayMs = 250,
  className = ''
}) => {
  const shown = useDelayedVisible(delayMs);
  // Scatter distance: each piece starts outward from its final rosette spot.
  const d = Math.max(6, Math.round(size * 0.3));
  const leaf = (
    pos: React.CSSProperties,
    vars: { sx: number; sy: number; r: string },
    extra: string
  ) => (
    <i
      aria-hidden="true"
      className={`ml-leaf ${extra}`}
      style={{ ...pos, '--sx': `${vars.sx}px`, '--sy': `${vars.sy}px`, '--r': vars.r } as React.CSSProperties}
    />
  );

  return (
    <span
      role="status"
      aria-live="polite"
      className={`majal-loader ${shown ? 'ml-shown' : 'ml-delayed'} ${className}`}
      style={{ width: size, height: size }}
    >
      <span className="sr-only">{label}</span>
      {leaf({ left: '6%', top: '16%' }, { sx: -d, sy: -d, r: '-30deg' }, 'ml-l1')}
      {leaf({ right: '6%', top: '16%' }, { sx: d, sy: -d, r: '30deg' }, 'ml-l2')}
      {leaf({ left: '6%', bottom: '16%' }, { sx: -d, sy: d, r: '30deg' }, 'ml-l3')}
      {leaf({ right: '6%', bottom: '16%' }, { sx: d, sy: d, r: '-30deg' }, 'ml-l4')}
      <i aria-hidden="true" className="ml-seed" />
    </span>
  );
};
