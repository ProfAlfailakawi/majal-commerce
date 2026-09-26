import React, { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  CheckCircle2,
  Flame,
  Heart,
  PackageOpen,
  Repeat2,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  TrendingUp,
  Users,
  X
} from 'lucide-react';
import { SurfaceType, Launch } from '../../types/majal';
import { store } from '../../lib/store';
import { useDialogBehavior } from '../../hooks/useDialogBehavior';
import { Avatar } from '../common/Avatar';
import { KuwaitiJobs } from '../jobs/KuwaitiJobs';
import { DropCheckout } from './DropCheckout';
import { formatKwd } from '../../lib/money';
import { commerceClient } from '../../lib/commerceClient';
import { IS_DEMO_MODE } from '../../lib/runtime';

interface ConsumerDashboardProps {
  onSurfaceChange: (surface: SurfaceType) => void;
}

export const ConsumerDashboard: React.FC<ConsumerDashboardProps> = () => {
  const [, setTick] = useState(0);
  useEffect(() => store.subscribe(() => setTick(t => t + 1)), []);

  const launches = store.launches.filter(l => l.status === 'LIVE' || l.status === 'PERMANENT');
  const [selectedLaunch, setSelectedLaunch] = useState<Launch | null>(null);
  const [followedCreators, setFollowedCreators] = useState<string[]>([]);
  const [followMessage, setFollowMessage] = useState('');
  const [voteMessage, setVoteMessage] = useState('');
  const closeOrderModal = () => setSelectedLaunch(null);

  // Follows are stored server-side so launch alerts reach the follower's inbox.
  useEffect(() => {
    if (IS_DEMO_MODE) return;
    commerceClient.follows().then(r => setFollowedCreators(r.follows.map(f => f.creatorId))).catch(() => undefined);
  }, []);
  const toggleFollow = async (creatorId: string) => {
    const following = followedCreators.includes(creatorId);
    if (IS_DEMO_MODE) {
      setFollowedCreators(prev => following ? prev.filter(id => id !== creatorId) : [...prev, creatorId]);
      return;
    }
    try {
      if (following) await commerceClient.unfollow(creatorId); else await commerceClient.follow(creatorId);
      setFollowedCreators(prev => following ? prev.filter(id => id !== creatorId) : [...prev, creatorId]);
      setFollowMessage(following ? 'ألغيت متابعة المبدع.' : 'تابعت المبدع — بنبلغك أول ما ينزل إطلاق جديد.');
    } catch {
      setFollowMessage('سجّل دخولك لمتابعة المبدع واستلام تنبيهات الإطلاقات.');
    }
    window.setTimeout(() => setFollowMessage(''), 3200);
  };
  const orderDialogRef = useDialogBehavior<HTMLDivElement>(Boolean(selectedLaunch), closeOrderModal);
  const acquisitionSource = (() => {
    if (typeof window === 'undefined') return 'MAJAL' as const;
    const src = new URLSearchParams(window.location.search).get('src')?.toUpperCase();
    return src === 'CREATOR' || src === 'HOST' ? src : 'MAJAL';
  })();

  const featured = launches[0];
  const featuredProduct = featured ? store.products.find(p => p.id === featured.productId) : undefined;
  const featuredCreator = featured ? store.creators.find(c => c.id === featured.creatorId) : undefined;
  const featuredHost = featured ? store.hosts.find(h => h.id === featured.hostBusinessId) : undefined;

  const metrics = useMemo(() => {
    if (!featured) return { keep: 0, repeat: 0, rating: 0, remaining: null as number | null };
    const reviews = store.reviews.filter(r => r.launchId === featured.id);
    const keep = reviews.length ? Math.round(reviews.filter(r => r.keepItVote).length / reviews.length * 100) : 0;
    const repeat = reviews.length ? Math.round(reviews.filter(r => r.wouldBuyAgain).length / reviews.length * 100) : 0;
    const rating = reviews.length ? reviews.reduce((s, r) => s + r.tasteRating, 0) / reviews.length : 0;
    // Uncapped (permanent/ongoing) launches have no "remaining" — don't paint them as sold out.
    const remaining = featured.quantityCapUnits ? Math.max(0, featured.quantityCapUnits - featured.unitsSold) : null;
    return { keep, repeat, rating, remaining };
  }, [featured, store.reviews.length]);

  const handleKeepVote = () => {
    if (!featured) return;
    const review = store.submitReview(featured.id, 5, 4, 5, 'أبي هذا المنتج يستمر في المنيو.', true, 'عميل مجال');
    setVoteMessage(review ? 'وصل صوتك. صار لك أثر مباشر في قرار استمرار المنتج.' : (store.lastGuardMessage || 'تم تسجيل صوت بهذا الاسم لهذا الإطلاق مسبقًا.'));
    setTimeout(() => setVoteMessage(''), 3200);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      <section className="glass-panel rounded-[34px] p-6 md:p-10 border border-white/10 relative overflow-hidden">
        <div className="majal-glow -top-80 -left-48 w-[48rem] h-[48rem]" style={{ '--glow': 'rgba(199,165,91,0.10)' } as React.CSSProperties} />
        <div className="relative z-10 grid lg:grid-cols-[1.05fr_.95fr] gap-8 items-center">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-500/10 border border-rose-400/20 text-rose-300 text-xs font-black"><Flame className="w-4 h-4" /> MAJAL DROPS — إطلاقات تستحق التجربة</div>
            <h1 className="text-3xl md:text-5xl font-black leading-tight">مو مجرد طلب أكل.<br /><span className="text-gold-300">أنت تشارك في اكتشاف الاسم القادم.</span></h1>
            <p className="text-sm text-slate-400 max-w-2xl leading-7">كل منتج هنا مرّ بمبدع، منشأة مرخّصة، اختبار، اتفاق، وإطلاق. جرّبه، قيّمه، وقرر مع الجمهور هل يستحق البقاء.</p>

            {featuredCreator && (
              <div className="flex items-center gap-3 rounded-2xl p-3 bg-white/5 border border-white/10 w-fit">
                <Avatar name={featuredCreator.displayName} src={featuredCreator.avatarUrl} size={44} shape="squircle" />
                <div><div className="text-xs font-black text-slate-100">{featuredCreator.displayName}</div><div className="text-[11px] text-slate-400 mt-1">{featuredCreator.specialty}</div></div>
                <button
                  type="button"
                  aria-pressed={followedCreators.includes(featuredCreator.id)}
                  onClick={() => void toggleFollow(featuredCreator.id)}
                  className={`ms-3 px-3 py-2 rounded-xl text-[11px] font-black flex items-center gap-1.5 ${followedCreators.includes(featuredCreator.id) ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-400/20' : 'bg-gold-500 text-slate-950'}`}
                >
                  <Heart className="w-3.5 h-3.5" /> {followedCreators.includes(featuredCreator.id) ? 'تتابعه' : 'تابع المبدع'}
                </button>
              </div>
            )}
            {followMessage && <div role="status" className="text-xs text-emerald-300 font-bold">{followMessage}</div>}
          </div>

          {featured && featuredProduct && (
            <div className="rounded-[28px] overflow-hidden bg-slate-950/50 border border-white/10 shadow-2xl">
              <div className="relative h-72">
                <img src={featuredProduct.mediaUrls[0]} alt={featuredProduct.publicName} decoding="async" fetchPriority="high" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent" />
                <div className="absolute top-4 right-4 px-3 py-1.5 rounded-full bg-slate-950/75 backdrop-blur text-gold-300 border border-gold-300/20 text-xs font-black">{formatKwd(featured.sellingPriceKwd)}</div>
                <div className="absolute bottom-5 right-5 left-5">
                  <div className="text-[11px] text-emerald-300 font-black mb-1">{featuredHost?.commercialName}</div>
                  <h2 className="text-xl md:text-2xl font-black text-white">{featuredProduct.publicName}</h2>
                </div>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="rounded-xl p-3 bg-white/5"><Star className="w-4 h-4 text-gold-300 mx-auto" /><div className="text-xs font-black mt-1">{metrics.rating.toFixed(1)}</div><div className="text-[11px] text-slate-400">الطعم</div></div>
                  <div className="rounded-xl p-3 bg-white/5"><Repeat2 className="w-4 h-4 text-emerald-300 mx-auto" /><div className="text-xs font-black mt-1">{metrics.repeat}%</div><div className="text-[11px] text-slate-400">يكرر</div></div>
                  <div className="rounded-xl p-3 bg-white/5"><Users className="w-4 h-4 text-sky-300 mx-auto" /><div className="text-xs font-black mt-1">{metrics.keep}%</div><div className="text-[11px] text-slate-400">نسبة التكرار</div></div>
                  <div className="rounded-xl p-3 bg-white/5"><PackageOpen className="w-4 h-4 text-rose-300 mx-auto" /><div className="text-xs font-black mt-1">{metrics.remaining ?? '∞'}</div><div className="text-[11px] text-slate-400">{metrics.remaining === null ? 'بلا سقف' : 'متبقي'}</div></div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setSelectedLaunch(featured)} className="flex-1 py-3 rounded-xl bg-gold-500 text-slate-950 text-xs font-black flex items-center justify-center gap-2"><ShoppingBag className="w-4 h-4" /> اطلب التجربة</button>
                  <button type="button" onClick={handleKeepVote} className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-black text-emerald-300 flex items-center gap-2"><Heart className="w-4 h-4" /> خلوه</button>
                </div>
                {voteMessage && <div className="rounded-xl p-3 bg-emerald-500/10 border border-emerald-400/20 text-xs text-emerald-300 font-bold">{voteMessage}</div>}
              </div>
            </div>
          )}
          {!featured && (
            <div className="rounded-[28px] min-h-72 bg-slate-950/45 border border-dashed border-white/15 grid place-items-center p-8 text-center">
              <div className="space-y-4 max-w-sm"><div className="w-16 h-16 mx-auto rounded-3xl bg-gold-500/10 border border-gold-300/20 grid place-items-center"><PackageOpen className="w-8 h-8 text-gold-300" /></div><h2 className="text-xl font-black">الإطلاق القادم يُجهّز الآن</h2><p className="text-xs text-slate-400 leading-6">لا نعرض منتجات غير مكتملة. يظهر أول Drop هنا بعد اجتياز الاختبار والامتثال وبوابة الإطلاق.</p></div>
            </div>
          )}
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex items-center justify-between gap-4"><div><h2 className="text-2xl font-black">الإطلاقات الحالية</h2><p className="text-xs text-slate-400 mt-1">منتجات محدودة، تجريبية، موسمية أو مرشحة للدخول الدائم.</p></div><div className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-400">{launches.length} إطلاق</div></div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {launches.map(launch => {
            const product = store.products.find(p => p.id === launch.productId);
            const creator = store.creators.find(c => c.id === launch.creatorId);
            const host = store.hosts.find(h => h.id === launch.hostBusinessId);
            const capped = !!launch.quantityCapUnits;
            const progress = capped ? Math.min(100, Math.round(launch.unitsSold / launch.quantityCapUnits! * 100)) : 0;
            return (
              <article key={launch.id} className="glass-card rounded-3xl border border-white/10 overflow-hidden hover:-translate-y-1 transition-transform">
                <div className="relative h-52">
                  <img src={product?.mediaUrls[0]} alt={launch.title} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-transparent" />
                  <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-slate-950/75 border border-white/10 text-[11px] text-gold-300 font-black">{launch.launchType}</div>
                  <div className="absolute bottom-4 right-4 left-4"><div className="text-[11px] text-emerald-300 font-black">{creator?.displayName} × {host?.commercialName}</div><h3 className="font-black text-white mt-1">{product?.publicName || launch.title}</h3></div>
                </div>
                <div className="p-5 space-y-4">
                  <p className="text-xs text-slate-400 leading-6 line-clamp-2">{product?.shortDescription}</p>
                  <div><div className="flex justify-between text-[11px] text-slate-400 mb-1"><span>{launch.unitsSold} مبيعة</span><span>{capped ? `${progress}%` : 'مستمر'}</span></div><div className="h-2 bg-white/5 rounded-full overflow-hidden">{capped ? <div className="h-full bg-gradient-to-l from-gold-500 to-emerald-400 rounded-full" style={{ width: `${progress}%` }} /> : <div className="h-full w-full bg-gradient-to-l from-emerald-500/30 to-emerald-400/30 rounded-full" />}</div></div>
                  <div className="flex items-center justify-between"><div><div className="text-[11px] text-slate-400">السعر</div><div className="font-black text-gold-300">{formatKwd(launch.sellingPriceKwd)}</div></div><button type="button" onClick={() => setSelectedLaunch(launch)} className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-black text-slate-100">شاهد واطلب</button></div>
                </div>
              </article>
            );
          })}
          {!launches.length && <div className="md:col-span-2 lg:col-span-3 rounded-3xl p-8 border border-dashed border-white/15 bg-white/[0.02] text-center"><Sparkles className="w-7 h-7 text-gold-300 mx-auto" /><div className="font-black mt-3">لا توجد إطلاقات متاحة حاليًا</div><div className="text-xs text-slate-400 mt-2">لن يظهر زر الطلب قبل اكتمال الجاهزية وربط الدفع.</div></div>}
        </div>
      </section>

      <section className="grid md:grid-cols-3 gap-4">
        {[
          { icon: <BadgeCheck className="w-5 h-5 text-emerald-300" />, title: 'هوية المبدع ظاهرة', text: 'تتعرف على صاحب المنتج وقصته بدل منتج مجهول المصدر داخل المنصة.' },
          { icon: <Store className="w-5 h-5 text-sky-300" />, title: 'منشأة مرخّصة', text: 'الإنتاج والبيع التجاري يتمان من خلال الشريك المرخّص.' },
          { icon: <TrendingUp className="w-5 h-5 text-gold-300" />, title: 'صوتك له قيمة', text: 'التقييم وKeep It يساعدان في قرار استمرار المنتج فعليًا.' }
        ].map((item, idx) => <div key={idx} className="glass-card rounded-2xl p-5 border border-white/10"><div>{item.icon}</div><h3 className="font-black mt-4">{item.title}</h3><p className="text-xs text-slate-400 leading-6 mt-2">{item.text}</p></div>)}
      </section>

      <KuwaitiJobs />

      {selectedLaunch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div ref={orderDialogRef} role="dialog" aria-modal="true" aria-labelledby="consumer-order-title" className="glass-panel w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-[28px] p-6 border border-white/15 shadow-2xl space-y-5 relative">
            <button type="button" aria-label="إغلاق نافذة الطلب" onClick={closeOrderModal} className="absolute top-4 end-4 p-2 rounded-full bg-white/5 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            <div><span className="text-[11px] text-gold-300 font-black">MAJAL DROP</span><h3 id="consumer-order-title" className="text-xl font-black mt-1">{selectedLaunch.title}</h3></div>

            <DropCheckout launch={selectedLaunch} acquisitionSource={acquisitionSource} />
          </div>
        </div>
      )}
    </div>
  );
};
