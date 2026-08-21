import React, { useEffect, useMemo, useState } from 'react';
import { FlaskConical, Award, Calculator, Plus, AlertCircle, History } from 'lucide-react';
import { store } from '../../lib/store';
import { Collaboration, LabBatch } from '../../types/majal';
import { UnitEconomicsModal } from '../common/UnitEconomicsModal';

interface LabWorkspaceProps {
  collaboration: Collaboration;
}

export const LabWorkspace: React.FC<LabWorkspaceProps> = ({ collaboration }) => {
  const [, setTick] = useState(0);
  useEffect(() => store.subscribe(() => setTick(t => t + 1)), []);
  const [showCalculator, setShowCalculator] = useState(false);
  const product = store.products.find(p => p.id === collaboration.productId);
  const tastingSession = store.tastings.find(t => t.collaborationId === collaboration.id);
  const recipeVersions = store.recipeVersions.filter(r => r.productId === collaboration.productId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const batches = store.labBatches.filter(b => b.collaborationId === collaboration.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const [recipeVersion, setRecipeVersion] = useState(product?.currentRecipeVersion || recipeVersions[0]?.versionNumber || 'V1.0');
  const [yieldQuantity, setYieldQuantity] = useState(10);
  const [measuredCostKwd, setMeasuredCostKwd] = useState(0);
  const [prepTimeMinutes, setPrepTimeMinutes] = useState(30);
  const [wastePercentage, setWastePercentage] = useState(0);
  const [batchDecisionNote, setBatchDecisionNote] = useState('');
  const [proposedChanges, setProposedChanges] = useState('');
  const [selectedBatchDecision, setSelectedBatchDecision] = useState<LabBatch['decision']>('APPROVE_NEXT');
  const [notice, setNotice] = useState('');

  const latest = batches[0];
  const improvement = useMemo(() => {
    if (batches.length < 2) return undefined;
    const previous = batches[1];
    return {
      cost: latest.measuredCostKwd - previous.measuredCostKwd,
      time: latest.prepTimeMinutes - previous.prepTimeMinutes,
      waste: latest.wastePercentage - previous.wastePercentage
    };
  }, [batches.length, latest?.id]);

  const handleRecordNewBatch = () => {
    const batch = store.addLabBatch(collaboration.id, {
      recipeVersion,
      batchDate: new Date().toISOString(),
      yieldQuantity,
      measuredCostKwd,
      prepTimeMinutes,
      wastePercentage,
      tastingResult: batchDecisionNote.trim() || 'لا توجد ملاحظة تذوق إضافية.',
      photos: [],
      proposedChanges: proposedChanges.trim() || 'لا توجد تغييرات مقترحة.',
      decision: selectedBatchDecision
    });
    if (!batch) {
      setNotice('تعذر حفظ الدفعة. تحقق من الصلاحيات والقيم المدخلة.');
      return;
    }
    setNotice(`تم حفظ الدفعة ${batch.id} وربطها بالتعاون وسجل التدقيق.`);
    setBatchDecisionNote('');
    setProposedChanges('');
    setTimeout(() => setNotice(''), 3500);
  };

  return (
    <div className="space-y-6 text-stone-100">
      <section className="glass-panel p-6 rounded-3xl border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#c7a55b]/10 text-[#e8c880] rounded-2xl border border-[#e8c880]/20"><FlaskConical className="w-6 h-6" /></div>
          <div><h3 className="text-lg font-black">Lab Workspace — مختبر تطوير المنتج</h3><p className="text-xs text-stone-400 mt-1 leading-6">كل دفعة محفوظة كبيانات تشغيلية قابلة للمراجعة؛ لا توجد أرقام افتراضية عند تسجيل تجربة جديدة.</p></div>
        </div>
        <button onClick={() => setShowCalculator(true)} className="px-4 py-2.5 bg-[#c7a55b] hover:bg-[#d7b96d] text-stone-950 font-black rounded-xl text-xs flex items-center gap-2"><Calculator className="w-4 h-4" /> حاسبة الجدوى</button>
      </section>

      {notice && <div className={`p-3 rounded-xl text-xs font-bold border ${notice.startsWith('تم') ? 'bg-emerald-500/10 text-emerald-300 border-emerald-400/20' : 'bg-rose-500/10 text-rose-300 border-rose-400/20'}`}>{notice}</div>}

      {tastingSession && (
        <section className="glass-panel p-6 rounded-3xl border border-white/10 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap"><div className="flex items-center gap-2 text-[#e8c880] font-bold text-sm"><Award className="w-5 h-5" /><span>جلسة التذوق المسجلة — Blind Tasting</span></div><span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-500/10 text-emerald-300 border border-emerald-400/20 font-mono">{tastingSession.aggregateOverallScore} / 10</span></div>
          <div className="grid md:grid-cols-2 gap-4 text-xs">{tastingSession.scorecards.map((sc, i) => <div key={i} className="p-4 rounded-xl bg-slate-950/45 border border-white/10"><div className="flex items-center justify-between font-bold"><span>{sc.evaluatorName} — {sc.evaluatorRole}</span><span className="text-[#e8c880]">{sc.overallScore}/10</span></div><p className="text-stone-400 text-[11px] leading-6 mt-2">{sc.notes}</p></div>)}</div>
        </section>
      )}

      <section className="glass-panel p-6 rounded-3xl border border-white/10 space-y-5 text-xs">
        <div className="flex items-center gap-2"><Plus className="w-4 h-4 text-[#e8c880]" /><h4 className="font-black text-sm">تسجيل دفعة تجريبية جديدة</h4></div>
        <div className="grid md:grid-cols-3 gap-4">
          <label className="space-y-1"><span className="text-stone-400 font-bold">نسخة الوصفة</span><select value={recipeVersion} onChange={e => setRecipeVersion(e.target.value)} className="w-full glass-input rounded-xl p-3 outline-none">{recipeVersions.map(v => <option key={v.id} value={v.versionNumber}>{v.versionNumber}</option>)}</select></label>
          <label className="space-y-1"><span className="text-stone-400 font-bold">إنتاجية الدفعة</span><input type="number" min="1" value={yieldQuantity} onChange={e => setYieldQuantity(Number(e.target.value))} className="w-full glass-input rounded-xl p-3 outline-none" /></label>
          <label className="space-y-1"><span className="text-stone-400 font-bold">التكلفة المقاسة د.ك</span><input type="number" min="0" step="0.001" value={measuredCostKwd} onChange={e => setMeasuredCostKwd(Number(e.target.value))} className="w-full glass-input rounded-xl p-3 outline-none" /></label>
          <label className="space-y-1"><span className="text-stone-400 font-bold">زمن التحضير بالدقائق</span><input type="number" min="1" value={prepTimeMinutes} onChange={e => setPrepTimeMinutes(Number(e.target.value))} className="w-full glass-input rounded-xl p-3 outline-none" /></label>
          <label className="space-y-1"><span className="text-stone-400 font-bold">الهدر %</span><input type="number" min="0" max="100" step="0.1" value={wastePercentage} onChange={e => setWastePercentage(Number(e.target.value))} className="w-full glass-input rounded-xl p-3 outline-none" /></label>
          <label className="space-y-1"><span className="text-stone-400 font-bold">القرار</span><select value={selectedBatchDecision} onChange={e => setSelectedBatchDecision(e.target.value as LabBatch['decision'])} className="w-full glass-input rounded-xl p-3 outline-none"><option value="APPROVE_NEXT">تجربة أخرى</option><option value="PRODUCTION_CANDIDATE">مرشح إنتاج</option><option value="REJECT">مرفوض</option></select></label>
        </div>
        <div className="grid md:grid-cols-2 gap-4"><label className="space-y-1"><span className="text-stone-400 font-bold">ملاحظات التذوق/التشغيل</span><textarea rows={3} value={batchDecisionNote} onChange={e => setBatchDecisionNote(e.target.value)} className="w-full glass-input rounded-xl p-3 outline-none resize-none" /></label><label className="space-y-1"><span className="text-stone-400 font-bold">التغييرات المقترحة</span><textarea rows={3} value={proposedChanges} onChange={e => setProposedChanges(e.target.value)} className="w-full glass-input rounded-xl p-3 outline-none resize-none" /></label></div>
        <button onClick={handleRecordNewBatch} className="px-5 py-3 bg-[#c7a55b] hover:bg-[#d7b96d] text-stone-950 font-black rounded-xl text-xs">حفظ الدفعة وربطها بالسجل</button>
      </section>

      <section className="glass-panel p-6 rounded-3xl border border-white/10 space-y-4">
        <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><History className="w-4 h-4 text-sky-300" /><h4 className="font-black">سجل الدفعات</h4></div><span className="text-xs text-stone-500">{batches.length} دفعات</span></div>
        {improvement && <div className="grid grid-cols-3 gap-2 text-xs"><div className="rounded-xl p-3 bg-white/5 border border-white/10">Δ التكلفة <strong className={improvement.cost <= 0 ? 'text-emerald-300' : 'text-rose-300'}>{improvement.cost.toFixed(3)}</strong></div><div className="rounded-xl p-3 bg-white/5 border border-white/10">Δ الزمن <strong className={improvement.time <= 0 ? 'text-emerald-300' : 'text-rose-300'}>{improvement.time}</strong></div><div className="rounded-xl p-3 bg-white/5 border border-white/10">Δ الهدر <strong className={improvement.waste <= 0 ? 'text-emerald-300' : 'text-rose-300'}>{improvement.waste.toFixed(1)}%</strong></div></div>}
        <div className="space-y-3 text-xs">{batches.length === 0 ? <div className="p-8 text-center text-stone-500">لا توجد دفعات مختبر محفوظة.</div> : batches.map(b => <div key={b.id} className="p-4 rounded-2xl bg-slate-950/40 border border-white/10 space-y-3"><div className="flex items-center justify-between gap-3 flex-wrap"><span className="font-black text-[#e8c880]">{new Date(b.batchDate).toLocaleString('ar-KW')} — {b.recipeVersion}</span><span className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${b.decision === 'PRODUCTION_CANDIDATE' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-400/20' : b.decision === 'REJECT' ? 'bg-rose-500/10 text-rose-300 border-rose-400/20' : 'bg-amber-500/10 text-amber-300 border-amber-400/20'}`}>{b.decision}</span></div><div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-stone-400"><div>تكلفة <strong className="text-stone-100">{b.measuredCostKwd.toFixed(3)}</strong></div><div>إنتاجية <strong className="text-stone-100">{b.yieldQuantity}</strong></div><div>زمن <strong className="text-stone-100">{b.prepTimeMinutes}د</strong></div><div>هدر <strong className="text-stone-100">{b.wastePercentage}%</strong></div></div><p className="text-stone-400 leading-6">{b.tastingResult}</p>{b.proposedChanges && <div className="flex gap-2 text-[11px] text-sky-300"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{b.proposedChanges}</div>}</div>)}</div>
      </section>

      {showCalculator && <UnitEconomicsModal isOpen={showCalculator} onClose={() => setShowCalculator(false)} />}
    </div>
  );
};
