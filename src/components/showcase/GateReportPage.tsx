import React, { useEffect, useState } from 'react';
import { ArrowRight, Clock3, Eye, MessageCircle, Percent } from 'lucide-react';
import { fetchGateReport, type GateReport } from '../../lib/audienceClient';
import { usePrivatePage } from '../../lib/privatePage';
import { MajalMark } from '../brand/MajalMark';
import { TrendBars } from './charts';
import { num } from './audienceLabels';
import { useAutoRefresh } from '../../lib/autoRefresh';

const STATUS: Record<string, string> = { PENDING_REVIEW: 'بانتظار مراجعة الإدارة', APPROVED: 'معروض للجمهور', REJECTED: 'لم يُعتمد', SOLD: 'تم البيع' };

/** The seller's / supplier's own page, reached from the private link given when they submitted. */
export const GateReportPage: React.FC<{ token: string; onClose: () => void }> = ({ token, onClose }) => {
  usePrivatePage();
  const [r, setR] = useState<GateReport | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { fetchGateReport(token).then(setR).catch(e => setError(e instanceof Error ? e.message : 'تعذّر تحميل التقرير.')); }, [token]);
  useAutoRefresh(() => { fetchGateReport(token).then(setR).catch(() => undefined); });
  const rate = r && r.totals.opens ? Math.round((r.totals.contacts / r.totals.opens) * 100) : 0;
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      <button type="button" onClick={onClose} className="inline-flex items-center gap-2 text-xs text-slate-300 hover:text-white"><ArrowRight className="w-4 h-4" aria-hidden="true" />العودة إلى مجال</button>
      <div className="flex items-center gap-3"><MajalMark size={36} tone="ink" /><h1 className="text-xl font-black">تقرير {r?.kind === 'supplier' ? 'مورّدك' : 'مشروعك'}</h1></div>
      {error && <div role="alert" className="p-4 rounded-2xl bg-rose-500/10 border border-rose-400/20 text-sm text-rose-200">{error}</div>}
      {!r && !error && <div role="status" className="text-sm text-slate-300">جارٍ تحميل التقرير…</div>}
      {r && (
        <>
          <section className="glass-panel rounded-3xl border border-white/10 p-5 space-y-1">
            <h2 className="font-black">{r.title}</h2>
            <p className="text-xs text-slate-400">{STATUS[r.status] ?? r.status} · آخر 30 يومًا</p>
          </section>
          {r.demo && <p className="text-xs text-amber-200 bg-amber-500/10 border border-amber-400/20 rounded-xl p-3">أرقام تجريبية مولّدة للعرض.</p>}
          <section className="grid grid-cols-3 gap-3">
            {[{ i: Eye, l: r.kind === 'supplier' ? 'اطّلعوا' : 'فتحوا التفاصيل', v: num(r.totals.opens) }, { i: MessageCircle, l: 'تواصلوا معك', v: num(r.totals.contacts) }, { i: Percent, l: 'نسبة التواصل', v: `${num(rate)}%` }].map(k => (
              <div key={k.l} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center space-y-1"><k.i className="w-5 h-5 mx-auto text-gold-300" aria-hidden="true" /><div className="text-2xl font-black tabular-nums">{k.v}</div><div className="text-xs text-slate-400">{k.l}</div></div>
            ))}
          </section>
          <section className="glass-panel rounded-3xl border border-white/10 p-5 space-y-3"><h3 className="text-sm font-black">{r.kind === 'supplier' ? 'ضغطات التواصل يوميًا' : 'الفتح يوميًا'}</h3>
            <TrendBars points={r.daily.map(d => ({ day: d.day, value: r.kind === 'supplier' ? d.contacts : d.opens }))} label="النشاط اليومي" />
          </section>
          <p className="text-xs text-slate-400 leading-6 flex gap-2"><Clock3 className="w-4 h-4 shrink-0 mt-1" aria-hidden="true" /><span>{r.note} خدمة مجانية من مجال، والرابط خاص بك فقط.</span></p>
        </>
      )}
    </div>
  );
};
