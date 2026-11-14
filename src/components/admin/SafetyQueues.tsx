import React, { useCallback, useEffect, useState } from 'react';
import { Flag } from 'lucide-react';
import { safetyClient, type SafetyQueues as Queues } from '../../lib/safetyClient';

const REASONS: Record<string, string> = { SPAM: 'محتوى مزعج', ABUSE: 'إساءة أو تحرش', INAPPROPRIATE: 'محتوى غير لائق', OTHER: 'سبب آخر' };

/**
 * بلاغات التقييمات (App Store 1.2) وطلبات حذف الحساب المعلّقة (5.1.1(v)).
 * الإخفاء يُخرج التقييم من القائمة العامة؛ طلبات الحذف للعرض فقط، وينفّذها المالك تشغيليًا خلال 30 يومًا.
 */
export const SafetyQueues: React.FC = () => {
  const [queues, setQueues] = useState<Queues | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try { setQueues(await safetyClient.queues()); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذّر تحميل القوائم.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const resolve = async (id: string, decision: 'HIDE' | 'DISMISS') => {
    if (busy) return;
    setBusy(id);
    try { await safetyClient.resolveReviewReport(id, decision); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذّر تنفيذ القرار.'); }
    finally { setBusy(''); }
  };

  return (
    <section className="glass-panel rounded-3xl p-5 border border-white/10 space-y-5" aria-labelledby="safety-queues-title">
      <div className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-2xl bg-gold-500/10 border border-gold-300/20 text-gold-300 grid place-items-center"><Flag className="w-5 h-5" aria-hidden="true" /></span>
        <div><h3 id="safety-queues-title" className="font-black text-slate-100">البلاغات وطلبات الحذف</h3><p className="text-xs text-slate-400 mt-1">بلاغات التقييمات المنشورة وطلبات حذف الحساب المعلّقة.</p></div>
      </div>
      {error && <div role="alert" className="p-3 rounded-xl text-xs font-bold border bg-rose-500/10 border-rose-400/20 text-rose-200">{error}</div>}
      <div className="space-y-3">
        <h4 className="text-sm font-black text-slate-200">بلاغات التقييمات ({queues?.reviewReports.length ?? 0})</h4>
        {queues && queues.reviewReports.length === 0 && <p className="text-xs text-slate-400">لا توجد بلاغات مفتوحة.</p>}
        {queues?.reviewReports.map(report => (
          <article key={report.id} className="rounded-2xl p-4 bg-slate-950/40 border border-white/10 space-y-2">
            <div className="text-xs text-slate-400">{REASONS[report.reason] || report.reason} · <bdi>{new Date(report.createdAt).toLocaleString('en-GB')}</bdi></div>
            <p className="text-sm text-slate-100 break-words">{report.reviewComment || '(تقييم بلا تعليق)'}</p>
            {report.note && <p className="text-xs text-slate-300 break-words">ملاحظة المُبلِّغ: {report.note}</p>}
            <div className="flex gap-2">
              <button onClick={() => resolve(report.id, 'HIDE')} disabled={!!busy} className="px-4 py-2 rounded-xl bg-rose-500 text-white text-xs font-black disabled:opacity-50">إخفاء التقييم</button>
              <button onClick={() => resolve(report.id, 'DISMISS')} disabled={!!busy} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-200 text-xs font-black disabled:opacity-50">إغلاق البلاغ</button>
            </div>
          </article>
        ))}
      </div>
      <div className="space-y-3">
        <h4 className="text-sm font-black text-slate-200">طلبات حذف الحساب المعلّقة ({queues?.deletionRequests.length ?? 0})</h4>
        {queues && queues.deletionRequests.length === 0 && <p className="text-xs text-slate-400">لا توجد طلبات معلّقة.</p>}
        {queues?.deletionRequests.map(item => (
          <article key={item.id} className="rounded-2xl p-4 bg-slate-950/40 border border-white/10 text-xs text-slate-300 space-y-1">
            <div className="font-black text-slate-100">{item.name} · {item.role}</div>
            <div dir="ltr" className="text-start">{item.email} · {item.userId}</div>
            <div>طُلب في <bdi>{new Date(item.requestedAt).toLocaleDateString('en-GB')}</bdi> — يُنفَّذ خلال 30 يومًا من الطلب.</div>
          </article>
        ))}
      </div>
    </section>
  );
};
