import React, { useId } from 'react';
import { Apple, Beef, Boxes, Leaf, Package, Printer, Truck, Utensils, Wheat } from 'lucide-react';
import type { SupplierCategory } from '../../types/majal';
import { SUPPLIER_CATEGORIES } from './sectors';

const ICONS: Record<SupplierCategory, React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
  INGREDIENTS: Wheat, PRODUCE: Apple, MEAT: Beef, SPICES: Leaf, PACKAGING: Package, PRINTING: Printer, EQUIPMENT: Utensils, DELIVERY: Truck, OTHER: Boxes,
};

/** Platform-drawn artwork per supplier category (suppliers never upload pictures here). */
export const SupplierArt: React.FC<{ category: SupplierCategory; seed?: string; className?: string }> = ({ category, seed = '', className = '' }) => {
  const meta = SUPPLIER_CATEGORIES[category] ?? SUPPLIER_CATEGORIES.OTHER;
  const Icon = ICONS[category] ?? Boxes;
  const uid = useId().replace(/:/g, '');
  const n = [...seed].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 11);
  const cx = 70 + (n % 90), cy = 30 + ((n >> 4) % 50);
  return (
    <div className={`relative overflow-hidden ${className}`} aria-hidden="true">
      <svg viewBox="0 0 400 140" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full">
        <defs>
          <linearGradient id={`g${uid}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={meta.from} /><stop offset="1" stopColor={meta.to} /></linearGradient>
          <pattern id={`p${uid}`} width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="1.6" fill="#fff" fillOpacity="0.14" /></pattern>
        </defs>
        <rect width="400" height="140" fill={`url(#g${uid})`} />
        <rect width="400" height="140" fill={`url(#p${uid})`} />
        <circle cx={cx * 3} cy={cy} r="80" fill={meta.glow} fillOpacity="0.14" />
        <circle cx={400 - cx} cy={140 - cy / 2} r="46" fill="#fff" fillOpacity="0.07" />
        <path d="M0 118 Q110 96 210 116 T400 104 V140 H0Z" fill="#000" fillOpacity="0.16" />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="w-14 h-14 rounded-2xl grid place-items-center bg-white/15 border border-white/30 backdrop-blur-sm shadow-lg"><Icon className="w-7 h-7 text-white" aria-hidden={true} /></span>
      </div>
    </div>
  );
};
