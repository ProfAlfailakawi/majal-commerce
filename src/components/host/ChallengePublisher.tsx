import React, { useMemo, useState } from 'react';
import { X, Check, Briefcase, CalendarDays } from 'lucide-react';
import { store } from '../../lib/store';
import { useDialogBehavior } from '../../hooks/useDialogBehavior';

interface ChallengePublisherProps {
  isOpen: boolean;
  onClose: () => void;
}

const toLocalDate = (date: Date) => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const ChallengePublisher: React.FC<ChallengePublisherProps> = ({ isOpen, onClose }) => {
  const dialogRef = useDialogBehavior<HTMLDivElement>(isOpen, onClose);
  const host = useMemo(() => store.hosts.find(h => h.id === store.activeUser.hostBusinessId), [store.activeUser.hostBusinessId]);
  const defaultDeadline = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return toLocalDate(d);
  }, []);

  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [category, setCategory] = useState('حلويات');
  const [targetPriceKwd, setTargetPriceKwd] = useState<number>(8.5);
  const [costCeilingKwd, setCostCeilingKwd] = useState<number>(3);
  const [estimatedVolumeUnits, setEstimatedVolumeUnits] = useState<number>(1000);
  const [deadline, setDeadline] = useState(defaultDeadline);
  const [notice, setNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = () => {
    const result = store.publishChallenge({
      title: title.trim(),
      brief: brief.trim(),
      category,
      targetPriceKwd,
      costCeilingKwd,
      estimatedVolumeUnits: Math.max(1, estimatedVolumeUnits),
      deadline: new Date(`${deadline}T23:59:59`).toISOString(),
      equipmentAvailable: host?.capabilities.equipment.slice(0, 6) || [],
      dietaryConstraints: [],
      exclusivityPreference: true
    });
    if (!result) {
      setNotice('تعذر نشر التحدي. تأكد من العنوان، الوصف، الأسعار، الموعد والصلاحية.');
      return;
    }
    setNotice('تم نشر التحدي وربطه بالمنشأة وتسجيله في Audit Log.');
    setTimeout(onClose, 650);
  };

  const isValid = title.trim().length >= 4 && brief.trim().length >= 10 && targetPriceKwd > 0 && costCeilingKwd >= 0 && costCeilingKwd < targetPriceKwd && estimatedVolumeUnits > 0 && !!deadline;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/85 backdrop-blur-md animate-in fade-in">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="challenge-publisher-title" className="glass-panel border border-white/10 rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl text-stone-100 flex flex-col max-h-[92vh]">
        <div className="p-5 bg-slate-950/45 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#e8c880]/10 text-[#e8c880] rounded-xl border border-[#e8c880]/20"><Briefcase className="w-5 h-5" /></div>
            <div>
              <h3 id="challenge-publisher-title" className="font-black text-base">نشر تحدي ابتكار جديد</h3>
              <p className="text-xs text-stone-400 mt-1">المنشأة: {host?.commercialName || 'غير محددة'}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="إغلاق ناشر التحدي" className="p-2 text-stone-400 hover:text-stone-100 rounded-xl hover:bg-white/5"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          {notice && <div className={`rounded-xl p-3 border font-bold ${notice.startsWith('تم') ? 'bg-emerald-500/10 border-emerald-400/20 text-emerald-300' : 'bg-rose-500/10 border-rose-400/20 text-rose-300'}`}>{notice}</div>}

          <label className="block">
            <span className="block text-stone-300 font-bold mb-1.5">عنوان التحدي</span>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="مثال: حلوى كويتية جديدة لموسم الشتاء" className="w-full glass-input rounded-xl p-3 text-stone-100 outline-none" />
          </label>

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block"><span className="block text-stone-300 font-bold mb-1.5">الفئة</span><select value={category} onChange={e => setCategory(e.target.value)} className="w-full glass-input rounded-xl p-3 text-stone-100 outline-none"><option value="حلويات">حلويات وكيك</option><option value="صلصات">صلصات ومخللات</option><option value="مخبوزات">مخبوزات وفطائر</option><option value="وجبات">وجبات</option></select></label>
            <label className="block"><span className="block text-stone-300 font-bold mb-1.5">الموعد النهائي</span><div className="relative"><CalendarDays className="w-4 h-4 absolute right-3 top-3.5 text-stone-500" /><input type="date" min={toLocalDate(new Date())} value={deadline} onChange={e => setDeadline(e.target.value)} className="w-full glass-input rounded-xl py-3 pr-10 pl-3 text-stone-100 outline-none" /></div></label>
          </div>

          <label className="block"><span className="block text-stone-300 font-bold mb-1.5">موجز الحاجة التجارية</span><textarea rows={4} value={brief} onChange={e => setBrief(e.target.value)} placeholder="ما نوع المنتج المطلوب؟ ما القيود التشغيلية؟ وما الذي سيجعل المقترح مناسبًا للمنشأة؟" className="w-full glass-input rounded-xl p-3 text-stone-100 outline-none resize-none" /></label>

          <div className="grid sm:grid-cols-3 gap-4 rounded-2xl p-4 bg-slate-950/35 border border-white/10">
            <label><span className="block text-stone-400 font-bold mb-1.5">سعر البيع المستهدف</span><input type="number" min="0.1" step="0.25" value={targetPriceKwd} onChange={e => setTargetPriceKwd(Number(e.target.value))} className="w-full glass-input rounded-xl p-2.5 text-[#e8c880] font-bold outline-none" /></label>
            <label><span className="block text-stone-400 font-bold mb-1.5">سقف التكلفة</span><input type="number" min="0" step="0.25" value={costCeilingKwd} onChange={e => setCostCeilingKwd(Number(e.target.value))} className="w-full glass-input rounded-xl p-2.5 outline-none" /></label>
            <label><span className="block text-stone-400 font-bold mb-1.5">الحجم المتوقع</span><input type="number" min="1" step="50" value={estimatedVolumeUnits} onChange={e => setEstimatedVolumeUnits(Number(e.target.value))} className="w-full glass-input rounded-xl p-2.5 outline-none" /></label>
          </div>

          <div className="rounded-2xl p-4 bg-white/5 border border-white/10 text-[11px] text-stone-400 leading-6">
            المعدات ستُشتق من ملف المنشأة الحالي بدل إدخال قائمة ثابتة داخل التحدي. بعد النشر سيظهر التحدي فقط ضمن سياق هذه المنشأة، وسيُسجل من قام بالنشر في Audit Log.
          </div>
        </div>

        <div className="p-4 bg-slate-950/45 border-t border-white/10 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2.5 bg-white/5 text-stone-300 font-bold rounded-xl text-xs border border-white/10">إلغاء</button>
          <button onClick={handleSubmit} disabled={!isValid} className="px-5 py-2.5 bg-[#e8c880] hover:bg-[#f0d590] disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5"><Check className="w-4 h-4" /><span>نشر التحدي</span></button>
        </div>
      </div>
    </div>
  );
};
