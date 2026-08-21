import React, { useEffect, useState } from 'react';
import { Settings2, Save, ShieldCheck, Gauge, Clock3, ShoppingCart, Percent, KeyRound, Radar, ScanSearch, Undo2 } from 'lucide-react';
import { store } from '../../lib/store';

export const PlatformPolicyCenter: React.FC = () => {
  const [, setTick] = useState(0);
  useEffect(() => store.subscribe(() => setTick(t => t + 1)), []);
  const [draft, setDraft] = useState(() => ({ ...store.policy }));
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setDraft({ ...store.policy });
  }, [store.policy.updatedAt]);

  const update = (key: keyof typeof draft, value: number) => setDraft(prev => ({ ...prev, [key]: value }));
  const save = () => {
    const result = store.updatePlatformPolicy({
      platformFeePercent: Number(draft.platformFeePercent),
      recipeGrantDays: Number(draft.recipeGrantDays),
      maxOrderUnits: Number(draft.maxOrderUnits),
      complianceWarningDays: Number(draft.complianceWarningDays),
      strongMatchThreshold: Number(draft.strongMatchThreshold),
      settlementCycleDays: Number(draft.settlementCycleDays)
    });
    setNotice(result ? 'تم اعتماد سياسة المنصة وتسجيل التغيير في Audit Log.' : 'تعذر حفظ السياسة. راجع الحدود المسموحة.');
    setTimeout(() => setNotice(null), 3500);
  };

  const fields = [
    { key: 'platformFeePercent', label: 'عمولة مجال الافتراضية', suffix: '%', min: 0, max: 30, icon: <Percent className="w-4 h-4" />, help: 'تستخدم كقيمة افتراضية عندما لا يحدد عرض تجاري نسبة مختلفة.' },
    { key: 'recipeGrantDays', label: 'مدة إذن الوصفة', suffix: 'يوم', min: 1, max: 365, icon: <KeyRound className="w-4 h-4" />, help: 'مدة صلاحية الوصول بعد موافقة المبدع قبل أن ينتهي تلقائيًا.' },
    { key: 'maxOrderUnits', label: 'الحد الأعلى لوحدات الطلب', suffix: 'وحدة', min: 1, max: 100, icon: <ShoppingCart className="w-4 h-4" />, help: 'حاجز Domain Guard يطبق حتى لو استدعيت العملية خارج الواجهة.' },
    { key: 'complianceWarningDays', label: 'نافذة تحذير الامتثال', suffix: 'يوم', min: 1, max: 120, icon: <Clock3 className="w-4 h-4" />, help: 'قبل انتهاء المستند بهذه المدة يتحول إلى EXPIRING_SOON.' },
    { key: 'strongMatchThreshold', label: 'عتبة المطابقة القوية', suffix: '%', min: 50, max: 100, icon: <Radar className="w-4 h-4" />, help: 'تستخدم في مؤشرات Pulse وقياس الفرص عالية الملاءمة.' },
    { key: 'settlementCycleDays', label: 'دورة التسوية', suffix: 'يوم', min: 1, max: 90, icon: <Gauge className="w-4 h-4" />, help: 'تحدد النافذة الافتراضية لكشف التسوية، ولا تعني أن التحويل البنكي تم.' }
  ] as const;

  const changes = fields.filter(field => Number(draft[field.key]) !== Number(store.policy[field.key]));
  const impactSignals = [
    changes.some(item => item.key === 'platformFeePercent') && `${store.collaborations.filter(item => item.currentOffer).length} عرضاً قائماً يحتاج مراجعة؛ القيمة الجديدة لا تعيد كتابة العروض السابقة.`,
    changes.some(item => item.key === 'recipeGrantDays') && `${store.recipeGrants.filter(item => item.status === 'APPROVED').length} إذن وصفة نشط يبقى بتاريخ انتهائه الحالي؛ السياسة تطبق على الأذونات الجديدة.`,
    changes.some(item => item.key === 'maxOrderUnits') && `${store.launches.filter(item => ['LIVE', 'PERMANENT'].includes(item.status)).length} إطلاق حي سيتأثر بحد الطلب الجديد.`,
    changes.some(item => item.key === 'complianceWarningDays') && `${store.compliance.length} مستند امتثال ستعاد قراءة نافذة تحذيره عند التحديث القادم.`,
    changes.some(item => item.key === 'strongMatchThreshold') && `${store.matches.filter(item => item.matchScore.overallScore >= Number(draft.strongMatchThreshold)).length} مطابقة ستصنف قوية وفق العتبة المقترحة.`,
    changes.some(item => item.key === 'settlementCycleDays') && `${new Set(store.accruals.filter(item => item.settlementStatus === 'SETTLEMENT_ELIGIBLE').map(item => item.creatorId)).size} مبدعين لديهم مستحقات مؤهلة؛ الاعتماد لا ينفذ دفعاً.`
  ].filter(Boolean) as string[];

  return (
    <section className="glass-panel rounded-3xl p-5 md:p-6 border border-white/10 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#e8c880]/10 border border-[#e8c880]/20 flex items-center justify-center text-[#e8c880]"><Settings2 className="w-6 h-6" /></div>
          <div>
            <h2 className="text-lg font-black">Platform Policy Center</h2>
            <p className="text-xs text-stone-400 mt-1">سياسات تشغيل عالمية لا يمكن تعديلها إلا من السوبر أدمن.</p>
          </div>
        </div>
        <div className="text-[11px] text-stone-500 leading-5">
          آخر تحديث: {new Date(store.policy.updatedAt).toLocaleString('ar-KW')}<br />
          بواسطة: {store.policy.updatedBy}
        </div>
      </div>

      {notice && <div className={`rounded-2xl px-4 py-3 text-xs font-bold border ${notice.startsWith('تم') ? 'bg-emerald-500/10 border-emerald-400/20 text-emerald-300' : 'bg-rose-500/10 border-rose-400/20 text-rose-300'}`}>{notice}</div>}

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {fields.map(field => (
          <label key={field.key} className="rounded-2xl p-4 bg-slate-950/40 border border-white/10 space-y-3">
            <div className="flex items-center gap-2 text-stone-200 font-bold text-sm">{field.icon}<span>{field.label}</span></div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={field.min}
                max={field.max}
                value={draft[field.key] as number}
                onChange={e => update(field.key, Number(e.target.value))}
                className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none font-mono"
              />
              <span className="text-xs text-stone-500 whitespace-nowrap">{field.suffix}</span>
            </div>
            <p className="text-[11px] text-stone-500 leading-5">{field.help}</p>
          </label>
        ))}
      </div>

      {changes.length > 0 && <div className="rounded-2xl p-4 bg-sky-500/5 border border-sky-400/20 space-y-3" aria-live="polite">
        <div className="flex items-center gap-2 text-sky-200 font-black text-sm"><ScanSearch className="w-4 h-4" /><span>معاينة أثر القرار قبل اعتماده</span></div>
        <div className="flex flex-wrap gap-2">
          {changes.map(item => <span key={item.key} className="px-2.5 py-1 rounded-lg bg-slate-950/40 border border-white/10 text-[10px] text-slate-300">{item.label}: {store.policy[item.key]} ← {draft[item.key]}</span>)}
        </div>
        <ul className="space-y-1.5 text-[11px] text-slate-400 leading-5">
          {impactSignals.map(signal => <li key={signal} className="flex gap-2"><span className="text-sky-300">•</span><span>{signal}</span></li>)}
        </ul>
      </div>}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-4 border-t border-white/10">
        <div className="flex items-start gap-2 text-xs text-stone-400 leading-6 max-w-2xl">
          <ShieldCheck className="w-4 h-4 mt-1 shrink-0 text-emerald-300" />
          <span>تعديل هذه القيم يغيّر منطق النظام نفسه، وليس مجرد نص في الواجهة. كل تغيير يُسجل باسم السوبر أدمن في سجل التدقيق.</span>
        </div>
        <div className="flex items-center gap-2">
          {changes.length > 0 && <button onClick={() => setDraft({ ...store.policy })} className="px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-slate-300 hover:text-white text-xs font-bold flex items-center gap-2"><Undo2 className="w-4 h-4" /> إلغاء المسودة</button>}
          <button onClick={save} disabled={!changes.length} className="px-5 py-3 rounded-2xl bg-[#e8c880] hover:bg-[#f0d590] disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-black text-xs flex items-center justify-center gap-2">
            <Save className="w-4 h-4" /> اعتماد {changes.length || 0} تغييرات
          </button>
        </div>
      </div>
    </section>
  );
};
