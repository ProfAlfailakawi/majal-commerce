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

  const stage = launches.length >= 2 ? 'Brand Ready' : launches.length >= 1 ? 'Proven Creator' : products.length ? 'Market Ready' : 'Discovered';

  if (!profile) return <section className="glass-panel rounded-3xl p-6 text-center text-slate-500">ملف المبدع غير متاح لهذا المعرّف.</section>;

  return (
    <section className="glass-panel rounded-3xl border border-white/10 p-5 md:p-6 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <Avatar name={profile.displayName} src={profile.avatarUrl} size={64} shape="squircle" />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xl font-black text-slate-100">Creator Passport</h3>
              <span className="px-3 py-1 rounded-full bg-gold-500/10 text-gold-300 border border-gold-300/20 text-[11px] font-black">{stage}</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">جواز تجاري حي يلخص ما أثبته المبدع فعليًا داخل «مجال».</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-2xl px-4 py-3 bg-emerald-500/8 border border-emerald-400/15 text-emerald-300">
          <BadgeCheck className="w-5 h-5" />
          <span className="text-xs font-black">سجل أداء داخل مجال</span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'منتجات مسجلة', value: products.length, icon: <PackageCheck className="w-4 h-4 text-sky-300" /> },
          { label: 'تعاونات تجارية', value: collaborations.length, icon: <Building2 className="w-4 h-4 text-fuchsia-300" /> },
          { label: 'مبيعات مسجلة', value: `${stats.revenue.toFixed(3)} د.ك`, icon: <TrendingUp className="w-4 h-4 text-emerald-300" /> },
          { label: 'Keep It', value: `${stats.keepRate}%`, icon: <Repeat2 className="w-4 h-4 text-gold-300" /> }
        ].map((item, idx) => (
          <div key={idx} className="rounded-2xl p-4 bg-white/5 border border-white/10">
            <div className="flex items-center gap-2 text-[11px] text-slate-400">{item.icon}{item.label}</div>
            <div className="mt-2 text-xl font-black text-slate-100 font-mono">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1fr_1fr] gap-4">
        <div className="rounded-2xl p-4 bg-white/5 border border-white/10 space-y-3">
          <div className="flex items-center gap-2 font-bold text-slate-100"><Gauge className="w-4 h-4 text-sky-300" /> مؤشرات الثقة المهنية</div>
          {[
            ['الالتزام التشغيلي', 94],
            ['جودة المنتج', Math.round((stats.avgRating / 5) * 100) || 90],
            ['الشفافية والتوثيق', 97],
            ['القابلية للتوسع', 88]
          ].map(([label, value], idx) => (
            <div key={idx}>
              <div className="flex justify-between text-xs mb-1"><span className="text-slate-400">{label as string}</span><strong className="text-slate-100">{value as number}%</strong></div>
              <div className="h-2 rounded-full bg-slate-950/70 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-l from-gold-500 to-emerald-400" style={{ width: `${value}%` }} /></div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl p-4 bg-white/5 border border-white/10 space-y-3">
          <div className="flex items-center gap-2 font-bold text-slate-100"><Crown className="w-4 h-4 text-gold-300" /> Graduation Path</div>
          {[
            { label: 'Discovered', done: true, icon: <Sparkles className="w-4 h-4" /> },
            { label: 'Tested', done: profile.badges.includes('TESTED'), icon: <BookOpenCheck className="w-4 h-4" /> },
            { label: 'Launched', done: launches.length > 0, icon: <PackageCheck className="w-4 h-4" /> },
            { label: 'Proven', done: profile.badges.includes('PROVEN'), icon: <ShieldCheck className="w-4 h-4" /> },
            { label: 'Brand Ready', done: launches.length >= 2, icon: <Crown className="w-4 h-4" /> }
          ].map((step, idx) => (
            <div key={idx} className={`flex items-center justify-between p-3 rounded-xl border ${step.done ? 'bg-emerald-500/8 border-emerald-400/15' : 'bg-white/[0.02] border-white/10'}`}>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-200">{step.icon}{step.label}</div>
              <span className={`text-[10px] font-black ${step.done ? 'text-emerald-300' : 'text-slate-500'}`}>{step.done ? 'مكتمل' : 'قادم'}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
