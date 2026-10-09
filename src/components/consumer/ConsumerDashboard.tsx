import React, { useEffect, useState } from 'react';
import {
  BadgeCheck,
  ChevronDown,
  CheckCircle2,
  Flame,
  Heart,
  PackageOpen,
  Infinity as InfinityIcon,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  TrendingUp,
  X
} from 'lucide-react';
import { SurfaceType, Launch } from '../../types/majal';
import { arCount, AR } from '../../lib/arPlural';
import { store } from '../../lib/store';
import { useDialogBehavior } from '../../hooks/useDialogBehavior';
import { Avatar } from '../common/Avatar';
import { ProductImage } from '../common/ProductImage';
import { KuwaitiJobs } from '../jobs/KuwaitiJobs';
import { DropCheckout } from './DropCheckout';
import { formatKwd } from '../../lib/money';
import { commerceClient } from '../../lib/commerceClient';
import { domainClient } from '../../lib/domainClient';
import { IS_DEMO_MODE } from '../../lib/runtime';
import { DnaRing } from '../dna/DnaKit';

interface ConsumerDashboardProps {
  onSurfaceChange: (surface: SurfaceType) => void;
}

const LAUNCHES_VISIBLE = 6;

type ReviewSummary = { count: number; taste: number; keepItPercent: number };
/** One public summary request per launch, shared by every mount so leaving and returning
    before it settles still lands the result in the current instance. Real data only: a failed
    request resolves to null and the chips simply do not appear. */
