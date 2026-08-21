import React, { useState } from 'react';
import { Wallet, ArrowDownRight, CheckCircle2, FileSpreadsheet, ShieldCheck, Clock3 } from 'lucide-react';
import { store } from '../../lib/store';

export const CreatorEarnings: React.FC = () => {
  const currentCreatorId = store.activeUser.creatorId || '';
  const creatorAccruals = store.accruals.filter(a => a.creatorId === currentCreatorId);
  const creatorSettlements = store.settlements.filter(s => s.creatorId === currentCreatorId);

  const eligible = creatorAccruals.filter(a => a.settlementStatus === 'SETTLEMENT_ELIGIBLE').reduce((sum, a) => sum + a.accruedAmountKwd, 0);
  const locked = creatorAccruals.filter(a => a.settlementStatus === 'SETTLEMENT_LOCKED').reduce((sum, a) => sum + a.accruedAmountKwd, 0);
  const paid = creatorSettlements.filter(s => s.status === 'PAID').reduce((sum, s) => sum + s.totalAmountKwd, 0);
  const totals = { eligible, locked, paid, lifetime: eligible + locked + paid };

  const [exported, setExported] = useState(false);

  const handleDownloadStatement = () => {
    const rows = [
      ['order_id','created_at','gross_sale_kwd','royalty_percent','creator_accrual_kwd','settlement_status'],
      ...creatorAccruals.map(a => [a.orderId, a.createdAt, a.grossSaleKwd.toFixed(3), String(a.royaltyRatePercent), a.accruedAmountKwd.toFixed(3), a.settlementStatus])
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `majal-earnings-${currentCreatorId}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setExported(true);
    setTimeout(() => setExported(false), 3000);
  };

  const statusLabel = (status: typeof creatorAccruals[number]['settlementStatus']) => {
    if (status === 'PAID') return ['تم الدفع', 'bg-emerald-500/10 text-emerald-300 border-emerald-400/20'];
    if (status === 'SETTLEMENT_LOCKED') return ['ضمن دفعة معتمدة', 'bg-sky-500/10 text-sky-300 border-sky-400/20'];
    if (status === 'SETTLEMENT_ELIGIBLE') return ['مؤهل للتسوية', 'bg-amber-500/10 text-amber-300 border-amber-400/20'];
    return ['متراكم', 'bg-white/5 text-stone-400 border-white/10'];
  };

  return (
    <div className="space-y-6 text-stone-100">
      <section className="glass-panel rounded-3xl p-6 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#c7a55b]/10 text-[#e8c880] rounded-2xl border border-[#e8c880]/20"><Wallet className="w-6 h-6" /></div>
          <div>
            <h2 className="text-xl font-black">مستحقاتي — Earnings Ledger</h2>
            <p className="text-xs text-stone-400 mt-1 leading-6">سجل محاسبي للحقوق الناتجة عن المبيعات. الاعتماد داخل مجال منفصل عن تأكيد التحويل البنكي الخارجي.</p>
          </div>
        </div>
        <button onClick={handleDownloadStatement} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-[#e8c880] font-bold rounded-xl border border-white/10 text-xs transition-colors">
          <FileSpreadsheet className="w-4 h-4" /><span>تصدير كشف CSV</span>
        </button>
      </section>

      {exported && <div className="p-3 bg-emerald-500/10 border border-emerald-400/20 text-emerald-300 font-bold text-xs rounded-xl">✓ تم إنشاء كشف فعلي من البيانات الحالية وتنزيله بصيغة CSV.</div>}

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="glass-card p-5 rounded-2xl border border-white/10"><div className="text-xs text-stone-400">إجمالي الحقوق المسجلة</div><div className="text-2xl font-black text-[#e8c880] font-mono mt-2">{totals.lifetime.toFixed(3)} <span className="text-xs">د.ك</span></div></div>
        <div className="glass-card p-5 rounded-2xl border border-amber-400/15"><div className="flex items-center justify-between text-xs text-amber-300"><span>مؤهل للتسوية</span><ArrowDownRight className="w-4 h-4" /></div><div className="text-2xl font-black text-amber-300 font-mono mt-2">{totals.eligible.toFixed(3)} <span className="text-xs">د.ك</span></div></div>
        <div className="glass-card p-5 rounded-2xl border border-sky-400/15"><div className="flex items-center justify-between text-xs text-sky-300"><span>ضمن دفعة معتمدة</span><Clock3 className="w-4 h-4" /></div><div className="text-2xl font-black text-sky-300 font-mono mt-2">{totals.locked.toFixed(3)} <span className="text-xs">د.ك</span></div></div>
        <div className="glass-card p-5 rounded-2xl border border-emerald-400/15"><div className="flex items-center justify-between text-xs text-emerald-300"><span>مدفوع ومؤكد</span><CheckCircle2 className="w-4 h-4" /></div><div className="text-2xl font-black text-emerald-300 font-mono mt-2">{totals.paid.toFixed(3)} <span className="text-xs">د.ك</span></div></div>
      </div>

      <section className="glass-panel rounded-3xl border border-white/10 p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3"><h3 className="font-black">تفاصيل الحقوق حسب الطلب</h3><span className="text-xs text-stone-500">{creatorAccruals.length} سجلات</span></div>
        <div className="overflow-x-auto text-xs">
          <table className="w-full text-right min-w-[760px]">
            <thead><tr className="border-b border-white/10 text-stone-500"><th className="py-3 px-3">الطلب</th><th className="py-3 px-3">التاريخ</th><th className="py-3 px-3">المبيعات</th><th className="py-3 px-3">النسبة</th><th className="py-3 px-3">حق المبدع</th><th className="py-3 px-3">الحالة</th></tr></thead>
            <tbody className="divide-y divide-white/5">
              {creatorAccruals.map(a => {
                const [label, cls] = statusLabel(a.settlementStatus);
                return <tr key={a.id} className="hover:bg-white/3"><td className="py-3 px-3 font-mono text-stone-200">{a.orderId}</td><td className="py-3 px-3 text-stone-400">{new Date(a.createdAt).toLocaleString('ar-KW')}</td><td className="py-3 px-3 font-bold">{a.grossSaleKwd.toFixed(3)} د.ك</td><td className="py-3 px-3 text-[#e8c880] font-bold">{a.royaltyRatePercent}%</td><td className="py-3 px-3 text-[#e8c880] font-black font-mono">{a.accruedAmountKwd.toFixed(3)} د.ك</td><td className="py-3 px-3"><span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${cls}`}>{label}</span></td></tr>;
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="glass-panel rounded-3xl border border-white/10 p-6 space-y-4">
        <h3 className="font-black border-b border-white/10 pb-3">دفعات التسوية</h3>
        <div className="space-y-3">
          {creatorSettlements.length === 0 ? <div className="p-8 text-center text-sm text-stone-500">لا توجد دفعات مسجلة حتى الآن.</div> : creatorSettlements.map(batch => (
            <div key={batch.id} className="p-4 rounded-2xl bg-slate-950/35 border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3"><div className={`p-2 rounded-xl border ${batch.status === 'PAID' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-400/20' : 'bg-amber-500/10 text-amber-300 border-amber-400/20'}`}><ShieldCheck className="w-5 h-5" /></div><div><span className="font-bold text-stone-100 block text-sm">دفعة #{batch.id}</span><span className="text-stone-500 text-[11px]">{new Date(batch.periodStart).toLocaleDateString('ar-KW')} — {new Date(batch.periodEnd).toLocaleDateString('ar-KW')}</span></div></div>
              <div className="sm:text-left"><span className="block font-black text-[#e8c880] text-lg font-mono">{batch.totalAmountKwd.toFixed(3)} د.ك</span><span className="text-[10px] text-stone-500">{batch.status === 'PAID' && batch.paidAt ? `تأكيد الدفع: ${new Date(batch.paidAt).toLocaleDateString('ar-KW')}` : 'معتمدة — بانتظار تأكيد الدفع الخارجي'}</span></div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
