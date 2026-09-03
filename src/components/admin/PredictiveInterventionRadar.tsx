import React from 'react';
import {
  ArrowUpLeft,
  BadgeCheck,
  FileWarning,
  Radar,
  Rocket,
  ShieldAlert,
  TimerReset,
  WalletCards
} from 'lucide-react';
import { store } from '../../lib/store';

type RadarTarget = 'LIQUIDITY' | 'TRUST' | 'AUDIT';

type RadarSignal = {
  id: string;
  severity: 'CRITICAL' | 'HIGH' | 'WATCH';
  title: string;
  evidence: string;
  nextAction: string;
  target: RadarTarget;
  icon: React.ReactNode;
};

const severityMeta = {
  CRITICAL: { label: 'حرج', tone: 'border-rose-400/25 bg-rose-500/8 text-rose-200' },
  HIGH: { label: 'عالٍ', tone: 'border-amber-300/25 bg-amber-400/8 text-amber-100' },
  WATCH: { label: 'راقب', tone: 'border-sky-300/20 bg-sky-400/8 text-sky-100' }
} as const;

export const PredictiveInterventionRadar: React.FC<{ onNavigate: (target: RadarTarget) => void }> = ({ onNavigate }) => {
  const now = Date.now();
  const openDisputes = store.disputes.filter(dispute => ['OPEN', 'UNDER_INVESTIGATION'].includes(dispute.status));
  const complianceRisk = store.compliance.filter(document => ['EXPIRED', 'EXPIRING_SOON', 'REJECTED'].includes(document.status));
  const staleCollaborations = store.collaborations.filter(collaboration => {
    if (['LIVE', 'REVIEW', 'RENEWED', 'ENDED'].includes(collaboration.stage)) return false;
    const updatedAt = Date.parse(collaboration.updatedAt);
    return Number.isFinite(updatedAt) && now - updatedAt > 14 * 86400000;
  });
  const blockedLaunches = store.launches.filter(launch =>
    ['SCHEDULED', 'PAUSED'].includes(launch.status) && !launch.gateChecklist.allRequirementsPassed
  );
  const unsettledAccruals = store.accruals.filter(accrual =>
    ['ACCRUED', 'SETTLEMENT_ELIGIBLE'].includes(accrual.settlementStatus)
  );
  const unsettledValue = unsettledAccruals.reduce((sum, accrual) => sum + accrual.accruedAmountKwd, 0);

  const signals: RadarSignal[] = [
    ...(openDisputes.length ? [{
      id: 'disputes', severity: 'CRITICAL' as const, title: `${openDisputes.length} نزاع مفتوح قبل أن يتحول إلى ضرر ثقة`,
      evidence: `الأولوية الأعلى: ${openDisputes.some(dispute => dispute.priority === 'CRITICAL') ? 'يوجد نزاع حرج' : 'تحقيقات نشطة'}.`,
      nextAction: 'افتح الثقة والمخاطر وعيّن مالك قرار وموعد حسم.', target: 'TRUST' as const,
      icon: <ShieldAlert className="w-5 h-5" />
    }] : []),
    ...(complianceRisk.length ? [{
      id: 'compliance', severity: 'HIGH' as const, title: `${complianceRisk.length} مستند امتثال قد يعطل إطلاقًا قريبًا`,
      evidence: 'الرادار يقرأ حالة المستند الحالية قبل أن تصل المشكلة إلى بوابة الإطلاق.',
      nextAction: 'رتّب التجديد حسب أقرب إطلاق متأثر.', target: 'TRUST' as const,
      icon: <FileWarning className="w-5 h-5" />
    }] : []),
    ...(blockedLaunches.length ? [{
      id: 'launches', severity: 'HIGH' as const, title: `${blockedLaunches.length} إطلاق مجدول أو متوقف بحاجز ناقص`,
      evidence: 'موعد التشغيل موجود بينما شرط واحد أو أكثر لم يجتز بوابة الإطلاق.',
      nextAction: 'راجع عناصر البوابة قبل الالتزام التسويقي أو التشغيلي.', target: 'AUDIT' as const,
      icon: <Rocket className="w-5 h-5" />
    }] : []),
    ...(staleCollaborations.length ? [{
      id: 'stale-deals', severity: 'WATCH' as const, title: `${staleCollaborations.length} تعاون بلا حركة منذ أكثر من 14 يومًا`,
      evidence: 'الصفقات الصامتة تتنبأ بالتسرب أكثر من الصفقات المرفوضة بوضوح.',
      nextAction: 'قسّمها إلى: قرار، معلومة ناقصة، أو إغلاق صريح.', target: 'LIQUIDITY' as const,
      icon: <TimerReset className="w-5 h-5" />
    }] : []),
    ...(unsettledAccruals.length ? [{
      id: 'settlements', severity: 'WATCH' as const, title: `${unsettledValue.toFixed(3)} د.ك حقوق متراكمة بانتظار دورة التسوية`,
      evidence: `${unsettledAccruals.length} قيد استحقاق لم يصل بعد إلى حالة PAID.`,
      nextAction: 'راجع العمر والاستثناءات قبل أن تتحول إلى تذكرة دعم.', target: 'AUDIT' as const,
      icon: <WalletCards className="w-5 h-5" />
    }] : [])
  ];

  return (
    <section className="glass-panel rounded-[30px] p-5 md:p-6 border border-white/10 relative overflow-hidden">
      <div className="majal-glow -top-[18rem] -right-16 w-[42rem] h-[42rem]" style={{ '--glow': 'rgba(56,189,248,0.08)' } as React.CSSProperties} />
      <div className="relative z-10 space-y-5">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 text-sky-300 text-xs font-black"><Radar className="w-4 h-4" /> PRE-EMPTIVE RADAR</div>
            <h2 className="text-xl md:text-2xl font-black mt-2">رادار ما قبل الاختناق</h2>
            <p className="text-xs text-slate-400 mt-2 leading-6">لا ينتظر التنبيه بعد وقوع المشكلة؛ يجمع الإشارات التي قد توقف صفقة أو إطلاقًا أو تسوية، ويشرح سببها والخطوة التالية.</p>
          </div>
          <div className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[11px] text-slate-400">قواعد قابلة للتفسير — بلا ادعاء تنبؤ غامض</div>
        </div>

        {signals.length ? (
          <div className="grid lg:grid-cols-2 gap-3">
            {signals.map(signal => {
              const meta = severityMeta[signal.severity];
              return (
                <article key={signal.id} className={`rounded-2xl p-4 border ${meta.tone}`}>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-950/35 flex items-center justify-center shrink-0">{signal.icon}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-black px-2.5 py-1 rounded-lg bg-slate-950/35">{meta.label}</span>
                        <h3 className="font-black text-sm">{signal.title}</h3>
                      </div>
                      <p className="text-xs opacity-75 leading-6 mt-2">{signal.evidence}</p>
                      <button onClick={() => onNavigate(signal.target)} className="mt-3 inline-flex items-center gap-2 text-xs font-black hover:text-white transition-colors">
                        {signal.nextAction}<ArrowUpLeft className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl p-5 bg-emerald-500/8 border border-emerald-400/20 flex items-start gap-3 text-emerald-100">
            <BadgeCheck className="w-5 h-5 shrink-0 mt-0.5" />
            <div><div className="font-black">لا توجد إشارة اختناق من البيانات المتاحة</div><p className="text-xs text-emerald-100/65 leading-6 mt-1">النتيجة تعني أن القواعد الحالية لم تجد خطرًا؛ لا تعني غياب المخاطر خارج البيانات الموصولة.</p></div>
          </div>
        )}
      </div>
    </section>
  );
};