const summaryPromises = new Map<string, Promise<ReviewSummary | null>>();
const loadSummary = (id: string) => {
  let pending = summaryPromises.get(id);
  if (!pending) {
    pending = domainClient.launchReviews(id)
      .then(r => ({ count: r.summary.count, taste: r.summary.taste, keepItPercent: r.summary.keepItPercent }) as ReviewSummary | null)
      .catch(() => { summaryPromises.delete(id); return null; });
    summaryPromises.set(id, pending);
  }
  return pending;
};

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

  // Server sessions do not hold reviews in the store; the public summary endpoint is the
  // real source there (the same one DropCheckout reads). Demo reads the local store instead.
  const [serverSummaries, setServerSummaries] = useState<Record<string, ReviewSummary | null>>({});
  const summaryIds = launches.slice(0, LAUNCHES_VISIBLE).map(l => l.id).join(',');
  useEffect(() => {
    if (IS_DEMO_MODE || !summaryIds) return;
    let live = true;
    summaryIds.split(',').forEach(id => {
      void loadSummary(id).then(v => { if (live && v) setServerSummaries(prev => ({ ...prev, [id]: v })); });
    });
    return () => { live = false; };
  }, [summaryIds]);
  const summaryFor = (launchId: string): (ReviewSummary & { repeat: number | null }) | null => {
    if (IS_DEMO_MODE) {
      const rs = store.reviews.filter(r => r.launchId === launchId);
      if (!rs.length) return null;
      return { count: rs.length, taste: rs.reduce((sum, r) => sum + r.tasteRating, 0) / rs.length, keepItPercent: Math.round(rs.filter(r => r.keepItVote).length / rs.length * 100), repeat: Math.round(rs.filter(r => r.wouldBuyAgain).length / rs.length * 100) };
    }
    const v = serverSummaries[launchId];
    return v && v.count > 0 ? { ...v, repeat: null } : null;
  };

  const featured = launches[0];
  const featuredProduct = featured ? store.products.find(p => p.id === featured.productId) : undefined;
  const featuredCreator = featured ? store.creators.find(c => c.id === featured.creatorId) : undefined;
  const featuredHost = featured ? store.hosts.find(h => h.id === featured.hostBusinessId) : undefined;

  const featuredSummary = featured ? summaryFor(featured.id) : null;
  const metrics = {
    keep: featuredSummary ? featuredSummary.keepItPercent : null,
    repeat: featuredSummary ? featuredSummary.repeat : null,
    rating: featuredSummary ? featuredSummary.taste : null,
    // Uncapped (permanent/ongoing) launches have no "remaining" — don't paint them as sold out.
    remaining: featured && featured.quantityCapUnits ? Math.max(0, featured.quantityCapUnits - featured.unitsSold) : null as number | null
  };

  const handleKeepVote = () => {
    if (!featured) return;
    const review = store.submitReview(featured.id, 5, 4, 5, 'أبي هذا المنتج يستمر في المنيو.', true, 'عميل مجال');
    setVoteMessage(review ? 'وصل صوتك. صار لك أثر مباشر في قرار استمرار المنتج.' : (store.lastGuardMessage || 'تم تسجيل صوت بهذا الاسم لهذا الإطلاق مسبقًا.'));
    setTimeout(() => setVoteMessage(''), 3200);
  };

  const renderLaunchCard = (launch: (typeof launches)[number]) => {
    const product = store.products.find(p => p.id === launch.productId);
    const creator = store.creators.find(c => c.id === launch.creatorId);
    const host = store.hosts.find(h => h.id === launch.hostBusinessId);
    const capped = !!launch.quantityCapUnits;
    const progress = capped ? Math.min(100, Math.round(launch.unitsSold / launch.quantityCapUnits! * 100)) : 0;
    // Public-safe trust chips: real aggregates only, and only once at least one review exists.
    const launchSummary = summaryFor(launch.id);
    return (
      <article key={launch.id} className="glass-card rounded-3xl border border-white/10 overflow-hidden hover:-translate-y-1 transition-transform">
        <div className="relative h-40 sm:h-52">
          <ProductImage src={product?.mediaUrls[0]} alt={launch.title} loading="lazy" className="w-full h-full object-cover" />
          <div className="majal-art-scrim absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-transparent" />
          <div className="absolute top-3 start-3 px-2.5 py-1 rounded-full bg-slate-950/75 border border-white/10 text-xs text-gold-300 font-black">{({ LIMITED_DROP: 'إطلاق محدود', TRIAL_PERIOD: 'فترة تجريبية', PERMANENT_MENU: 'قائمة دائمة', SEASONAL: 'موسمي' } as Record<string, string>)[launch.launchType] ?? launch.launchType}</div>
          <div className="majal-art-title absolute bottom-4 start-4 end-4"><div className="text-xs text-emerald-300 font-black">{creator?.displayName} × {host?.commercialName}</div><h3 className="font-black text-white mt-1">{product?.publicName || launch.title}</h3></div>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-400 leading-6 line-clamp-2">{product?.shortDescription}</p>
          {launchSummary && launchSummary.count > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gold-500/10 border border-gold-300/25 text-xs font-black text-gold-300"><Star className="w-3 h-3" aria-hidden="true" />{launchSummary.taste.toFixed(1)} <span className="font-medium text-slate-400">({arCount(launchSummary.count, AR.review)})</span></span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-400/25 text-xs font-black text-emerald-300"><Heart className="w-3 h-3" aria-hidden="true" />خلّوه <bdi dir="ltr">{launchSummary.keepItPercent}%</bdi></span>
            </div>
          )}
          <div><div className="flex justify-between text-xs text-slate-400 mb-1"><span>{launch.unitsSold} مبيعة</span><span>{capped ? `${progress}%` : 'مستمر'}</span></div><div className="h-2 bg-white/5 rounded-full overflow-hidden">{capped ? <div className="h-full bg-gradient-to-l from-gold-500 to-emerald-400 rounded-full" style={{ width: `${progress}%` }} /> : <div className="h-full w-full bg-gradient-to-l from-emerald-500/30 to-emerald-400/30 rounded-full" />}</div></div>
          <div className="flex items-center justify-between"><div><div className="text-xs text-slate-400">السعر</div><div className="font-black text-gold-300">{formatKwd(launch.sellingPriceKwd)}</div></div><button type="button" onClick={() => setSelectedLaunch(launch)} className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-black text-slate-100">شاهد واطلب</button></div>
        </div>
      </article>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      <section className="majal-hero glass-panel rounded-[34px] p-6 md:p-10 border border-white/10 relative overflow-hidden">
        <div className="majal-glow -top-80 -end-48 w-[48rem] h-[48rem]" style={{ '--glow': 'rgba(199,165,91,0.10)' } as React.CSSProperties} />
        <div className="relative z-10 grid lg:grid-cols-[1.05fr_.95fr] gap-8 items-center">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-500/10 border border-rose-400/20 text-rose-300 text-xs font-black"><Flame className="w-4 h-4" /> إطلاقات مجال — منتجات تستحق التجربة</div>
            <h1 className="text-3xl md:text-5xl font-black leading-tight">مو مجرد طلب أكل.<br /><span className="text-gold-300">أنت تشارك في اكتشاف الاسم القادم.</span></h1>
            <p className="text-sm text-slate-400 max-w-2xl leading-7">كل منتج هنا مرّ بمبدع، منشأة مرخّصة، اختبار، اتفاق، وإطلاق. جرّبه، قيّمه، وقرر مع الجمهور هل يستحق البقاء.</p>

            {featuredCreator && (
              <div className="flex flex-wrap items-center gap-3 rounded-2xl p-3 bg-white/5 border border-white/10 w-full sm:w-fit">
                <Avatar name={featuredCreator.displayName} src={featuredCreator.avatarUrl} size={44} shape="squircle" />
                <div className="min-w-0 flex-1 basis-24"><div className="text-xs font-black text-slate-100">{featuredCreator.displayName}</div><div className="text-xs text-slate-400 mt-1">{featuredCreator.specialty}</div></div>
                <button
                  type="button"
                  aria-pressed={followedCreators.includes(featuredCreator.id)}
                  onClick={() => void toggleFollow(featuredCreator.id)}
                  className={`ms-auto sm:ms-3 shrink-0 whitespace-nowrap px-3 py-2 max-sm:min-h-11 rounded-xl text-xs font-black flex items-center gap-1.5 ${followedCreators.includes(featuredCreator.id) ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-400/20' : 'bg-gold-500 text-slate-950'}`}
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
                <ProductImage src={featuredProduct.mediaUrls[0]} alt={featuredProduct.publicName} fetchPriority="high" markSize={96} className="w-full h-full object-cover" />
                <div className="majal-art-scrim absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent" />
                <div className="absolute top-4 start-4 px-3 py-1.5 rounded-full bg-slate-950/75 backdrop-blur text-gold-300 border border-gold-300/20 text-xs font-black">{formatKwd(featured.sellingPriceKwd)}</div>
                <div className="majal-art-title absolute bottom-5 start-5 end-5">
                  <div className="text-xs text-emerald-300 font-black mb-1">{featuredHost?.commercialName}</div>
                  <h2 className="text-xl md:text-2xl font-black text-white">{featuredProduct.publicName}</h2>
                </div>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div className="rounded-xl p-3 bg-white/5"><Star className="w-4 h-4 text-gold-300 mx-auto" /><div className="text-xs font-black mt-1">{metrics.rating === null ? '—' : metrics.rating.toFixed(1)}</div><div className="text-xs text-slate-400">الطعم</div></div>
                  {!(featuredSummary && featuredSummary.repeat === null) && <div className="rounded-xl p-3 bg-white/5"><DnaRing className="mx-auto" value={metrics.repeat} size={44} stroke={4} tone="accent" label={metrics.repeat === null ? '—' : `${metrics.repeat}%`} ariaLabel={metrics.repeat === null ? 'يكرر: لا بيانات بعد' : `يكرر ${metrics.repeat}%`} /><div className="text-xs text-slate-400">يكرر</div></div>}
                  <div className="rounded-xl p-3 bg-white/5"><DnaRing className="mx-auto" value={metrics.keep} size={44} stroke={4} tone="info" label={metrics.keep === null ? '—' : `${metrics.keep}%`} ariaLabel={metrics.keep === null ? 'خلّوه: لا أصوات بعد' : `خلّوه ${metrics.keep}%`} /><div className="text-xs text-slate-400">خلّوه</div></div>
                  <div className="rounded-xl p-3 bg-white/5"><PackageOpen className="w-4 h-4 text-gold-300 mx-auto" /><div className="text-xs font-black mt-1">{metrics.remaining ?? <InfinityIcon className="w-4 h-4 mx-auto" aria-hidden="true" />}</div><div className="text-xs text-slate-400">{metrics.remaining === null ? 'بلا سقف' : 'متبقي'}</div></div>
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
              <div className="space-y-4 max-w-sm"><div className="w-16 h-16 mx-auto rounded-3xl bg-gold-500/10 border border-gold-300/20 grid place-items-center"><PackageOpen className="w-8 h-8 text-gold-300" /></div><h2 className="text-xl font-black">الإطلاق القادم يُجهّز الآن</h2><p className="text-xs text-slate-400 leading-6">لا نعرض منتجات غير مكتملة. يظهر أول إطلاق هنا بعد اجتياز الاختبار والامتثال وبوابة الإطلاق.</p></div>
            </div>
          )}
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex items-center justify-between gap-4"><div><h2 className="text-2xl font-black">الإطلاقات الحالية</h2><p className="text-xs text-slate-400 mt-1">منتجات محدودة، تجريبية، موسمية أو مرشحة للدخول الدائم.</p></div><div className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-400">{arCount(launches.length, AR.launch)}</div></div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {launches.slice(0, LAUNCHES_VISIBLE).map(renderLaunchCard)}
          {!launches.length && <div className="md:col-span-2 lg:col-span-3 rounded-3xl p-8 border border-dashed border-white/15 bg-white/[0.02] text-center"><Sparkles className="w-7 h-7 text-gold-300 mx-auto" /><div className="font-black mt-3">لا توجد إطلاقات متاحة حاليًا</div><div className="text-xs text-slate-400 mt-2">لن يظهر زر الطلب قبل اكتمال الجاهزية وربط الدفع.</div></div>}
        </div>
        {launches.length > LAUNCHES_VISIBLE && (
          <details className="group rounded-2xl border border-white/10 glass-card">
            <summary className="flex items-center gap-2 min-h-11 px-4 py-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden font-bold text-slate-200 text-sm">
              <Store className="w-4 h-4 text-gold-400" aria-hidden="true" />
              <span className="flex-1">عرض المزيد ({launches.length - LAUNCHES_VISIBLE})</span>
              <ChevronDown className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 p-4 pt-2">
              {launches.slice(LAUNCHES_VISIBLE).map(renderLaunchCard)}
            </div>
          </details>
        )}
      </section>

      <section className="grid md:grid-cols-3 gap-4">
        {[
          { icon: <BadgeCheck className="w-5 h-5 text-emerald-300" />, title: 'هوية المبدع ظاهرة', text: 'تتعرف على صاحب المنتج وقصته بدل منتج مجهول المصدر داخل المنصة.' },
          { icon: <Store className="w-5 h-5 text-sky-300" />, title: 'منشأة مرخّصة', text: 'الإنتاج والبيع التجاري يتمان من خلال الشريك المرخّص.' },
          { icon: <TrendingUp className="w-5 h-5 text-gold-300" />, title: 'صوتك له قيمة', text: 'التقييم وتصويت «خلوه» يساعدان في قرار استمرار المنتج فعليًا.' }
        ].map((item, idx) => <div key={idx} className="glass-card rounded-2xl p-4 sm:p-5 border border-white/10"><div className="flex items-center gap-3 sm:block"><span className="shrink-0">{item.icon}</span><h3 className="font-black sm:mt-4">{item.title}</h3></div><p className="text-xs text-slate-400 leading-6 mt-2">{item.text}</p></div>)}
      </section>

      <KuwaitiJobs />

      {selectedLaunch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div ref={orderDialogRef} role="dialog" aria-modal="true" aria-labelledby="consumer-order-title" className="glass-panel w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-[28px] p-6 border border-white/15 shadow-2xl space-y-5 relative">
            <button type="button" aria-label="إغلاق نافذة الطلب" onClick={closeOrderModal} className="absolute top-4 end-4 p-2 rounded-full bg-white/5 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            <div><span className="text-xs text-gold-300 font-black">إطلاق من مجال</span><h3 id="consumer-order-title" className="text-xl font-black mt-1">{selectedLaunch.title}</h3></div>

            <DropCheckout launch={selectedLaunch} acquisitionSource={acquisitionSource} />
          </div>
        </div>
      )}
    </div>
  );
};
