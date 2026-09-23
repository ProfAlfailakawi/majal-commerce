import React, { FormEvent, useState } from 'react';
import { BriefcaseBusiness, CheckCircle2, Send, X } from 'lucide-react';
import { createKuwaitiJob } from '../../lib/ecosystemClient';
import { useDialogBehavior } from '../../hooks/useDialogBehavior';

interface Props { isOpen: boolean; onClose: () => void; onCreated?: () => void; employerLabel?: string; }

export const JobComposer: React.FC<Props> = ({ isOpen, onClose, onCreated, employerLabel }) => {
  const dialogRef = useDialogBehavior<HTMLDivElement>(isOpen, onClose);
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [employmentType, setEmploymentType] = useState<'FULL_TIME'|'PART_TIME'|'CONTRACT'|'INTERNSHIP'>('FULL_TIME');
  const [location, setLocation] = useState('الكويت');
  const [description, setDescription] = useState('');
  const [requirements, setRequirements] = useState('');
  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  if (!isOpen) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setSuccess(''); setBusy(true);
    try {
      const result = await createKuwaitiJob({
        title, department, employmentType, location, description,
        requirements: requirements.split('\n').map(v => v.trim()).filter(Boolean),
        ...(salaryMin ? { salaryMinFils: Math.round(Number(salaryMin) * 1000) } : {}),
        ...(salaryMax ? { salaryMaxFils: Math.round(Number(salaryMax) * 1000) } : {})
      });
      setSuccess(result.message);
      onCreated?.();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذّر إرسال الإعلان.'); }
    finally { setBusy(false); }
  };

  return <div className="fixed inset-0 z-[90] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="job-composer-title" className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto glass-panel rounded-[28px] border border-white/10 shadow-2xl">
      <div className="sticky top-0 z-10 p-5 border-b border-white/10 bg-ink-700/90 backdrop-blur-xl flex items-center justify-between">
        <div className="flex items-center gap-3"><span className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-400/20 grid place-items-center"><BriefcaseBusiness className="w-5 h-5 text-emerald-300" /></span><div><h2 id="job-composer-title" className="font-black">بوابة توظيف كويتي</h2><p className="text-[11px] text-slate-400 mt-1">{employerLabel || 'إعلان جهة العمل'} — كل إعلان يمر على اعتماد إدارة مجال قبل النشر.</p></div></div>
        <button onClick={onClose} aria-label="إغلاق" className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5"><X className="w-5 h-5" /></button>
      </div>
      {success ? <div className="p-8 text-center space-y-4"><CheckCircle2 className="w-12 h-12 text-emerald-300 mx-auto" /><h3 className="font-black text-lg">وصل الإعلان للإدارة</h3><p className="text-sm text-slate-400 leading-7 max-w-md mx-auto">{success}</p><button onClick={onClose} className="px-5 py-2.5 rounded-xl bg-emerald-400 text-slate-950 font-black text-xs">تم</button></div> :
      <form onSubmit={submit} className="p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="sm:col-span-2 text-xs font-bold text-slate-300">المسمى الوظيفي<input value={title} onChange={e=>setTitle(e.target.value)} required minLength={2} maxLength={160} className="mt-1.5 w-full glass-input rounded-xl px-4 py-3 text-sm outline-none" placeholder="مثال: مشرف تشغيل مطبخ" /></label>
          <label className="text-xs font-bold text-slate-300">القسم<input value={department} onChange={e=>setDepartment(e.target.value)} maxLength={120} className="mt-1.5 w-full glass-input rounded-xl px-4 py-3 text-sm outline-none" placeholder="التشغيل" /></label>
          <label className="text-xs font-bold text-slate-300">نوع العمل<select value={employmentType} onChange={e=>setEmploymentType(e.target.value as typeof employmentType)} className="mt-1.5 w-full glass-input rounded-xl px-4 py-3 text-sm outline-none"><option value="FULL_TIME">دوام كامل</option><option value="PART_TIME">دوام جزئي</option><option value="CONTRACT">عقد</option><option value="INTERNSHIP">تدريب</option></select></label>
          <label className="sm:col-span-2 text-xs font-bold text-slate-300">الموقع<input value={location} onChange={e=>setLocation(e.target.value)} required maxLength={160} className="mt-1.5 w-full glass-input rounded-xl px-4 py-3 text-sm outline-none" /></label>
          <label className="sm:col-span-2 text-xs font-bold text-slate-300">وصف الوظيفة<textarea value={description} onChange={e=>setDescription(e.target.value)} required minLength={20} maxLength={4000} rows={4} className="mt-1.5 w-full glass-input rounded-xl px-4 py-3 text-sm outline-none resize-none" placeholder="المهام، بيئة العمل، وما الذي سيقوم به الموظف..." /></label>
          <label className="sm:col-span-2 text-xs font-bold text-slate-300">المتطلبات <span className="text-slate-400 font-medium">(كل شرط في سطر)</span><textarea value={requirements} onChange={e=>setRequirements(e.target.value)} rows={3} className="mt-1.5 w-full glass-input rounded-xl px-4 py-3 text-sm outline-none resize-none" placeholder={'خبرة في التشغيل\nإجادة التعامل مع فرق العمل'} /></label>
          <label className="text-xs font-bold text-slate-300">راتب من <span className="text-slate-400">د.ك — اختياري</span><input value={salaryMin} onChange={e=>setSalaryMin(e.target.value)} inputMode="decimal" className="mt-1.5 w-full glass-input rounded-xl px-4 py-3 text-sm outline-none" /></label>
          <label className="text-xs font-bold text-slate-300">راتب إلى <span className="text-slate-400">د.ك — اختياري</span><input value={salaryMax} onChange={e=>setSalaryMax(e.target.value)} inputMode="decimal" className="mt-1.5 w-full glass-input rounded-xl px-4 py-3 text-sm outline-none" /></label>
        </div>
        <div className="rounded-2xl p-4 bg-emerald-500/5 border border-emerald-400/15 text-xs text-slate-300 leading-6">هذه البوابة مخصصة لفرص توظيف الكويتيين. الإعلان يبقى <strong className="text-amber-300">بانتظار المراجعة</strong> ولا يظهر للعامة إلا بعد موافقة إدارة مجال.</div>
        {error && <div role="alert" className="rounded-xl p-3 bg-rose-500/10 border border-rose-400/20 text-xs text-rose-200">{error}</div>}
        <button disabled={busy} className="w-full py-3.5 rounded-xl bg-emerald-400 text-slate-950 text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50"><Send className="w-4 h-4" />{busy ? 'جارٍ الإرسال…' : 'إرسال للإدارة للموافقة'}</button>
      </form>}
    </div>
  </div>;
};
