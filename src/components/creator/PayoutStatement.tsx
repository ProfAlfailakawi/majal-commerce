import React, { useEffect, useState } from 'react';
import { FileSpreadsheet, Printer, Receipt, Undo2 } from 'lucide-react';
import { DnaStepper, DnaStep } from '../dna/DnaKit';
import { payoutStationDone, visiblePayoutStations } from '../../lib/payoutStages';
import { commerceClient, CreatorStatement, StatementLine } from '../../lib/commerceClient';
import { formatFils } from '../../lib/money';
import { IS_DEMO_MODE } from '../../lib/runtime';
import { shortRef } from '../../lib/displayRef';
import { store } from '../../lib/store';

const STAGES: { key: Exclude<StatementLine['stage'], 'REVERSED'>; label: string }[] = [
  { key: 'PENDING', label: 'قيد الانتظار' },
  { key: 'APPROVED', label: 'معتمد' },
  { key: 'PAID', label: 'مدفوع' }
];
const day = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('ar-KW-u-nu-latn') : '—';

/* Static (table rows): no intro. A reversed line shows only pending then the reversal: the server does not
   say whether it had been approved or paid first, so those stations are left out rather than shown as skipped. */
const Timeline: React.FC<{ line: StatementLine }> = ({ line }) => {
  const dates = { PENDING: line.timeline.pendingAt, APPROVED: line.timeline.approvedAt, PAID: line.timeline.paidAt };
  const reversed = line.stage === 'REVERSED';
  const steps: DnaStep[] = visiblePayoutStations(line.stage).map(key => {
    const done = payoutStationDone(line.stage, key);
    return {
      key,
      state: done ? 'done' : 'pending',
      label: (
        <>
          <span className="block">{STAGES.find(s => s.key === key)!.label}</span>
          {done && dates[key] && <span className="block text-[11px] font-normal tabular-nums">{day(dates[key])}</span>}
        </>
      ),
    };
  });
  if (reversed) steps.push({ key: 'REVERSED', state: 'returned', icon: <Undo2 />, label: 'ملغى (استرجاع)' });
  return (
    <DnaStepper
      size="sm"
      className="max-w-sm"
      ariaLabel="مراحل الصرف"
      stateText={{ done: 'تمّت', pending: 'لم تبدأ', returned: 'ملغى (استرجاع)' }}
      steps={steps}
    />
  );
};


type Totals = CreatorStatement['totals'];
interface Seg { label: string; fils: number; bar: string; dot: string }

/** One proportional bar with its legend; every figure stays printed beside its swatch. */
const SplitBar: React.FC<{ title: string; total: number; totalLabel: string; segs: Seg[] }> = ({ title, total, totalLabel, segs }) => (
  <div className="rounded-2xl p-4 bg-white/5 border border-white/10 space-y-3">
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <span className="text-xs font-bold text-slate-300">{title}</span>
      <span className="text-xs text-slate-300 whitespace-nowrap">{totalLabel} <b className="text-gold-300 text-base font-black tabular-nums whitespace-nowrap">{formatFils(total)}</b></span>
    </div>
    <div role="img" aria-label={`${title}: ${segs.map(g => `${g.label} ${formatFils(g.fils)}`).join('، ')}`} className="flex h-3 w-full overflow-hidden rounded-full bg-white/5 gap-px" dir="rtl">
      {total > 0 && segs.filter(g => g.fils > 0).map(g => <span key={g.label} className={g.bar} style={{ width: `${(g.fils / total) * 100}%` }} />)}
    </div>
    <dl className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-x-4 gap-y-2 text-xs">
      {segs.map(g => (
        <div key={g.label} className="min-w-0">
          <dt className="flex items-center gap-1.5 text-slate-300"><span aria-hidden="true" className={`w-2 h-2 rounded-full shrink-0 ${g.dot}`} />{g.label}</dt>
          <dd className="font-black text-slate-100 mt-0.5 tabular-nums whitespace-nowrap">{formatFils(g.fils)}</dd>
        </div>
      ))}
    </dl>
  </div>
);

