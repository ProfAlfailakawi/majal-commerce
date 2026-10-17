import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Gift, CreditCard, Leaf, Megaphone, Package, Printer, ShoppingBag, Sparkles, Store, Truck, Coffee, Utensils, ExternalLink, X, Tag } from 'lucide-react';
import { adClickHref, adImageSrc, fetchAds, noteDemoAdClick, reportAdImpression } from '../../lib/showcaseClient';
import { IS_DEMO_MODE } from '../../lib/runtime';
import { audienceOf, type AdAudience } from '../../lib/adAudience';
import { store } from '../../lib/store';
import type { AdAccent, AdSlot as AdSlotType, PublicAd, SurfaceType } from '../../types/majal';

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

/* ───────── per-browser politeness: a daily cap and "hide this ad" ───────── */
const DAILY_CAP = 60;
const dayKey = () => `adx:t:${new Date().toISOString().slice(0, 10)}`;
const read = (key: string) => { try { return window.localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { window.localStorage.setItem(key, value); } catch { /* storage may be blocked */ } };
const hiddenIds = (): string[] => { try { return JSON.parse(read('adx:hide') || '[]'); } catch { return []; } };
const hideAd = (id: string) => write('adx:hide', JSON.stringify([...new Set([...hiddenIds(), id])].slice(-50)));
const overCap = () => Number(read(dayKey()) || 0) >= DAILY_CAP;
const countShown = () => write(dayKey(), String(Number(read(dayKey()) || 0) + 1));

/** Counts one impression per browser session, and only once the card is at least half on screen for a second. */
const seen = new Set<string>();
function useImpression(id: string, audience: AdAudience, enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!enabled || !node || seen.has(id) || typeof IntersectionObserver === 'undefined') return;
    let timer = 0;
    const observer = new IntersectionObserver(([entry]) => {
      window.clearTimeout(timer);
      if (entry?.isIntersecting && entry.intersectionRatio >= 0.5 && document.visibilityState === 'visible') {
        timer = window.setTimeout(() => { if (!seen.has(id)) { seen.add(id); countShown(); reportAdImpression(id, audience); } observer.disconnect(); }, 1000);
      }
    }, { threshold: [0.5] });
    observer.observe(node);
    return () => { window.clearTimeout(timer); observer.disconnect(); };
  }, [id, audience, enabled]);
  return ref;
}

