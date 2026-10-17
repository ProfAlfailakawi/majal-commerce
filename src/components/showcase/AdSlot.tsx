import React, { useEffect, useRef, useState } from 'react';
import { Gift, CreditCard, Leaf, Megaphone, Package, Printer, ShoppingBag, Sparkles, Store, Truck, Coffee, Utensils, ExternalLink } from 'lucide-react';
import { adClickHref, fetchAds, noteDemoAdClick, reportAdImpression } from '../../lib/showcaseClient';
import type { AdAccent, AdSlot as AdSlotType, PublicAd } from '../../types/majal';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  megaphone: Megaphone, store: Store, coffee: Coffee, truck: Truck, package: Package, sparkles: Sparkles,
  utensils: Utensils, 'shopping-bag': ShoppingBag, printer: Printer, 'credit-card': CreditCard, leaf: Leaf, gift: Gift,
};
const TONES: Record<AdAccent, { chip: string; text: string; ring: string }> = {
  gold: { chip: 'bg-gold-500/12 border-gold-300/30', text: 'text-gold-300', ring: 'hover:border-gold-300/50' },
  emerald: { chip: 'bg-emerald-500/12 border-emerald-400/30', text: 'text-emerald-300', ring: 'hover:border-emerald-400/50' },
  sky: { chip: 'bg-sky-500/12 border-sky-400/30', text: 'text-sky-300', ring: 'hover:border-sky-400/50' },
  rose: { chip: 'bg-rose-500/12 border-rose-400/30', text: 'text-rose-300', ring: 'hover:border-rose-400/50' },
  violet: { chip: 'bg-violet-500/12 border-violet-400/30', text: 'text-violet-300', ring: 'hover:border-violet-400/50' },
};

/** Counts one impression per browser session, and only once the card is at least half on screen for a second. */
const seen = new Set<string>();
function useImpression(id: string) {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || seen.has(id) || typeof IntersectionObserver === 'undefined') return;
    let timer = 0;
    const observer = new IntersectionObserver(([entry]) => {
      window.clearTimeout(timer);
      if (entry?.isIntersecting && entry.intersectionRatio >= 0.5 && document.visibilityState === 'visible') {
        timer = window.setTimeout(() => { if (!seen.has(id)) { seen.add(id); reportAdImpression(id); } observer.disconnect(); }, 1000);
      }
    }, { threshold: [0.5] });
    observer.observe(node);
    return () => { window.clearTimeout(timer); observer.disconnect(); };
  }, [id]);
  return ref;
}

const AdCard: React.FC<{ ad: PublicAd; compact?: boolean }> = ({ ad, compact }) => {
  const ref = useImpression(ad.id);
  const tone = TONES[ad.accent] ?? TONES.gold;
  const Icon = ICONS[ad.icon] ?? Megaphone;
  return (
    <a ref={ref} href={adClickHref(ad.id)} target="_blank" rel="sponsored noopener noreferrer" onClick={() => noteDemoAdClick(ad.id)}
      className={`group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] ${compact ? 'px-3 py-2' : 'p-4'} transition ${tone.ring} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300 min-w-0`}>
      <span className={`shrink-0 grid place-items-center rounded-xl border ${tone.chip} ${compact ? 'w-9 h-9' : 'w-11 h-11'}`}><Icon className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} ${tone.text}`} /></span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-xs">
          <span className="px-1.5 py-0.5 rounded-md bg-white/10 text-slate-300 font-black shrink-0">إعلان</span>
          <span className={`font-black truncate ${tone.text}`}>{ad.company}</span>
        </span>
        <strong className={`block text-slate-100 leading-6 ${compact ? 'text-xs truncate' : 'text-sm mt-1'}`}>{ad.headline}</strong>
        {!compact && ad.tagline && <span className="block text-xs text-slate-300 leading-5 mt-0.5 line-clamp-2">{ad.tagline}</span>}
      </span>
      <ExternalLink className="w-4 h-4 text-slate-400 shrink-0 opacity-60 group-hover:opacity-100" aria-hidden="true" />
    </a>
  );
};

/**
 * Sponsor placement. Renders nothing at all while there is nothing live, so an empty slot
 * never leaves a hole. Every card is labelled «إعلان» and links to the approved target only.
 */
export const AdSlot: React.FC<{ slot: AdSlotType; className?: string }> = ({ slot, className = '' }) => {
  const [ads, setAds] = useState<PublicAd[]>([]);
  useEffect(() => {
    let live = true;
    fetchAds(slot).then(r => { if (live) setAds(r.ads); }).catch(() => { if (live) setAds([]); });
    return () => { live = false; };
  }, [slot]);
  if (!ads.length) return null;
  if (slot === 'SPONSOR') {
    const ad = ads[0];
    return <div className={`w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-3 ${className}`}><AdCard ad={ad} compact /></div>;
  }
  return (
    <aside aria-label="إعلانات الشركاء" className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-3 ${className}`}>
      {ads.map(ad => <AdCard key={ad.id} ad={ad} compact={slot === 'PORTAL'} />)}
    </aside>
  );
};
