import React, { FormEvent, useEffect, useState } from 'react';
import { BriefcaseBusiness, CheckCircle2, MapPin, ShieldCheck, UserCheck, X } from 'lucide-react';
import { applyToKuwaitiJob, fetchPublicEcosystem } from '../../lib/ecosystemClient';
import { KuwaitiJobPost } from '../../types/majal';
import { store } from '../../lib/store';
import { useDialogBehavior } from '../../hooks/useDialogBehavior';

const employmentLabel: Record<string, string> = { FULL_TIME: 'دوام كامل', PART_TIME: 'دوام جزئي', CONTRACT: 'عقد', INTERNSHIP: 'تدريب' };

const fieldClass = 'w-full glass-input rounded-xl px-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300';

export const KuwaitiJobs: React.FC = () => {
  const [jobs, setJobs] = useState<KuwaitiJobPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<KuwaitiJobPost | null>(null);
  const [summary, setSummary] = useState('');
  const [years, setYears] = useState('0');
  const [declare, setDeclare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const close = () => {
    setSelected(null);
    setMessage('');
    setError('');
    setDeclare(false);
  };
  const dialogRef = useDialogBehavior<HTMLDivElement>(Boolean(selected), close);

  useEffect(() => {
    fetchPublicEcosystem()
      .then(result => setJobs(result.jobs))
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, []);

  const isAuthenticated = store.activeUser.id !== 'anonymous';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    const yearsExperience = Number(years);
    if (!Number.isInteger(yearsExperience) || yearsExperience < 0 || yearsExperience > 60) {
      setError('سنوات الخبرة يجب أن تكون رقمًا صحيحًا بين 0 و60.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await applyToKuwaitiJob(selected.id, { summary, yearsExperience, kuwaitiDeclaration: true });
      setMessage(`تم إرسال طلبك. ${result.note}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر إرسال الطلب.');
    } finally {
      setBusy(false);
    }
  };

  if (!loading && !jobs.length) return null;

  return (
    <section className="glass-panel rounded-[28px] p-5 md:p-6 border border-white/10 space-y-5" aria-labelledby="kuwaiti-jobs-title">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <span className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-400/20 grid place-items-center shrink-0">
            <BriefcaseBusiness className="w-5 h-5 text-emerald-300" aria-hidden="true" />
          </span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 id="kuwaiti-jobs-title" className="text-lg font-black">فرص كويتية عبر مجال</h2>
              <span className="px-2 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-slate-300">بوابة مضبوطة وليست سوق إعلانات مفتوح</span>
            </div>
            <p className="text-xs text-slate-300 mt-1 leading-6">تظهر هنا فقط الوظائف التي وافقت عليها إدارة مجال. مخصصة لتوظيف الكويتيين لدى المنشآت والموردين في المنظومة.</p>
          </div>
        </div>
        <span className="text-xs text-emerald-300 font-black whitespace-nowrap">{jobs.length} فرصة</span>
      </div>

      {loading ? (
        <div role="status" className="text-xs text-slate-300 py-4">جارٍ تحميل الفرص…</div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {jobs.slice(0, 6).map(job => (
            <article key={job.id} className="rounded-2xl p-4 bg-white/[0.03] border border-white/10">
              <div className="flex justify-between gap-3">
                <div>
                  <div className="text-xs text-emerald-300 font-black">{job.employerName}</div>
                  <h3 className="font-black mt-1">{job.title}</h3>
                </div>
                <ShieldCheck className="w-4 h-4 text-emerald-300 shrink-0" aria-hidden="true" />
              </div>
              <div className="mt-3 flex gap-2 flex-wrap text-xs text-slate-300">
                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" aria-hidden="true" />{job.location}</span>
                <span>{employmentLabel[job.employmentType] || job.employmentType}</span>
                {job.department && <span>{job.department}</span>}
              </div>
              <p className="text-xs text-slate-300 leading-6 mt-3 line-clamp-3">{job.description}</p>
              <button
                type="button"
                onClick={() => setSelected(job)}
                className="mt-4 w-full py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-400/20 text-emerald-300 text-xs font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
              >
                عرض والتقديم
              </button>
            </article>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-300 leading-5">اعتماد الإعلان من الإدارة لا يعني اعتماد المرشح أو التحقق من جنسيته. التحقق الرسمي من الهوية/الجنسية يحتاج تكاملًا حكوميًا معتمدًا.</p>

      {selected && (
        <div
          className="fixed inset-0 z-[85] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4"
          onMouseDown={event => event.target === event.currentTarget && close()}
        >
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="job-detail-title" className="w-full max-w-xl max-h-[90vh] overflow-y-auto glass-panel rounded-[28px] border border-white/10 p-6 relative">
            <button
              type="button"
              onClick={close}
              aria-label="إغلاق"
              className="absolute top-4 end-4 p-2 rounded-full text-slate-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>

            <div className="pe-10">
              <div className="text-xs text-emerald-300 font-black">{selected.employerName}</div>
              <h3 id="job-detail-title" className="text-xl font-black mt-1">{selected.title}</h3>
              <p className="text-xs text-slate-300 mt-2">{selected.location} · {employmentLabel[selected.employmentType]}</p>
            </div>
            <p className="text-sm text-slate-200 leading-7 mt-5">{selected.description}</p>

            {selected.requirements.length > 0 && (
              <div className="mt-4">
                <h4 className="text-xs font-black mb-2">المتطلبات</h4>
                <ul className="space-y-1 list-disc ps-5">
                  {selected.requirements.map((requirement, index) => <li key={index} className="text-xs text-slate-300">{requirement}</li>)}
                </ul>
              </div>
            )}

            {message ? (
              <div role="status" className="mt-6 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-400/20 text-xs text-emerald-200 leading-6 flex gap-2">
                <CheckCircle2 className="w-5 h-5 shrink-0" aria-hidden="true" />
                {message}
              </div>
            ) : isAuthenticated ? (
              <form onSubmit={submit} className="mt-6 space-y-4" aria-describedby={error ? 'job-apply-error' : undefined}>
                <div>
                  <label htmlFor="job-summary" className="block text-xs text-slate-300 mb-1.5">نبذة مختصرة عن خبرتك (اختياري)</label>
                  <textarea
                    id="job-summary"
                    value={summary}
                    onChange={event => setSummary(event.target.value)}
                    maxLength={1600}
                    rows={3}
                    className={`${fieldClass} resize-none`}
                  />
                </div>
                <div>
                  <label htmlFor="job-years" className="block text-xs text-slate-300 mb-1.5">سنوات الخبرة</label>
                  <input
                    id="job-years"
                    type="number"
                    min={0}
                    max={60}
                    step={1}
                    value={years}
                    onChange={event => setYears(event.target.value)}
                    inputMode="numeric"
                    required
                    className={fieldClass}
                  />
                </div>
                <div className="flex items-start gap-2 p-3 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-200 leading-6">
                  <input
                    id="job-declare"
                    type="checkbox"
                    checked={declare}
                    onChange={event => setDeclare(event.target.checked)}
                    required
                    className="mt-1 focus-visible:ring-2 focus-visible:ring-emerald-300"
                  />
                  <label htmlFor="job-declare">أقر أنني كويتي وأفهم أن هذا إقرار مني وليس تحققًا حكوميًا من المنصة.</label>
                </div>
                {error && <div id="job-apply-error" role="alert" className="text-xs text-rose-300 font-bold">{error}</div>}
                <button
                  type="submit"
                  disabled={!declare || busy}
                  className="w-full py-3 rounded-xl bg-emerald-400 text-slate-950 font-black text-sm disabled:opacity-40 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                >
                  <UserCheck className="w-4 h-4" aria-hidden="true" />
                  {busy ? 'جارٍ الإرسال…' : 'تقديم الطلب'}
                </button>
              </form>
            ) : (
              <div className="mt-6 p-4 rounded-2xl bg-amber-500/5 border border-amber-400/15 text-xs text-slate-200">سجّل الدخول من أعلى الصفحة ثم ارجع لهذه الفرصة لإرسال طلب التوظيف.</div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
