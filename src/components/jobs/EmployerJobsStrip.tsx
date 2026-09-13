import React, { useEffect, useState } from 'react';
import { BriefcaseBusiness, ChevronLeft, Clock3, Plus } from 'lucide-react';
import { fetchMyEcosystem } from '../../lib/ecosystemClient';
import { KuwaitiJobPost } from '../../types/majal';
import { JobApplicationsButton } from './JobApplications';

const statusLabel = (status: KuwaitiJobPost['status']) => status === 'PENDING_REVIEW' ? 'بانتظار الإدارة' : status === 'APPROVED' ? 'منشور' : status === 'REJECTED' ? 'يحتاج تعديل' : 'مغلق';

export const EmployerJobsStrip: React.FC<{ onCreate: () => void }> = ({ onCreate }) => {
  const [jobs, setJobs] = useState<KuwaitiJobPost[]>([]);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { let live = true; void fetchMyEcosystem().then(r => { if (live) setJobs(r.jobs); }).catch(() => undefined); return () => { live = false; }; }, []);
  const pending = jobs.filter(job => job.status === 'PENDING_REVIEW').length;

  return <section className="glass-card rounded-2xl border border-emerald-400/15 overflow-hidden">
    <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <button type="button" onClick={() => setExpanded(v => !v)} className="text-right flex items-center gap-3 min-w-0 flex-1">
        <span className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-400/20 grid place-items-center shrink-0"><BriefcaseBusiness className="w-5 h-5 text-emerald-300" /></span>
        <span className="min-w-0"><strong className="block text-sm text-slate-100">بوابة توظيف كويتي</strong><span className="block text-xs text-slate-400 mt-1">كل إعلان يمر على إدارة مجال قبل ظهوره للباحثين عن عمل{pending ? ` · ${pending} بانتظار المراجعة` : ''}.</span></span>
        {jobs.length > 0 && <ChevronLeft className={`w-4 h-4 text-slate-500 mr-auto transition ${expanded ? '-rotate-90' : ''}`} />}
      </button>
      <button type="button" onClick={onCreate} className="px-4 py-2.5 rounded-xl bg-emerald-400 text-slate-950 text-xs font-black whitespace-nowrap inline-flex items-center justify-center gap-1.5"><Plus className="w-4 h-4" />إعلان جديد</button>
    </div>
    {expanded && jobs.length > 0 && <div className="border-t border-white/5 px-5 pb-5 pt-4 space-y-2">
      {jobs.slice(0, 8).map(job => <div key={job.id} className="rounded-xl p-3 bg-white/[0.025] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div className="min-w-0"><div className="font-black text-xs text-slate-100 truncate">{job.title}</div><div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1"><Clock3 className="w-3 h-3" />{statusLabel(job.status)} · {job.location}</div>{job.adminNote && <div className="text-[10px] text-amber-300 mt-1">ملاحظة الإدارة: {job.adminNote}</div>}</div><JobApplicationsButton job={job} /></div>)}
    </div>}
  </section>;
};
