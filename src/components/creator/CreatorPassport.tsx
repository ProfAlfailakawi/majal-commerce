import React, { useMemo } from 'react';
import {
  BadgeCheck,
  BookOpenCheck,
  Building2,
  Crown,
  Gauge,
  PackageCheck,
  Repeat2,
  ShieldCheck,
  Sparkles,
  TrendingUp
} from 'lucide-react';
import { store } from '../../lib/store';
import { Avatar } from '../common/Avatar';
import { DnaRing, DnaStepper } from '../dna/DnaKit';

interface CreatorPassportProps {
  creatorId: string;
}

export const CreatorPassport: React.FC<CreatorPassportProps> = ({ creatorId }) => {
  const profile = store.creators.find(c => c.id === creatorId);
  const products = store.products.filter(p => p.creatorId === creatorId);
  const collaborations = store.collaborations.filter(c => c.creatorId === creatorId);
  const launches = store.launches.filter(l => l.creatorId === creatorId);
  const orders = store.orders.filter(o => o.creatorId === creatorId);
  const reviews = store.reviews.filter(r => r.creatorId === creatorId);

  const stats = useMemo(() => {
    const revenue = orders.reduce((s, o) => s + o.grossAmountKwd, 0);
    const avgRating = reviews.length ? reviews.reduce((s, r) => s + r.tasteRating, 0) / reviews.length : 0;
    const keepRate = reviews.length ? Math.round(reviews.filter(r => r.keepItVote).length / reviews.length * 100) : 0;
    return { revenue, avgRating, keepRate };
  }, [orders, reviews]);

  const stage = launches.length >= 2 ? 'علامة جاهزة' : launches.length >= 1 ? 'مبدع مُثبَت' : products.length ? 'جاهز للسوق' : 'مُكتشَف';

  if (!profile) return <section className="glass-panel rounded-3xl p-6 text-center text-slate-400">ملف المبدع غير متاح لهذا المعرّف.</section>;

  return (
    <section className="glass-panel rounded-3xl border border-white/10 p-5 md:p-6 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <Avatar name={profile.displayName} src={profile.avatarUrl} size={64} shape="squircle" />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xl font-black text-slate-100">جواز المبدع</h3>
              <span className="px-2.5 py-1 rounded-full bg-gold-500/10 text-gold-300 border border-gold-300/20 text-xs font-black">{stage}</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">جواز تجاري حي يلخص ما أثبته المبدع فعليًا داخل «مجال».</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-2xl px-4 py-3 bg-emerald-500/8 border border-emerald-400/15 text-emerald-300">
          <BadgeCheck className="w-5 h-5" />
          <span className="text-xs font-black">سجل أداء داخل مجال</span>
        </div>
      </div>

      {launches.length > 0 && (
        <div className="relative overflow-hidden flex items-center gap-3 rounded-2xl px-4 py-3 border border-gold-300/30 bg-gradient-to-l from-gold-500/15 via-gold-500/5 to-transparent">
          <span aria-hidden="true" className="shrink-0 w-10 h-10 rounded-full grid place-items-center bg-gold-500 text-slate-950 shadow-[0_0_0_6px_rgba(199,165,91,0.15)]"><Crown className="w-5 h-5" /></span>
          <div className="min-w-0">
            <div className="text-sm font-black text-gold-300">{launches.length >= 2 ? 'علامة جاهزة — أكثر من إطلاق حيّ' : 'أول إطلاق لك صار حيًّا'}</div>
            <div className="text-xs text-slate-400 mt-0.5">{launches.length} إطلاق باسمك داخل «مجال».</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'منتجات مسجلة', value: products.length, icon: <PackageCheck className="w-4 h-4 text-gold-300" /> },
          { label: 'تعاونات تجارية', value: collaborations.length, icon: <Building2 className="w-4 h-4 text-gold-300" /> },
          { label: 'مبيعات مسجلة', value: `${stats.revenue.toFixed(3)} د.ك`, icon: <TrendingUp className="w-4 h-4 text-gold-300" /> },
          { label: 'خلّوه — يبقى في المنيو', value: reviews.length ? `${stats.keepRate}%` : '—', icon: <Repeat2 className="w-4 h-4 text-gold-300" /> }
        ].map((item, idx) => (
          <div key={idx} className="rounded-2xl p-4 bg-white/5 border border-white/10">
            <div className="flex items-center gap-2 text-xs text-slate-400">{item.icon}{item.label}</div>
            <div className="mt-2 text-xl font-black text-slate-100 font-mono">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4">
        <div className="rounded-2xl p-4 bg-white/5 border border-white/10 space-y-3">
          <div className="flex items-center gap-2 font-bold text-slate-100"><Gauge className="w-4 h-4 text-gold-300" /> مؤشرات الثقة المهنية</div>
          <div className="flex items-center gap-4">
            <DnaRing
              value={reviews.length ? (stats.avgRating / 5) * 100 : null}
              size={64}
              stroke={5}
              ariaLabel={reviews.length ? `جودة المنتج ${Math.round((stats.avgRating / 5) * 100)}%` : 'جودة المنتج: لا تقييمات بعد'}
            />
            <div>
              <div className="text-xs font-bold text-slate-200">جودة المنتج</div>
              <div className="text-xs text-slate-400 mt-1">{reviews.length ? `${stats.avgRating.toFixed(1)} / 5 · ${reviews.length} تقييم` : 'لا تقييمات بعد'}</div>
            </div>
          </div>
          <div className="flex items-center gap-4 pt-3 border-t border-white/10">
            <DnaRing
              value={reviews.length ? stats.keepRate : null}
              size={48}
              stroke={4}
              tone="info"
              ariaLabel={reviews.length ? `خلّوه ${stats.keepRate}%` : 'خلّوه: لا أصوات بعد'}
            />
            <div>
              <div className="text-xs font-bold text-slate-200">خلّوه</div>
              <div className="text-xs text-slate-400 mt-1">{reviews.length ? `${stats.keepRate}% من المقيّمين يريدونه في المنيو` : 'لا أصوات بعد'}</div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl p-4 bg-white/5 border border-white/10 space-y-4">
          <div className="flex items-center gap-2 font-bold text-slate-100"><Crown className="w-4 h-4 text-gold-300" /> مسار الترقّي</div>
          <DnaStepper
            size="md"
            ariaLabel="مسار الترقّي"
            stateText={{ done: 'مكتمل', pending: 'قادم' }}
            steps={[
              { key: 'discovered', label: 'مُكتشَف', done: true, icon: <Sparkles /> },
              { key: 'tested', label: 'مُختبَر', done: profile.badges.includes('TESTED'), icon: <BookOpenCheck /> },
              { key: 'launched', label: 'مُطلَق', done: launches.length > 0, icon: <PackageCheck /> },
              { key: 'proven', label: 'مُثبَت', done: profile.badges.includes('PROVEN'), icon: <ShieldCheck /> },
              { key: 'brand', label: 'علامة جاهزة', done: launches.length >= 2, icon: <Crown /> }
            ].map(({ done, ...step }) => ({ ...step, state: done ? 'done' as const : 'pending' as const }))}
          />
        </div>
      </div>
    </section>
  );
};