const AdCard: React.FC<{ ad: PublicAd; audience: AdAudience; compact?: boolean; onHide?: () => void }> = ({ ad, audience, compact, onHide }) => {
  const ref = useImpression(ad.id, audience, true);
  const tone = TONES[ad.accent] ?? TONES.gold;
  const Icon = ICONS[ad.icon] ?? Megaphone;
  return (
    <div ref={ref} className="relative group min-w-0">
      <a href={adClickHref(ad.id, audience)} target="_blank" rel="sponsored noopener noreferrer" onClick={() => noteDemoAdClick(ad.id)}
        className={`flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] ${compact ? 'px-3 py-2' : 'p-4'} pe-10 transition ${tone.ring} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300 min-w-0`}>
        {ad.hasImage && !IS_DEMO_MODE
          ? <img src={adImageSrc(ad.id)} alt="" loading="lazy" decoding="async" className={`shrink-0 rounded-xl object-cover border border-white/10 ${compact ? 'w-9 h-9' : 'w-14 h-14'}`} />
          : <span className={`shrink-0 grid place-items-center rounded-xl border ${tone.chip} ${compact ? 'w-9 h-9' : 'w-11 h-11'}`}><Icon className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} ${tone.text}`} /></span>}
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
      {onHide && <button type="button" onClick={onHide} aria-label={`إخفاء إعلان ${ad.company}`} className="absolute top-1.5 end-1.5 p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"><X className="w-3.5 h-3.5" aria-hidden="true" /></button>}
    </div>
  );
};

/* ───────── house cards: our own free gates, shown only when no sponsor fits ───────── */
interface HouseCard { id: string; title: string; body: string; go: SurfaceType; Icon: React.ComponentType<{ className?: string }> }
const HOUSE: Record<AdAudience, HouseCard> = {
  VISITOR: { id: 'house-sell', title: 'عندك مشروع تبي تبيعه؟', body: 'اعرضه مجانًا أمام جمهور مجال.', go: 'SHOWCASE', Icon: Tag },
  CONSUMER: { id: 'house-sell', title: 'عندك مشروع تبي تبيعه؟', body: 'اعرضه مجانًا أمام جمهور مجال.', go: 'SHOWCASE', Icon: Tag },
  CREATOR: { id: 'house-dir-creator', title: 'تحتاج مورد تغليف أو مكونات؟', body: 'ابحث في دليل الموردين المجاني.', go: 'DIRECTORY', Icon: Truck },
  HOST: { id: 'house-dir-host', title: 'تبحث عن مورد جديد؟', body: 'دليل الموردين المجاني: ابحث وتواصل مباشرة.', go: 'DIRECTORY', Icon: Truck },
  SUPPLIER: { id: 'house-dir-supplier', title: 'سجّل نشاطك في الدليل', body: 'اظهر لأصحاب المطابخ والمشاريع مجانًا.', go: 'DIRECTORY', Icon: Truck },
};
const HouseCardView: React.FC<{ card: HouseCard; compact?: boolean }> = ({ card, compact }) => (
  <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('majal:navigate', { detail: card.go }))}
    className={`w-full text-start flex items-center gap-3 rounded-2xl border border-dashed border-gold-300/25 bg-gold-500/[0.04] ${compact ? 'px-3 py-2' : 'p-4'} hover:border-gold-300/50 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300`}>
    <span className={`shrink-0 grid place-items-center rounded-xl border border-gold-300/25 bg-gold-500/10 ${compact ? 'w-9 h-9' : 'w-11 h-11'}`}><card.Icon className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} text-gold-300`} /></span>
    <span className="min-w-0 flex-1">
      <span className="block text-xs text-slate-400 font-black">من مجال</span>
      <strong className={`block text-slate-100 leading-6 ${compact ? 'text-xs truncate' : 'text-sm'}`}>{card.title}</strong>
      {!compact && <span className="block text-xs text-slate-300 leading-5">{card.body}</span>}
    </span>
  </button>
);

/**
 * Sponsor placement with context targeting. The viewer's only attribute is their role (see
 * adAudience); `topic` optionally names the product category of the page. When no sponsor fits a
 * market/portal slot it shows one of our own free gates instead of leaving a hole; the sponsor
 * strip stays empty rather than showing house promotion. Every sponsored card is labelled «إعلان».
 */
export const AdSlot: React.FC<{ slot: AdSlotType; topic?: string; className?: string }> = ({ slot, topic, className = '' }) => {
  const audience = audienceOf(store.activeUser);
  const [ads, setAds] = useState<PublicAd[] | null>(null);
  const [hidden, setHidden] = useState<string[]>(() => hiddenIds());
  useEffect(() => {
    let live = true;
    setAds(null);
    if (overCap()) { setAds([]); return () => { live = false; }; }
    fetchAds(slot, audience, topic).then(r => { if (live) setAds(r.ads); }).catch(() => { if (live) setAds([]); });
    return () => { live = false; };
  }, [slot, audience, topic]);
  const visible = useMemo(() => (ads ?? []).filter(a => !hidden.includes(a.id)), [ads, hidden]);
  if (ads === null) return null;
  const compactSlot = slot === 'SPONSOR' || slot === 'PORTAL';
  const hide = (id: string) => { hideAd(id); setHidden(hiddenIds()); };

  if (slot === 'SPONSOR') {
    if (!visible.length) return null;
    return <div className={`w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-3 ${className}`}><AdCard ad={visible[0]} audience={audience} compact onHide={() => hide(visible[0].id)} /></div>;
  }
  if (!visible.length) {
    return <aside aria-label="من مجال" className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-3 ${className}`}><HouseCardView card={HOUSE[audience]} compact={compactSlot} /></aside>;
  }
  return (
    <aside aria-label="إعلانات الشركاء" className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-3 ${className}`}>
      {(slot === 'PORTAL' ? visible.slice(0, 2) : visible).map(ad => <AdCard key={ad.id} ad={ad} audience={audience} compact={compactSlot} onHide={() => hide(ad.id)} />)}
    </aside>
  );
};
