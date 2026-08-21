import React, { useEffect, useMemo, useState } from 'react';
import {
  Rocket,
  CheckCircle2,
  Circle,
  AlertTriangle,
  ShieldCheck,
  Play,
  LockKeyhole,
  RefreshCw,
  BadgeCheck
} from 'lucide-react';
import { store } from '../../lib/store';
import { LaunchGateChecklist, Collaboration } from '../../types/majal';

interface LaunchGateManagerProps {
  collaboration: Collaboration;
}

const manualKeys: (keyof LaunchGateChecklist)[] = [
  'productionRecipeApproved',
  'productNamePriceApproved',
  'packagingDataCompleted',
  'productionLocationSelected',
  'settlementConfigApproved'
];

export const LaunchGateManager: React.FC<LaunchGateManagerProps> = ({ collaboration }) => {
  const [, setTick] = useState(0);
  useEffect(() => store.subscribe(() => setTick(t => t + 1)), []);

  const gate = store.getLaunchGate(collaboration.id);
  const canOperate = ['HOST_OWNER', 'HOST_OPERATIONS'].includes(store.activeUser.role) && store.activeUser.hostBusinessId === collaboration.hostBusinessId;
  const hasLaunch = !!(collaboration.activeLaunch || store.launches.find(l => l.collaborationId === collaboration.id));

  const itemsConfig: { key: keyof Omit<LaunchGateChecklist, 'allRequirementsPassed'>; label: string; desc: string; source: 'SYSTEM' | 'HOST' }[] = [
    { key: 'hostVerified', label: 'التحقق من المنشأة المرخّصة', desc: 'مشتق آليًا من حالة التحقق الخاصة بالمنشأة.', source: 'SYSTEM' },
    { key: 'requiredDocsValid', label: 'صلاحية مستندات الامتثال', desc: 'يحسبها النظام من المستندات وتواريخ الانتهاء.', source: 'SYSTEM' },
    { key: 'contractSigned', label: 'العقد موقع بالكامل', desc: 'لا يمكن تجاوزه يدويًا؛ يعتمد على حالة العقد الفعلية.', source: 'SYSTEM' },
    { key: 'productionRecipeApproved', label: 'اعتماد نسخة الإنتاج', desc: 'قرار تشغيلي من المالك أو فريق التشغيل بعد المختبر.', source: 'HOST' },
    { key: 'productNamePriceApproved', label: 'اعتماد الاسم والسعر', desc: 'تأكيد الاسم التجاري وسعر الإطلاق النهائي.', source: 'HOST' },
    { key: 'allergensCompleted', label: 'بيانات الحساسية مكتملة', desc: 'يحسبها النظام من بيانات المنتج المسجلة.', source: 'SYSTEM' },
    { key: 'packagingDataCompleted', label: 'اعتماد التغليف والحفظ', desc: 'تأكيد جاهزية العبوة وتعليمات الحفظ والتداول.', source: 'HOST' },
    { key: 'productionLocationSelected', label: 'تحديد موقع الإنتاج', desc: 'تأكيد فرع أو مطبخ الإنتاج المسؤول.', source: 'HOST' },
    { key: 'branchAvailabilitySelected', label: 'تحديد الفروع المتاحة', desc: 'مشتق من فروع الإطلاق الفعلية.', source: 'SYSTEM' },
    { key: 'settlementConfigApproved', label: 'اعتماد إعدادات المستحقات', desc: 'تأكيد نسب الأطراف وآلية التسوية دون إنشاء محفظة مالية افتراضية.', source: 'HOST' },
    { key: 'photosReady', label: 'الوسائط جاهزة', desc: 'يحسبها النظام من صور المنتج الموجودة.', source: 'SYSTEM' }
  ];

  const completedItems = gate ? itemsConfig.filter(item => gate[item.key]).length : 0;
  const isAllReady = !!gate?.allRequirementsPassed;

  const readinessLabel = useMemo(() => {
    if (!gate) return 'غير مهيأ';
    if (isAllReady) return 'جاهز للإطلاق';
    if (completedItems >= 8) return 'قريب جدًا';
    if (completedItems >= 5) return 'قيد التجهيز';
    return 'يحتاج تجهيز';
  }, [gate, isAllReady, completedItems]);

  const handlePrepare = async () => {
    await Promise.resolve(store.prepareLaunch(collaboration.id));
  };

  const handleToggle = async (key: keyof LaunchGateChecklist) => {
    if (!gate || !manualKeys.includes(key) || !canOperate) return;
    await Promise.resolve(store.setLaunchGateItem(collaboration.id, key, !gate[key]));
  };

  const handleLaunch = async () => {
    await Promise.resolve(store.activateLaunch(collaboration.id));
  };

  return (
    <section className="glass-panel rounded-3xl border border-white/10 p-6 space-y-6 text-slate-100">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Rocket className="w-5 h-5 text-[#e8c880]" />
            <h3 className="font-black text-lg text-slate-100">Launch Gate — بوابة الإطلاق الحقيقية</h3>
          </div>
          <p className="text-xs text-slate-400 leading-6 max-w-3xl">
            الشروط الرقابية تُشتق من البيانات الفعلية، والشروط التشغيلية فقط يمكن اعتمادها يدويًا. لا يوجد زر قادر على تجاوز العقد أو الترخيص أو بيانات الحساسية.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="glass-card px-4 py-3 rounded-2xl border border-white/10 min-w-[130px] text-center">
            <span className="text-[10px] text-slate-500 block">الجاهزية</span>
            <span className="text-base font-black text-[#e8c880]">{completedItems} / {itemsConfig.length}</span>
            <span className="text-[10px] text-slate-400 block mt-1">{readinessLabel}</span>
          </div>
          {!hasLaunch && canOperate && (
            <button onClick={handlePrepare} className="px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-xs font-black hover:bg-white/10 flex items-center gap-2">
              <RefreshCw className="w-4 h-4" /> تجهيز سجل الإطلاق
            </button>
          )}
        </div>
      </div>

      {!gate ? (
        <div className="rounded-2xl p-6 bg-amber-500/10 border border-amber-400/20 text-sm text-amber-200 leading-7">
          يجب أولًا إنشاء سجل إطلاق بعد اكتمال التفاوض والعقد. لا يتم افتراض جاهزية الإطلاق تلقائيًا.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {itemsConfig.map(item => {
            const checked = gate[item.key];
            const manual = item.source === 'HOST';
            const interactive = manual && canOperate;
            return (
              <button
                type="button"
                key={item.key}
                onClick={() => handleToggle(item.key)}
                disabled={!interactive}
                className={`p-4 rounded-2xl text-right transition-all flex items-start gap-3 border ${
                  checked
                    ? 'bg-emerald-500/8 border-emerald-400/20 text-slate-100'
                    : 'bg-white/4 border-white/8 text-slate-400'
                } ${interactive ? 'hover:border-[#e8c880]/30 cursor-pointer' : 'cursor-default'}`}
              >
                <div className="mt-0.5">
                  {checked ? <CheckCircle2 className="w-5 h-5 text-emerald-300" /> : <Circle className="w-5 h-5 text-slate-600" />}
                </div>
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="block font-bold text-xs text-slate-100">{item.label}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border ${manual ? 'bg-[#c7a55b]/10 border-[#e8c880]/20 text-[#e8c880]' : 'bg-sky-500/10 border-sky-400/20 text-sky-300'}`}>
                      {manual ? 'قرار تشغيلي' : 'مشتق آليًا'}
                    </span>
                  </div>
                  <span className="block text-[11px] text-slate-400 leading-5">{item.desc}</span>
                </div>
                {!interactive && <LockKeyhole className="w-4 h-4 text-slate-600 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}

      <div className="pt-4 border-t border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-2 text-xs">
          {isAllReady ? (
            <><ShieldCheck className="w-4 h-4 text-emerald-300 mt-0.5" /><span className="text-emerald-300 font-bold">جميع المتطلبات اجتازت البوابة. يمكن تحويل الإطلاق إلى LIVE.</span></>
          ) : (
            <><AlertTriangle className="w-4 h-4 text-amber-300 mt-0.5" /><span className="text-amber-200">الإطلاق مقفول حتى تكتمل جميع المتطلبات النظامية والتشغيلية.</span></>
          )}
        </div>

        <button
          onClick={handleLaunch}
          disabled={!isAllReady || !canOperate}
          className={`px-6 py-3 rounded-2xl font-black text-xs transition-all flex items-center gap-2 ${
            isAllReady && canOperate
              ? 'bg-gradient-to-r from-emerald-500 to-emerald-400 text-slate-950 hover:scale-[1.02] shadow-xl'
              : 'bg-white/5 text-slate-600 cursor-not-allowed border border-white/10'
          }`}
        >
          {isAllReady ? <BadgeCheck className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          <span>{canOperate ? 'تحويل المنتج إلى LIVE' : 'المشاهدة فقط حسب صلاحيتك'}</span>
        </button>
      </div>
    </section>
  );
};
