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

  const funnel = [
    { label: 'مبدعون متاحون', detail: 'جاهزون للمطابقة', value: pulse.creatorsAvailable, icon: <Sparkles className="w-4 h-4" />, tone: 'text-emerald-300', bar: 'bg-emerald-400/70' },
    { label: 'مطابقات قوية', detail: `${store.policy.strongMatchThreshold}% فأعلى`, value: pulse.strongMatches, icon: <Radar className="w-4 h-4" />, tone: 'text-sky-300', bar: 'bg-sky-400/70' },
    { label: 'في المختبر', detail: 'تذوق أو تطوير', value: pulse.labs, icon: <FlaskConical className="w-4 h-4" />, tone: 'text-violet-300', bar: 'bg-violet-400/70' },
    { label: 'قريبة من الإطلاق', detail: 'عقد / ما قبل الإطلاق', value: pulse.contractPipeline, icon: <FileSignature className="w-4 h-4" />, tone: 'text-fuchsia-300', bar: 'bg-fuchsia-400/70' },
    { label: 'منتجات حية', detail: 'تباع الآن', value: pulse.liveProducts, icon: <TrendingUp className="w-4 h-4" />, tone: 'text-emerald-300', bar: 'bg-emerald-400/70' }
  ];
  const funnelMax = Math.max(1, ...funnel.map(f => f.value));

  const cards = [
    { label: 'منشآت متحققة', value: pulse.verifiedHosts, detail: 'قادرة على الاحتضان', icon: <Building2 className="w-5 h-5" />, tone: 'text-gold-300' },
    { label: 'تحتاج تدخلًا', value: pulse.attention, detail: 'نزاع أو امتثال', icon: <CircleAlert className="w-5 h-5" />, tone: pulse.attention ? 'text-rose-300' : 'text-slate-400' },
    { label: 'قيمة اقتصادية', value: `${pulse.economicValue.toFixed(3)} د.ك`, detail: `حقوق مبدعين ${pulse.creatorValue.toFixed(3)} د.ك`, icon: <WalletCards className="w-5 h-5" />, tone: 'text-gold-300' }
  ];

  return (
    <section className="glass-panel rounded-[30px] p-5 md:p-6 border border-white/10 relative overflow-hidden">
      <div className="majal-glow -top-[17rem] -end-16 w-[40rem] h-[40rem]" style={{ '--glow': 'rgba(52,211,153,0.08)' } as React.CSSProperties} />
      <div className="relative z-10 space-y-5">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 text-emerald-300 text-xs font-black"><Activity className="w-4 h-4" /> نبض مجال</div>
            <h2 className="text-xl md:text-2xl font-black mt-2">نبض مجال — السوق كله في شاشة واحدة</h2>
            <p className="text-xs text-slate-400 mt-2 leading-6">من العرض والطلب إلى المختبر والعقود والإطلاق والقيمة الاقتصادية، مع إبراز أي نقطة تحتاج تدخل الإدارة.</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-400/20 text-xs text-emerald-300 font-bold">
            <ArrowUpLeft className="w-4 h-4" /> لقطة تشغيلية حية من بيانات المنصة
          </div>
        </div>

        <ol aria-label="مسار الصفقات من المبدعين إلى الإطلاق" className="rounded-2xl p-4 bg-slate-950/35 border border-white/10 space-y-2.5">
          {funnel.map(step => (
            <li key={step.label} className="flex items-center gap-3 text-xs">
              <span className={`flex items-center gap-1.5 w-40 shrink-0 font-bold text-slate-200`}><span className={step.tone} aria-hidden="true">{step.icon}</span>{step.label}</span>
              <span className="hidden md:block w-40 shrink-0 text-slate-400">{step.detail}</span>
              <span className="flex-1 h-3 rounded-full bg-white/5 overflow-hidden" aria-hidden="true"><span className={`block h-full rounded-full ${step.bar}`} style={{ width: `${(step.value / funnelMax) * 100}%` }} /></span>
              <strong className={`w-10 text-end font-mono text-base ${step.tone}`}>{step.value}</strong>
            </li>
          ))}
        </ol>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {cards.map((card, index) => (
            <div key={index} className="rounded-2xl p-4 bg-slate-950/35 border border-white/10 hover:border-white/20 transition-colors">
              <div className={`${card.tone}`}>{card.icon}</div>
              <div className={`mt-3 text-xl md:text-2xl font-black ${card.tone} font-mono`}>{card.value}</div>
              <div className="text-xs font-bold text-slate-200 mt-1">{card.label}</div>
              <div className="text-xs text-slate-400 mt-1">{card.detail}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
