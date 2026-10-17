import React, { useId } from 'react';
import { Coffee, CookingPot, Croissant, Factory, Globe, Package, Scissors, ShoppingBag, Store, Utensils } from 'lucide-react';
import type { BusinessSector } from '../../types/majal';
import { SECTORS } from './sectors';

const ICONS: Record<BusinessSector, React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
  CAFE: Coffee, RESTAURANT: Utensils, BAKERY: Croissant, CLOUD_KITCHEN: CookingPot, RETAIL: Store,
  ONLINE_STORE: Globe, SALON: Scissors, SERVICES: ShoppingBag, PRODUCTION: Factory, OTHER: Package,
};

/**
 * Platform-drawn artwork for a listing. Sellers never upload images here: the picture is
 * derived from the sector, so every card reads as one family and nobody can pass off a
 * misleading photograph as the business.
 */
export const SectorArt: React.FC<{ sector: BusinessSector; className?: string; seed?: string }> = ({ sector, className = '', seed = '' }) => {
  const meta = SECTORS[sector] ?? SECTORS.OTHER;
  const Icon = ICONS[sector] ?? Package;
  const uid = useId().replace(/:/g, '');
  // Deterministic jitter so two listings of one sector still differ.
  const n = [...seed].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const cx = 60 + (n % 80), cy = 30 + ((n >> 3) % 40), r = 70 + ((n >> 5) % 50);
  return (
    <div className={`relative overflow-hidden ${className}`} aria-hidden="true">
      <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full">
        <defs>
          <linearGradient id={`g${uid}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={meta.from} /><stop offset="1" stopColor={meta.to} /></linearGradient>
          <radialGradient id={`r${uid}`} cx="0.5" cy="0.45" r="0.6"><stop offset="0" stopColor={meta.glow} stopOpacity="0.55" /><stop offset="1" stopColor={meta.glow} stopOpacity="0" /></radialGradient>
          <pattern id={`p${uid}`} width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="28" height="28" fill="none" /><path d="M0 14h28M14 0v28" stroke="#fff" strokeOpacity="0.07" strokeWidth="1.5" />
            <rect x="11" y="11" width="6" height="6" fill="#fff" fillOpacity="0.07" />
          </pattern>
        </defs>
        <rect width="400" height="200" fill={`url(#g${uid})`} />
        <rect width="400" height="200" fill={`url(#p${uid})`} />
        <circle cx={cx * 3} cy={cy * 3} r={r} fill={meta.glow} fillOpacity="0.10" />
        <circle cx={400 - cx} cy={200 - cy} r={r * 0.6} fill="#fff" fillOpacity="0.06" />
        <rect width="400" height="200" fill={`url(#r${uid})`} />
        <path d="M0 168 Q100 140 200 164 T400 150 V200 H0Z" fill="#000" fillOpacity="0.18" />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="w-16 h-16 rounded-3xl grid place-items-center bg-white/15 border border-white/30 backdrop-blur-sm shadow-lg">
          <Icon className="w-8 h-8 text-white" aria-hidden={true} />
        </span>
      </div>
    </div>
  );
};
