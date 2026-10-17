import React, { useEffect, useState } from 'react';
import { ArrowRight, Eye, MousePointerClick, Percent } from 'lucide-react';
import { fetchAdReport, type AdReport } from '../../lib/showcaseClient';
import { MajalMark } from '../brand/MajalMark';
import { AD_AUDIENCE_LABEL, type AdAudience } from '../../lib/adAudience';
import { usePrivatePage } from '../../lib/privatePage';

const SLOT_LABEL = { SPONSOR: 'شريط الراعي', MARKET: 'السوق', PORTAL: 'بوابات الشركاء' } as const;
const STATUS_LABEL: Record<string, string> = { PENDING_REVIEW: 'بانتظار الاعتماد', APPROVED: 'معتمدة', PAUSED: 'موقوفة', REJECTED: 'غير معتمدة' };

/** Company-facing campaign report. The private link is the identity; nothing personal is shown. */
export const AdReportPage: React.FC<{ token: string; onClose: () => void }> = ({ token, onClose }) => {
  const [report, setReport] = useState<AdReport | null>(null);
  const [error, setError] = useState('');
  usePrivatePage();
  useEffect(() => { fetchAdReport(token).then(setReport).catch(e => setError(e instanceof Error ? e.message : 'تعذّر تحميل التقرير.')); }, [token]);
  const max = Math.max(1, ...(report?.days.map(d => d.impressions) ?? [1]));
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      <button type="button" onClick={onClose} className="inline-flex items-center gap-2 text-xs text-slate-300 hover:text-white"><ArrowRight className="w-4 h-4" aria-hidden="true" />العودة إلى مجال</button>
      <div className="flex items-center gap-3"><MajalMark size={36} tone="ink" /><h1 className="text-xl font-black">تقرير الحملة</h1></div>
      {error && <div role="alert" className="p-4 rounded-2xl bg-rose-500/10 border border-rose-400/20 text-sm text-rose-200">{error}</div>}
      {!report && !error && <div role="status" className="text-sm text-slate-300">جارٍ تحميل التقرير…</div>}
      {report && (
        <>
          <section className="glass-panel rounded-3xl border border-white/10 p-5 space-y-1">
            <div className="text-xs text-gold-300 font-black">{report.campaign.company}</div>
            <h2 className="font-black">{report.campaign.headline}</h2>
            <p className="text-xs text-slate-400">{SLOT_LABEL[report.campaign.slot]} · {report.campaign.phase === 'ended' ? 'انتهت' : report.campaign.phase === 'scheduled' ? 'مجدولة' : report.campaign.phase === 'live' ? 'تعمل الآن' : STATUS_LABEL[report.campaign.status] ?? report.campaign.status}{report.campaign.startsOn ? ` · من ${report.campaign.startsOn}` : ''}{report.campaign.endsOn ? ` إلى ${report.campaign.endsOn}` : ''}</p>
          </section>
          <section className="grid grid-cols-3 gap-3">
            {[{ icon: Eye, label: 'ظهور', value: report.totals.impressions }, { icon: MousePointerClick, label: 'نقرات', value: report.totals.clicks }, { icon: Percent, label: 'نسبة النقر', value: `${report.ctr}٪` }].map(k => (
              <div key={k.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center space-y-1"><k.icon className="w-5 h-5 mx-auto text-gold-300" aria-hidden="true" /><div className="text-2xl font-black">{typeof k.value === 'number' ? k.value.toLocaleString('ar-EG') : k.value}</div><div className="text-xs text-slate-400">{k.label}</div></div>
            ))}
          </section>
          {report.days.length > 0 && (
            <section className="glass-panel rounded-3xl border border-white/10 p-5">
              <h3 className="text-sm font-black mb-4">آخر ٣٠ يومًا</h3>
              <div className="flex items-end gap-1 h-32" role="img" aria-label="الظهور اليومي">
                {report.days.map(d => <div key={d.day} title={`${d.day}: ${d.impressions}`} className="flex-1 rounded-t bg-gold-400/70 min-h-[2px]" style={{ height: `${(d.impressions / max) * 100}%` }} />)}
              </div>
            </section>
          )}
          {report.audiences && report.audiences.length > 0 && (
            <section className="glass-panel rounded-3xl border border-white/10 p-5 space-y-3">
              <h3 className="text-sm font-black">من شاهد إعلانك</h3>
              {report.audiences.map(a => (
                <div key={a.audience} className="space-y-1">
                  <div className="flex justify-between text-xs"><span>{AD_AUDIENCE_LABEL[a.audience as AdAudience] ?? a.audience}</span><span className="text-slate-400">{a.impressions.toLocaleString('ar-EG')} ظهور · {a.clicks.toLocaleString('ar-EG')} نقرة</span></div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-emerald-400/80" style={{ width: `${Math.max(2, (a.impressions / Math.max(1, report.totals.impressions)) * 100)}%` }} /></div>
                </div>
              ))}
            </section>
          )}
          <p className="text-xs text-slate-400 leading-6">{report.note}</p>
          <p className="text-xs text-emerald-300 leading-6">إعلانكم في مجال مجاني: لا رسوم ولا عمولة، وهو خدمة منا لكم.</p>
        </>
      )}
    </div>
  );
};
