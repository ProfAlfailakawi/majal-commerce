import React, { useEffect, useState } from 'react';
import { CheckCircle2, Circle, FileSpreadsheet, Printer, Receipt } from 'lucide-react';
import { commerceClient, CreatorStatement, StatementLine } from '../../lib/commerceClient';
import { formatFils } from '../../lib/money';
import { IS_DEMO_MODE } from '../../lib/runtime';

const STAGES: { key: Exclude<StatementLine['stage'], 'REVERSED'>; label: string }[] = [
  { key: 'PENDING', label: 'قيد الانتظار' },
  { key: 'APPROVED', label: 'معتمد' },
  { key: 'PAID', label: 'مدفوع' }
];
const rank = { PENDING: 0, APPROVED: 1, PAID: 2, REVERSED: -1 } as const;
const day = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('ar-KW') : '—';

const Timeline: React.FC<{ line: StatementLine }> = ({ line }) => {
  if (line.stage === 'REVERSED') return <span className="text-rose-300 font-bold">ملغى (استرجاع)</span>;
  const dates = [line.timeline.pendingAt, line.timeline.approvedAt, line.timeline.paidAt];
  return (
    <ol className="flex items-center gap-2" aria-label="مراحل الصرف">
      {STAGES.map((stage, i) => {
        const done = rank[line.stage] >= i;
        return (
          <li key={stage.key} className={`flex items-center gap-1 ${done ? 'text-emerald-300' : 'text-slate-300'}`}>
            {done ? <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> : <Circle className="w-3.5 h-3.5" aria-hidden="true" />}
            <span>{stage.label}{done && dates[i] ? ` · ${day(dates[i])}` : ''}</span>
          </li>
        );
      })}
    </ol>
  );
};

/**
 * Server-computed payout statement: per order price − platform commission − host share =
 * creator payout. "Paid" appears only when the settlement carries the provider's transfer
 * reference. Exports: Arabic CSV (server) and a printable view (browser "Save as PDF").
 */
export const PayoutStatement: React.FC = () => {
  const [data, setData] = useState<CreatorStatement | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (IS_DEMO_MODE) return;
    commerceClient.statement().then(setData).catch(() => setError('تعذّر تحميل كشف المستحقات من الخادم.'));
  }, []);
  if (IS_DEMO_MODE) return null;

  return (
    <section className="glass-panel rounded-3xl border border-white/10 p-6 space-y-4 print-area" aria-labelledby="payout-statement-title">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
        <h3 id="payout-statement-title" className="font-black flex items-center gap-2"><Receipt className="w-5 h-5 text-gold-300" aria-hidden="true" /> كشف الصرف التفصيلي</h3>
        <div className="flex gap-2 print:hidden">
          <a href={commerceClient.statementCsvUrl} download className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 text-gold-300 font-bold rounded-xl border border-white/10 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"><FileSpreadsheet className="w-4 h-4" aria-hidden="true" /> CSV بالعربية</a>
          <button type="button" onClick={() => window.print()} className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 text-gold-300 font-bold rounded-xl border border-white/10 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"><Printer className="w-4 h-4" aria-hidden="true" /> طباعة / PDF</button>
        </div>
      </div>
      {error && <div role="alert" className="text-xs text-rose-300 font-bold">{error}</div>}
      {!data && !error && <div role="status" className="text-xs text-slate-300">جارٍ التحميل…</div>}
      {data && (
        <>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            {[
              ['إجمالي المبيعات', data.totals.grossFils], ['عمولة المنصة', data.totals.commissionFils],
              ['حصة المنشأة', data.totals.hostShareFils], ['مستحقك', data.totals.creatorPayoutFils],
              ['قيد الانتظار', data.totals.pendingFils], ['معتمد', data.totals.approvedFils], ['مدفوع فعليًا', data.totals.paidFils]
            ].map(([label, fils]) => (
              <div key={label as string} className="rounded-xl p-3 bg-white/5 border border-white/10"><dt className="text-slate-300">{label}</dt><dd className="font-black text-gold-300 mt-1 font-mono">{formatFils(fils as number)}</dd></div>
            ))}
          </dl>
          {data.lines.length === 0 ? <p className="text-xs text-slate-300">لا توجد طلبات مدفوعة بعد.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start">
                <caption className="sr-only">تفصيل المستحقات لكل طلب</caption>
                <thead className="text-slate-300">
                  <tr className="border-b border-white/10">
                    <th scope="col" className="py-2 text-start">الطلب</th><th scope="col" className="text-start">السعر</th><th scope="col" className="text-start">العمولة</th><th scope="col" className="text-start">حصة المنشأة</th><th scope="col" className="text-start">مستحقك</th><th scope="col" className="text-start">المراحل</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map(line => (
                    <tr key={line.accrualId} className="border-b border-white/5 align-top">
                      <td className="py-2"><div className="font-bold text-slate-100">{line.productName}</div><div className="text-slate-300">{line.orderId} · {line.units} وحدة · {day(line.orderedAt)}</div></td>
                      <td className="font-mono">{formatFils(line.grossFils)}</td>
                      <td className="font-mono">−{formatFils(line.commissionFils)}</td>
                      <td className="font-mono">−{formatFils(line.hostShareFils)}</td>
                      <td className="font-mono font-black text-gold-300">{formatFils(line.creatorPayoutFils)}</td>
                      <td><Timeline line={line} />{line.providerReference && <div className="text-slate-300 mt-1">مرجع التحويل: <span dir="ltr">{line.providerReference}</span></div>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
};
