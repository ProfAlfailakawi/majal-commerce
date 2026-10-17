import React, { useEffect, useState } from 'react';
import { Bell, Clock } from 'lucide-react';
import { Launch } from '../../types/majal';
import { store } from '../../lib/store';
import { IS_DEMO_MODE } from '../../lib/runtime';
import { commerceClient } from '../../lib/commerceClient';
import { clockOffsetMs } from '../../lib/countdown';
import { publicProductImage } from '../../lib/productImage';
import { ProductImage } from '../common/ProductImage';
import { LaunchCountdown, formatOpening } from './LaunchCountdown';

interface Props {
  launch: Launch;
  onOpenLaunch: (launch: Launch) => void;
  /** Called when the countdown reaches zero so the page can move the launch into the open list. */
  onOpened: () => void;
}

/** The next scheduled drop, given its own stage: this is what the visitor comes back for. */
export const UpcomingDropStrip: React.FC<Props> = ({ launch, onOpenLaunch, onOpened }) => {
  const [offsetMs, setOffsetMs] = useState(0);
  // The device clock may be wrong; take the server's present once, for the real marketplace only.
  useEffect(() => {
    if (IS_DEMO_MODE) return;
    let live = true;
    commerceClient.checkoutOptions(launch.id).then(r => { if (live) setOffsetMs(clockOffsetMs(r.serverNow)); }).catch(() => undefined);
    return () => { live = false; };
  }, [launch.id]);

  const product = store.products.find(p => p.id === launch.productId);
  const creator = store.creators.find(c => c.id === launch.creatorId);
  const host = store.hosts.find(h => h.id === launch.hostBusinessId);

  return (
    <section aria-labelledby="upcoming-drop-title" className="relative overflow-hidden rounded-[28px] border border-gold-300/30 glass-panel">
      <div className="majal-glow -top-60 -start-40 w-[34rem] h-[34rem]" style={{ '--glow': 'rgba(199,165,91,0.16)' } as React.CSSProperties} />
      <div className="relative z-10 grid md:grid-cols-[minmax(0,15rem)_1fr] gap-5 p-5 sm:p-6 items-center">
        <div className="relative h-44 md:h-full min-h-44 rounded-2xl overflow-hidden border border-white/10">
          <ProductImage src={publicProductImage(product)} alt={launch.title} className="w-full h-full object-cover" />
          <div className="majal-art-scrim absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
        </div>
        <div className="space-y-4 text-center md:text-start">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gold-500/10 border border-gold-300/30 text-xs font-black text-gold-300"><Clock className="w-3.5 h-3.5" aria-hidden="true" /> الإصدار القادم</div>
          <div>
            <h2 id="upcoming-drop-title" className="text-xl sm:text-2xl font-black leading-snug">{product?.publicName ?? launch.title}</h2>
            <p className="text-xs text-emerald-300 font-black mt-1">{creator?.displayName} × {host?.commercialName}</p>
          </div>
          <p className="text-sm text-slate-300">يفتح {formatOpening(launch.startDate)}{launch.quantityCapUnits ? ` — ${launch.quantityCapUnits} وحدة فقط` : ''}</p>
          <LaunchCountdown opensAt={launch.startDate} offsetMs={offsetMs} onOpen={onOpened} />
          <button type="button" onClick={() => onOpenLaunch(launch)} className="inline-flex items-center justify-center gap-2 min-h-11 px-5 py-3 rounded-xl bg-gold-500 hover:bg-gold-400 text-slate-950 text-sm font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">
            <Bell className="w-4 h-4" aria-hidden="true" /> ذكّرني قبل الفتح
          </button>
        </div>
      </div>
    </section>
  );
};
