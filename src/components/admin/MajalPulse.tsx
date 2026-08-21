import React from 'react';
import {
  Activity,
  ArrowUpLeft,
  Building2,
  CircleAlert,
  FileSignature,
  FlaskConical,
  Radar,
  Sparkles,
  TrendingUp,
  WalletCards
} from 'lucide-react';
import { store } from '../../lib/store';

export const MajalPulse: React.FC = () => {
  const pulse = (() => {
    const creatorsAvailable = store.creators.filter(c => c.isAvailableForMatching).length;
    const verifiedHosts = store.hosts.filter(h => h.verificationStatus === 'VERIFIED').length;
    const strongMatches = store.matches.filter(m => m.matchScore.overallScore >= store.policy.strongMatchThreshold).length;
    const labs = store.collaborations.filter(c => ['TASTING_COMPLETED', 'LAB_ACTIVE'].includes(c.stage)).length;
    const contractPipeline = store.collaborations.filter(c => ['COMMERCIAL_AGREED', 'CONTRACT_DRAFTED', 'SIGNED', 'PRE_LAUNCH'].includes(c.stage)).length;
    const liveProducts = store.launches.filter(l => l.status === 'LIVE' || l.status === 'PERMANENT').length;
    const attention = store.disputes.filter(d => ['OPEN', 'UNDER_INVESTIGATION'].includes(d.status)).length
      + store.hosts.filter(h => ['NEEDS_ACTION', 'EXPIRED_DOCS', 'SUSPENDED'].includes(h.verificationStatus)).length;
    const economicValue = store.orders.filter(o => o.status === 'COMPLETED').reduce((sum, o) => sum + o.grossAmountKwd, 0);
    const creatorValue = store.accruals.reduce((sum, a) => sum + a.accruedAmountKwd, 0);
    return { creatorsAvailable, verifiedHosts, strongMatches, labs, contractPipeline, liveProducts, attention, economicValue, creatorValue };
  })();

  const cards = [
    { label: 'مبدعون متاحون', value: pulse.creatorsAvailable, detail: 'جاهزون للمطابقة', icon: <Sparkles className="w-5 h-5" />, tone: 'text-emerald-300' },
    { label: 'منشآت متحققة', value: pulse.verifiedHosts, detail: 'قادرة على الاحتضان', icon: <Building2 className="w-5 h-5" />, tone: 'text-[#e8c880]' },
    { label: 'Matches قوية', value: pulse.strongMatches, detail: `${store.policy.strongMatchThreshold}% فأعلى`, icon: <Radar className="w-5 h-5" />, tone: 'text-sky-300' },
    { label: 'في المختبر', value: pulse.labs, detail: 'تذوق أو تطوير', icon: <FlaskConical className="w-5 h-5" />, tone: 'text-violet-300' },
    { label: 'قريبة من الإطلاق', value: pulse.contractPipeline, detail: 'عقد / Pre-launch', icon: <FileSignature className="w-5 h-5" />, tone: 'text-fuchsia-300' },
    { label: 'منتجات حية', value: pulse.liveProducts, detail: 'تباع الآن', icon: <TrendingUp className="w-5 h-5" />, tone: 'text-emerald-300' },
    { label: 'تحتاج تدخلًا', value: pulse.attention, detail: 'نزاع أو امتثال', icon: <CircleAlert className="w-5 h-5" />, tone: pulse.attention ? 'text-rose-300' : 'text-stone-400' },
    { label: 'قيمة اقتصادية', value: `${pulse.economicValue.toFixed(3)} د.ك`, detail: `حقوق مبدعين ${pulse.creatorValue.toFixed(3)} د.ك`, icon: <WalletCards className="w-5 h-5" />, tone: 'text-[#e8c880]' }
  ];

  return (
    <section className="glass-panel rounded-[30px] p-5 md:p-6 border border-white/10 relative overflow-hidden">
      <div className="absolute -top-20 -left-16 w-64 h-64 bg-emerald-400/8 rounded-full blur-3xl pointer-events-none" />
      <div className="relative z-10 space-y-5">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 text-emerald-300 text-xs font-black"><Activity className="w-4 h-4" /> MAJAL PULSE</div>
            <h2 className="text-xl md:text-2xl font-black mt-2">نبض مجال — السوق كله في شاشة واحدة</h2>
            <p className="text-xs text-stone-400 mt-2 leading-6">من العرض والطلب إلى المختبر والعقود والإطلاق والقيمة الاقتصادية، مع إبراز أي نقطة تحتاج تدخل الإدارة.</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-400/20 text-[11px] text-emerald-300 font-bold">
            <ArrowUpLeft className="w-4 h-4" /> لقطة تشغيلية حية من بيانات المنصة
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {cards.map((card, index) => (
            <div key={index} className="rounded-2xl p-4 bg-slate-950/35 border border-white/10 hover:border-white/20 transition-colors">
              <div className={`${card.tone}`}>{card.icon}</div>
              <div className={`mt-3 text-xl md:text-2xl font-black ${card.tone} font-mono`}>{card.value}</div>
              <div className="text-xs font-bold text-stone-200 mt-1">{card.label}</div>
              <div className="text-[10px] text-stone-500 mt-1">{card.detail}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