const EarningsSplit: React.FC<{ totals: Totals }> = ({ totals }) => (
  <div className="grid lg:grid-cols-2 gap-3">
    <SplitBar title="توزيع إجمالي المبيعات" totalLabel="إجمالي المبيعات" total={totals.grossFils} segs={[
      { label: 'مستحقك', fils: totals.creatorPayoutFils, bar: 'bg-gold-400', dot: 'bg-gold-400' },
      { label: 'حصة المنشأة', fils: totals.hostShareFils, bar: 'bg-steel-400', dot: 'bg-steel-400' },
      { label: 'عمولة المنصة', fils: totals.commissionFils, bar: 'bg-slate-500', dot: 'bg-slate-500' }
    ]} />
    <SplitBar title="مراحل مستحقك" totalLabel="مستحقك" total={totals.creatorPayoutFils} segs={[
      { label: 'مدفوع فعليًا', fils: totals.paidFils, bar: 'bg-emerald-400', dot: 'bg-emerald-400' },
      { label: 'معتمد', fils: totals.approvedFils, bar: 'bg-gold-400', dot: 'bg-gold-400' },
      { label: 'قيد الانتظار', fils: totals.pendingFils, bar: 'bg-slate-500', dot: 'bg-slate-500' }
    ]} />
  </div>
);

/**
 * Server-computed payout statement: per order price − platform commission − host share =
 * creator payout. "Paid" appears only when the settlement carries the provider's transfer
 * reference. Exports: Arabic CSV (server) and a printable view (browser "Save as PDF").
 */
/** Demo only: the same statement shape the server returns, derived from the local demo ledger. No network. */
function buildDemoStatement(): CreatorStatement {
  const creatorId = store.activeUser.creatorId || '';
  const fils = (kwd: number) => Math.round(kwd * 1000);
  const lines: StatementLine[] = store.accruals
    .filter(a => a.creatorId === creatorId)
    .map(a => {
      const order = store.orders.find(o => o.id === a.orderId);
      const product = store.products.find(p => p.id === order?.productId);
      const stage: StatementLine['stage'] = a.settlementStatus === 'PAID' ? 'PAID' : a.settlementStatus === 'SETTLEMENT_LOCKED' ? 'APPROVED' : 'PENDING';
      const gross = fils(a.grossSaleKwd);
      const commission = fils(order?.platformFeeKwd ?? a.grossSaleKwd * 0.05);
      const creatorPayout = fils(a.accruedAmountKwd);
      return {
        accrualId: a.id, orderId: a.orderId, productName: product?.publicName || 'منتج', units: order?.unitsCount ?? 1, orderedAt: order?.createdAt || a.createdAt,
        grossFils: gross, commissionFils: commission, hostShareFils: Math.max(0, gross - commission - creatorPayout), creatorPayoutFils: creatorPayout,
        stage,
        timeline: { pendingAt: a.createdAt, approvedAt: stage === 'PENDING' ? null : a.createdAt, paidAt: stage === 'PAID' ? a.createdAt : null },
        providerReference: stage === 'PAID' ? 'مرجع-تحويل-تجريبي' : null
      };
    })
    .sort((x, y) => y.orderedAt.localeCompare(x.orderedAt));
  const sum = (pick: (l: StatementLine) => number, stages?: StatementLine['stage'][]) => lines.filter(l => !stages || stages.includes(l.stage)).reduce((t, l) => t + pick(l), 0);
  return {
    creatorId, currency: 'KWD', lines,
    totals: {
      grossFils: sum(l => l.grossFils), commissionFils: sum(l => l.commissionFils), hostShareFils: sum(l => l.hostShareFils), creatorPayoutFils: sum(l => l.creatorPayoutFils),
      pendingFils: sum(l => l.creatorPayoutFils, ['PENDING']), approvedFils: sum(l => l.creatorPayoutFils, ['APPROVED']), paidFils: sum(l => l.creatorPayoutFils, ['PAID'])
    }
  };
}

