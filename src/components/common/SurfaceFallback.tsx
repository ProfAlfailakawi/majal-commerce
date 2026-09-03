import React from 'react';

// A structural skeleton — not a bare "loading…" line — so a surface switch reads as
// a live workspace assembling itself rather than a frozen screen. Shapes mirror the
// real layout every portal renders: a hero band, a metric strip, then content cards.
const shimmer =
  'relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full ' +
  'before:animate-[surface-shimmer_1.4s_infinite] ' +
  'before:bg-gradient-to-l before:from-transparent before:via-white/[0.06] before:to-transparent';

const Block: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`rounded-2xl bg-white/[0.04] border border-white/10 ${shimmer} ${className}`} />
);

export const SurfaceFallback = () => (
  <div
    role="status"
    aria-live="polite"
    className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-6 animate-in fade-in duration-300"
  >
    <span className="sr-only">جاري تحميل مساحة العمل…</span>

    {/* Hero band */}
    <Block className="h-40 sm:h-44" />

    {/* Metric strip */}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Block className="h-24" />
      <Block className="h-24" />
      <Block className="h-24" />
      <Block className="h-24" />
    </div>

    {/* Content cards */}
    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
      <Block className="h-56" />
      <Block className="h-56" />
      <Block className="h-56" />
    </div>

    <style>{`
      @keyframes surface-shimmer { 100% { transform: translateX(100%); } }
      @media (prefers-reduced-motion: reduce) {
        .before\\:animate-\\[surface-shimmer_1\\.4s_infinite\\]::before { animation: none; }
      }
    `}</style>
  </div>
);
