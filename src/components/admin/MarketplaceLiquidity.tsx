import React from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Building2,
  CircleGauge,
  Scale,
  SearchCheck,
  Sparkles
} from 'lucide-react';
import { store } from '../../lib/store';
import { EmptyState } from '../common/EmptyState';
import { FoldedNote } from '../common/MatchMeter';

export const MarketplaceLiquidity: React.FC = () => {
  const matchableProducts = store.products.filter(p => ['APPROVED_FOR_MARKETPLACE','AVAILABLE_FOR_MATCHING','IN_DISCUSSION','TESTING','COMMERCIAL_NEGOTIATION','CONTRACTING','LAUNCH_GATE','READY_TO_LAUNCH','LIVE_DROP','LIVE_TRIAL','LIVE_PERMANENT'].includes(p.status));
  const openChallenges = store.challenges.filter(c => c.status === 'OPEN');
  const productCounts: Record<string, number> = {};
  matchableProducts.forEach(p => { productCounts[p.category] = (productCounts[p.category] || 0) + 1; });
  const demandCounts: Record<string, number> = {};
  openChallenges.forEach(c => { demandCounts[c.category] = (demandCounts[c.category] || 0) + 1; });
  const categories = Array.from(new Set([...Object.keys(productCounts), ...Object.keys(demandCounts)])).map(category => {
    const supply = productCounts[category] || 0;
    const demand = demandCounts[category] || 0;
    const balance = demand === supply ? 'BALANCED' : demand > supply ? 'NEED_SUPPLY' : 'NEED_DEMAND';
    return { category, supply, demand, balance };
  });
  const liquidityScale = Math.max(1, ...categories.flatMap(c => [c.supply, c.demand]));

  const avgMatch = store.matches.length ? Math.round(store.matches.reduce((s, m) => s + m.matchScore.overallScore, 0) / store.matches.length) : 0;

  return (
    <section className="glass-panel rounded-3xl border border-white/10 p-5 md:p-6 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-400/20 flex items-center justify-center text-sky-300"><CircleGauge className="w-6 h-6" /></div>
          <div><h3 className="text-lg font-black text-slate-100">سيولة السوق</h3><p className="text-xs text-slate-400 mt-1">مؤشر تشغيلي مبني على المنتجات القابلة للمطابقة والتحديات المفتوحة، وليس على كل السجلات المؤرشفة.</p></div>
        </div>
        <div className="flex gap-2 text-xs flex-wrap"><span className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-slate-300">متوسط المطابقة: <strong className="text-sky-300">{avgMatch}%</strong></span><span className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-slate-300">تحديات مفتوحة: <strong className="text-gold-300">{openChallenges.length}</strong></span></div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="rounded-2xl p-3 sm:p-4 bg-white/5 border border-white/10"><Sparkles className="w-5 h-5 text-emerald-300" /><div className="mt-3 text-xs text-slate-400">منتجات قابلة للمطابقة</div><div className="text-2xl font-black mt-1">{matchableProducts.length}</div></div>
        <div className="rounded-2xl p-3 sm:p-4 bg-white/5 border border-white/10"><Building2 className="w-5 h-5 text-sky-300" /><div className="mt-3 text-xs text-slate-400">منشآت متحققة</div><div className="text-2xl font-black mt-1">{store.hosts.filter(h => h.verificationStatus === 'VERIFIED').length}</div></div>
        <div className="rounded-2xl p-3 sm:p-4 bg-white/5 border border-white/10"><SearchCheck className="w-5 h-5 text-gold-300" /><div className="mt-3 text-xs text-slate-400">إشارات المطابقة</div><div className="text-2xl font-black mt-1">{store.matches.length}</div></div>
      </div>

      <div className="grid gap-3">
        {categories.length === 0 ? <EmptyState
            variant="inline"
            icon={<Scale className="w-6 h-6" />}
            title="البيانات ما تكفي لقراءة السيولة"
            body="نحتاج منتجات معروضة وطلب مقابل في نفس الفئة قبل ما نعطيك مؤشرًا يُعتمد عليه."
          /> : categories.map((row, idx) => (
          <div key={idx} className="rounded-2xl p-4 bg-white/5 border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div><div className="font-black text-slate-100">{row.category}</div><div className="text-xs text-slate-400 mt-1">مقارنة مباشرة بين العرض القابل للمطابقة والطلب المفتوح</div></div>
            <div aria-hidden="true" className="flex md:flex-1 md:max-w-xs items-center gap-0.5">
              <div className="flex-1 flex justify-end"><span className="h-2 rounded-s-full bg-emerald-400/70" style={{ width: `${(row.supply / liquidityScale) * 100}%` }} /></div>
              <span className="w-px h-4 bg-white/20" />
              <div className="flex-1 flex justify-start"><span className="h-2 rounded-e-full bg-sky-400/70" style={{ width: `${(row.demand / liquidityScale) * 100}%` }} /></div>
            </div>
            <div className="flex items-center gap-3 text-xs flex-wrap"><div className="px-3 py-2 rounded-xl bg-emerald-500/7 border border-emerald-400/15 flex items-center gap-2"><ArrowUpFromLine className="w-4 h-4 text-emerald-300" /> عرض: <strong>{row.supply}</strong></div><div className="px-3 py-2 rounded-xl bg-sky-500/7 border border-sky-400/15 flex items-center gap-2"><ArrowDownToLine className="w-4 h-4 text-sky-300" /> طلب: <strong>{row.demand}</strong></div><div className={`px-3 py-2 rounded-xl border font-black ${row.balance === 'BALANCED' ? 'bg-emerald-500/7 border-emerald-400/15 text-emerald-300' : 'bg-amber-500/7 border-amber-400/15 text-amber-300'}`}>{row.balance === 'BALANCED' ? 'متوازن عدديًا' : row.balance === 'NEED_SUPPLY' ? 'فجوة عرض' : 'فجوة طلب'}</div></div>
          </div>
        ))}
      </div>

      <FoldedNote summary="تنبيه: المؤشر عددي ومبدئي">هذا المؤشر عددي ومبدئي؛ جودة المطابقة والقدرة التشغيلية تظل أهم من مجرد مساواة عدد المنتجات بعدد التحديات.</FoldedNote>
    </section>
  );
};