export const PayoutStatement: React.FC = () => {
  const [data, setData] = useState<CreatorStatement | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (IS_DEMO_MODE) { setData(buildDemoStatement()); return; }
    commerceClient.statement().then(setData).catch(() => setError('تعذّر تحميل كشف المستحقات من الخادم.'));
  }, []);

  return (
    <section className="glass-panel rounded-3xl border border-white/10 p-6 space-y-4 print-area" aria-labelledby="payout-statement-title">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
        <h3 id="payout-statement-title" className="font-black flex items-center gap-2"><Receipt className="w-5 h-5 text-gold-300" aria-hidden="true" /> كشف الصرف التفصيلي</h3>
        <div className="flex gap-2 print:hidden">
          {!IS_DEMO_MODE && <a href={commerceClient.statementCsvUrl} download className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 text-gold-300 font-bold rounded-xl border border-white/10 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"><FileSpreadsheet className="w-4 h-4" aria-hidden="true" /> CSV بالعربية</a>}
          <button type="button" onClick={() => window.print()} className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 text-gold-300 font-bold rounded-xl border border-white/10 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"><Printer className="w-4 h-4" aria-hidden="true" /> طباعة / PDF</button>
        </div>
      </div>
      {error && <div role="alert" className="text-xs text-rose-300 font-bold">{error}</div>}
      {!data && !error && <div role="status" className="text-xs text-slate-300">جارٍ التحميل…</div>}
      {data && (
        <>
          <EarningsSplit totals={data.totals} />
          {data.lines.length === 0 ? <p className="text-xs text-slate-300">لا توجد طلبات مدفوعة بعد.</p> : (
            <div className="payout-cap-wrap">
              {data.lines.length > 6 && <input id="payout-cap-toggle" type="checkbox" className="payout-cap-toggle sr-only md:hidden" />}
              <div className="overflow-x-auto">
              <table className="mobile-cards w-full text-xs text-start">
                <caption className="sr-only">تفصيل المستحقات لكل طلب</caption>
                <thead className="text-slate-300">
                  <tr className="border-b border-white/10">
                    <th scope="col" className="py-2 text-start">الطلب</th><th scope="col" className="text-start">السعر</th><th scope="col" className="text-start">العمولة</th><th scope="col" className="text-start">حصة المنشأة</th><th scope="col" className="text-start">مستحقك</th><th scope="col" className="text-start">المراحل</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map(line => (
                    <tr key={line.accrualId} className="border-b border-white/5 align-top">
                      <td data-label="الطلب" className="py-2"><div className="font-bold text-slate-100">{line.productName}</div><div className="text-slate-300"><span title={line.orderId}>{shortRef(line.orderId, 'ط')}</span> · {line.units} وحدة · {day(line.orderedAt)}</div></td>
                      <td data-label="السعر" className="tabular-nums">{formatFils(line.grossFils)}</td>
                      <td data-label="العمولة" className="tabular-nums">−{formatFils(line.commissionFils)}</td>
                      <td data-label="حصة المنشأة" className="tabular-nums">−{formatFils(line.hostShareFils)}</td>
                      <td data-label="مستحقك" className="tabular-nums font-black text-gold-300">{formatFils(line.creatorPayoutFils)}</td>
                      <td data-label="المراحل" className="mc-full"><Timeline line={line} />{line.providerReference && <div className="text-slate-300 mt-1">مرجع التحويل: <span dir="ltr">{line.providerReference}</span></div>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              {data.lines.length > 6 && (
                <label htmlFor="payout-cap-toggle" className="payout-cap-btn mt-4 mx-auto flex w-fit min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-gold-300 hover:bg-white/10 md:hidden print:hidden">
                  <span className="payout-cap-more">عرض الكل ({data.lines.length})</span>
                  <span className="payout-cap-less">عرض أقل</span>
                </label>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
};
