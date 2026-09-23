import React, { useState } from 'react';
import { BriefcaseBusiness, Mail, Phone, UserRound, X } from 'lucide-react';
import { fetchKuwaitiJobApplications } from '../../lib/ecosystemClient';
import { KuwaitiJobApplication, KuwaitiJobPost } from '../../types/majal';

export const JobApplicationsButton: React.FC<{ job: KuwaitiJobPost }> = ({ job }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [applications, setApplications] = useState<KuwaitiJobApplication[]>([]);

  const show = async () => {
    setOpen(true); setLoading(true); setError('');
    try { setApplications((await fetchKuwaitiJobApplications(job.id)).applications); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذّر تحميل طلبات التوظيف.'); }
    finally { setLoading(false); }
  };

  return <>
    <button type="button" onClick={() => void show()} className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[11px] font-black text-slate-200 hover:border-sky-400/20 transition inline-flex items-center gap-1.5"><UserRound className="w-3.5 h-3.5" />طلبات التوظيف</button>
    {open && <div className="fixed inset-0 z-[170] bg-slate-950/80 backdrop-blur-sm p-4 grid place-items-center" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div role="dialog" aria-modal="true" aria-label={`طلبات ${job.title}`} className="w-full max-w-2xl max-h-[86vh] overflow-hidden glass-panel rounded-3xl border border-white/10 shadow-2xl">
        <header className="p-5 border-b border-white/10 flex items-start justify-between gap-4"><div className="flex items-center gap-3 min-w-0"><span className="w-10 h-10 rounded-2xl bg-sky-500/10 border border-sky-400/15 grid place-items-center"><BriefcaseBusiness className="w-5 h-5 text-sky-300" /></span><div className="min-w-0"><h3 className="font-black text-slate-100 truncate">{job.title}</h3><p className="text-xs text-slate-400 mt-1">طلبات تصل فقط إلى الجهة صاحبة الإعلان.</p></div></div><button type="button" onClick={() => setOpen(false)} className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 grid place-items-center"><X className="w-4 h-4" /></button></header>
        <div className="p-5 overflow-y-auto max-h-[68vh] space-y-3">
          {loading && <div className="py-10 text-center text-sm text-slate-400">جارٍ تحميل الطلبات…</div>}
          {error && <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-400/20 text-xs text-rose-200">{error}</div>}
          {!loading && !error && applications.length === 0 && <div className="py-10 text-center text-sm text-slate-400">لا توجد طلبات على هذا الإعلان حتى الآن.</div>}
          {!loading && applications.map(app => <article key={app.id} className="rounded-2xl p-4 bg-white/[0.025] border border-white/10 space-y-3">
            <div className="flex items-center justify-between gap-3"><div><h4 className="font-black text-sm text-slate-100">{app.fullName}</h4><p className="text-[11px] text-slate-400 mt-1">خبرة {app.yearsExperience} سنة · إقرار كويتي مقدم</p></div><span className="text-[11px] text-slate-400">{new Date(app.createdAt).toLocaleDateString('ar-KW')}</span></div>
            {app.summary && <p className="text-xs text-slate-400 leading-6">{app.summary}</p>}
            <div className="flex flex-wrap gap-2"><a href={`mailto:${app.email}`} className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] text-slate-300 inline-flex items-center gap-1"><Mail className="w-3 h-3" />{app.email}</a><a href={`tel:${app.phone}`} className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] text-slate-300 inline-flex items-center gap-1"><Phone className="w-3 h-3" />{app.phone}</a></div>
          </article>)}
          {!loading && applications.length > 0 && <p className="text-[11px] text-slate-400 leading-5">إقرار المتقدم بأنه كويتي ليس بديلاً عن التحقق الرسمي من الجنسية؛ أي تحقق حكومي يحتاج تكاملًا معتمدًا.</p>}
        </div>
      </div>
    </div>}
  </>;
};
