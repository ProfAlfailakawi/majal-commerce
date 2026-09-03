import React, { useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  Building2,
  Gauge,
  PackageOpen,
  Rocket,
  Store,
  TrendingUp,
  Users,
  Zap,
  Link2
} from 'lucide-react';
import { store } from '../../lib/store';
import { hasPermission } from '../../lib/permissions';
import { StatusPill } from '../common/StatusPill';

interface LaunchWarRoomProps { hostBusinessId: string; }

export const LaunchWarRoom: React.FC<LaunchWarRoomProps> = ({ hostBusinessId }) => {
  const canSeeFinance = store.activeUser.hostBusinessId === hostBusinessId && hasPermission(store.activeUser, 'VIEW_HOST_FINANCE');
  const launch = store.launches.find(l => l.hostBusinessId === hostBusinessId && (l.status === 'LIVE' || l.status === 'PERMANENT'));
  const product = store.products.find(p => p.id === launch?.productId);
  const orders = store.orders.filter(o => o.launchId === launch?.id && o.status === 'COMPLETED');
  const reviews = store.reviews.filter(r => r.launchId === launch?.id);
  const host = store.hosts.find(h => h.id === hostBusinessId);

  const metrics = useMemo(() => {
    const gmv = canSeeFinance ? orders.reduce((s, o) => s + o.grossAmountKwd, 0) : 0;
    const units = launch?.unitsSold || orders.reduce((s, o) => s + o.unitsCount, 0);
    const cap = launch?.quantityCapUnits || Math.max(units, 1);
    const sellThrough = Math.min(100, Math.round(units / cap * 100));
    const repeatIntent = reviews.length ? Math.round(reviews.filter(r => r.wouldBuyAgain).length / reviews.length * 100) : 0;
    return { gmv, units, cap, sellThrough, repeatIntent };
  }, [orders, reviews, launch, canSeeFinance]);

  if (!launch) {
    return (
      <section className="glass-panel rounded-3xl border border-white/10 p-8 text-center">
        <Rocket className="w-8 h-8 text-slate-600 mx-auto" />
        <h3 className="font-black mt-3">ما فيه إطلاق حيّ لهذه المنشأة الآن</h3>
        <p className="text-xs text-slate-500 mt-2">تظهر غرفة القيادة فقط عند وجود إطلاق فعلي تابع لنفس المنشأة.</p>
      </section>
    );
  }

  const branchRows = launch.branches.map(branchId => {
    const branch = host?.branches.find(b => b.id === branchId);
    const branchOrders = orders.filter(o => o.branchId === branchId);
    const units = branchOrders.reduce((sum, o) => sum + o.unitsCount, 0);
    return { id: branchId, name: branch?.name || branchId, units, hasTrackedData: branchOrders.length > 0 };
  });

  const sourceUnits = {
    CREATOR: orders.filter(o => o.acquisitionSource === 'CREATOR').reduce((s, o) => s + o.unitsCount, 0),
    HOST: orders.filter(o => o.acquisitionSource === 'HOST').reduce((s, o) => s + o.unitsCount, 0),
    MAJAL: orders.filter(o => o.acquisitionSource === 'MAJAL').reduce((s, o) => s + o.unitsCount, 0),
    UNKNOWN: orders.filter(o => !o.acquisitionSource || o.acquisitionSource === 'UNKNOWN').reduce((s, o) => s + o.unitsCount, 0)
  };
  const trackedSourceUnits = sourceUnits.CREATOR + sourceUnits.HOST + sourceUnits.MAJAL;
  const pct = (v: number) => trackedSourceUnits ? Math.round(v / trackedSourceUnits * 100) : 0;

  const signals = [
    { level: metrics.sellThrough >= 50 ? 'GOOD' : 'WATCH', title: 'Sell-through', text: `تم بيع ${metrics.sellThrough}% من الحد المحدد للإطلاق.` },
    { level: reviews.length && metrics.repeatIntent >= 60 ? 'GOOD' : 'WATCH', title: 'نية إعادة الشراء', text: reviews.length ? `${metrics.repeatIntent}% من التقييمات المسجلة تشير إلى شراء متكرر.` : 'لا توجد تقييمات كافية لاستخراج إشارة إعادة شراء.' },
    { level: metrics.sellThrough > 70 ? 'WATCH' : 'GOOD', title: 'المخزون', text: metrics.sellThrough > 70 ? 'اقترب الإطلاق من استهلاك غالبية الكمية المتاحة.' : 'الكمية المتبقية ضمن النطاق الحالي.' }
  ];

  return (
    <section className="glass-panel rounded-3xl border border-white/10 p-5 md:p-6 space-y-5 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-rose-400/60 to-transparent" />
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-400/20 flex items-center justify-center text-rose-300"><Rocket className="w-6 h-6" /></div>
          <div><div className="flex items-center gap-2 flex-wrap"><h3 className="text-lg font-black">غرفة قيادة الإطلاق</h3><StatusPill status={launch.status} /></div><p className="text-xs text-slate-400 mt-1">{product?.publicName} — بيانات هذا الإطلاق فقط، بلا خلط مع منشآت أخرى.</p></div>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-300"><Activity className="w-4 h-4" /> عرض تشغيلي حي</div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: canSeeFinance ? 'GMV الحالي' : 'المؤشر المالي', value: canSeeFinance ? `${metrics.gmv.toFixed(3)} د.ك` : 'محجوب', icon: <TrendingUp className="w-4 h-4 text-emerald-300" /> },
          { label: 'الوحدات المباعة', value: `${metrics.units}`, icon: <PackageOpen className="w-4 h-4 text-sky-300" /> },
          { label: 'Sell-through', value: `${metrics.sellThrough}%`, icon: <Gauge className="w-4 h-4 text-gold-300" /> },
          { label: 'نية إعادة الشراء', value: reviews.length ? `${metrics.repeatIntent}%` : '—', icon: <Users className="w-4 h-4 text-fuchsia-300" /> },
          { label: 'الفروع المتاحة', value: `${launch.branches.length}`, icon: <Building2 className="w-4 h-4 text-amber-300" /> }
        ].map((item, idx) => <div key={idx} className="rounded-2xl p-4 bg-white/5 border border-white/10"><div className="flex items-center gap-2 text-[11px] text-slate-400">{item.icon}{item.label}</div><div className="mt-2 text-lg font-black font-mono">{item.value}</div></div>)}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-2xl p-4 bg-white/5 border border-white/10 space-y-3">
          <div className="font-bold flex items-center gap-2"><Store className="w-4 h-4 text-sky-300" /> تتبع الفروع</div>
          {branchRows.length ? branchRows.map(branch => (
            <div key={branch.id} className="rounded-xl p-3 bg-slate-950/45 border border-white/10 flex items-center justify-between gap-3">
              <span className="text-xs text-slate-300 font-bold">{branch.name}</span>
              <span className={`text-[11px] ${branch.hasTrackedData ? 'text-sky-300 font-mono' : 'text-slate-500'}`}>{branch.hasTrackedData ? `${branch.units} وحدة متتبعة` : 'لا يوجد Branch Attribution في الطلبات بعد'}</span>
            </div>
          )) : <div className="text-xs text-slate-500">لم تحدد فروع لهذا الإطلاق.</div>}
        </div>

        <div className="rounded-2xl p-4 bg-white/5 border border-white/10 space-y-3">
          <div className="font-bold flex items-center gap-2"><Zap className="w-4 h-4 text-gold-300" /> إشارات التشغيل</div>
          {signals.map((signal, idx) => <div key={idx} className={`rounded-xl p-3 border ${signal.level === 'GOOD' ? 'bg-emerald-500/6 border-emerald-400/15' : 'bg-amber-500/6 border-amber-400/15'}`}><div className="flex items-center gap-2 text-xs font-black">{signal.level === 'GOOD' ? <Activity className="w-4 h-4 text-emerald-300" /> : <AlertTriangle className="w-4 h-4 text-amber-300" />}{signal.title}</div><div className="mt-1 text-[11px] text-slate-400 leading-6">{signal.text}</div></div>)}
        </div>
      </div>

      <div className="rounded-2xl p-4 bg-gradient-to-l from-gold-500/8 via-white/[0.03] to-fuchsia-500/8 border border-white/10 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div><div className="font-black">إسناد النمو</div><div className="text-xs text-slate-500 mt-1">النسب تظهر فقط من الطلبات التي تحمل acquisitionSource فعلية؛ لا توجد نسب مختلقة.</div></div>
          <button onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/drop/${launch.id}`)} className="px-3 py-2 rounded-xl bg-gold-500 text-slate-950 text-xs font-black flex items-center gap-2"><Link2 className="w-4 h-4" /> نسخ رابط الإطلاق</button>
        </div>
        <div className="grid md:grid-cols-4 gap-3 text-xs">
          {[['Creator-driven', sourceUnits.CREATOR, pct(sourceUnits.CREATOR), 'text-emerald-300'], ['Host-driven', sourceUnits.HOST, pct(sourceUnits.HOST), 'text-sky-300'], ['Majal-driven', sourceUnits.MAJAL, pct(sourceUnits.MAJAL), 'text-gold-300'], ['غير منسوب', sourceUnits.UNKNOWN, null, 'text-slate-400']].map(([label, units, percentage, tone]) => (
            <div key={label as string} className="rounded-xl p-3 bg-slate-950/45 border border-white/10"><div className="text-slate-500">{label}</div><div className={`text-xl font-black mt-1 ${tone}`}>{percentage === null ? `${units} وحدة` : `${percentage}%`}</div><div className="text-[10px] text-slate-500 mt-1">{percentage === null ? 'يحتاج Tracking source' : `${units} وحدة متتبعة`}</div></div>
          ))}
        </div>
      </div>
    </section>
  );
};
