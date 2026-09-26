import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Copy, Gauge, MessageSquareText, OctagonX, RefreshCw } from 'lucide-react';
import { commerceClient, WarRoom } from '../../lib/commerceClient';
import { DomainApiError } from '../../lib/domainClient';
import { IS_DEMO_MODE } from '../../lib/runtime';
import { store } from '../../lib/store';

const LEVEL_TONE = { OK: 'bg-emerald-400', WARNING: 'bg-amber-400', CUTOFF: 'bg-rose-500' } as const;
const CAN_EDIT = ['HOST_OWNER', 'HOST_OPERATIONS', 'HOST_CHEF'];

/**
 * Server-backed launch war room: per-branch prep capacity with alerts, automatic cutoff when
 * capacity is reached (enforced by the reservation ledger, not this screen), a manual cutoff,
 * and canned Arabic replies for HOST_SUPPORT.
 */
export const WarRoomOps: React.FC = () => {
  const [data, setData] = useState<WarRoom | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const canEdit = CAN_EDIT.includes(store.activeUser.role);

  const load = useCallback(() => {
    commerceClient.warRoom().then(result => { setData(result); setError(''); }).catch(err => setError(err instanceof DomainApiError ? err.message : 'تعذّر تحميل غرفة العمليات.'));
  }, []);
  useEffect(() => {
    if (IS_DEMO_MODE) return;
    load();
    const timer = window.setInterval(load, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);
  if (IS_DEMO_MODE) return null;

  const save = async (launchId: string, branchId: string, manualCutoff: boolean, fallback: number | undefined) => {
    const key = `${launchId}:${branchId}`;
    const capacity = Number(drafts[key] ?? fallback ?? 0);
    try {
      await commerceClient.setBranchStock(launchId, branchId, { capacityUnits: capacity, manualCutoff });
      setNotice('تم تحديث طاقة التحضير.');
      load();
    } catch (err) { setNotice(err instanceof DomainApiError ? err.message : 'تعذّر التحديث.'); }
  };
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setNotice('تم نسخ الرد.'); } catch { setNotice('انسخ الرد يدويًا.'); }
  };

  return (
    <section className="glass-panel rounded-3xl border border-white/10 p-6 space-y-5" aria-labelledby="war-room-ops-title">
      <div className="flex items-center justify-between gap-3">
        <h3 id="war-room-ops-title" className="font-black flex items-center gap-2"><Gauge className="w-5 h-5 text-gold-300" aria-hidden="true" /> طاقة التحضير لكل فرع</h3>
        <button type="button" onClick={load} className="p-2 rounded-xl bg-white/5 text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300" aria-label="تحديث"><RefreshCw className="w-4 h-4" aria-hidden="true" /></button>
      </div>
      {error && <div role="alert" className="text-xs text-rose-300 font-bold">{error}</div>}
      {notice && <div role="status" className="text-xs text-emerald-300 font-bold">{notice}</div>}

      {data && data.alerts.length > 0 && (
        <ul className="space-y-2" aria-label="تنبيهات الطاقة">
          {data.alerts.map(a => (
            <li key={`${a.launchId}-${a.branchId}`} role="alert" className={`rounded-xl p-3 text-xs font-bold flex items-center gap-2 ${a.level === 'CUTOFF' ? 'bg-rose-500/10 text-rose-300 border border-rose-400/20' : 'bg-amber-500/10 text-amber-300 border border-amber-400/20'}`}>
              {a.level === 'CUTOFF' ? <OctagonX className="w-4 h-4" aria-hidden="true" /> : <AlertTriangle className="w-4 h-4" aria-hidden="true" />}{a.messageAr}
            </li>
          ))}
        </ul>
      )}

      {data?.launches.map(l => (
        <div key={l.launchId} className="rounded-2xl p-4 bg-slate-950/35 border border-white/10 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="font-black text-slate-100">{l.title}</div>
            <div className="text-slate-300">بانتظار الدفع: {l.pendingPaymentOrders} · مدفوع بانتظار التجهيز: {l.paidAwaitingFulfilment}</div>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {l.branches.map(b => {
              const key = `${l.launchId}:${b.branchId}`;
              return (
                <div key={b.branchId} className="rounded-xl p-3 bg-white/5 border border-white/10 text-xs space-y-2">
                  <div className="flex justify-between"><span className="font-bold text-slate-100">{b.name}</span><span className="text-slate-300">{b.configured ? `${b.reservedUnits}/${b.capacityUnits} (${b.utilizationPct}%)` : 'بلا سقف محدد'}</span></div>
                  {b.configured && <div className="h-2 bg-white/5 rounded-full overflow-hidden" role="progressbar" aria-valuenow={b.utilizationPct} aria-valuemin={0} aria-valuemax={100} aria-label={`استهلاك طاقة ${b.name}`}><div className={`h-full ${LEVEL_TONE[b.level ?? 'OK']}`} style={{ width: `${Math.min(100, b.utilizationPct ?? 0)}%` }} /></div>}
                  {canEdit && (
                    <div className="flex flex-wrap items-end gap-2">
                      <div>
                        <label htmlFor={`cap-${key}`} className="block text-slate-300 mb-1">الطاقة (وحدات)</label>
                        <input id={`cap-${key}`} type="number" min={b.reservedUnits ?? 0} inputMode="numeric" value={drafts[key] ?? String(b.capacityUnits ?? '')} onChange={e => setDrafts({ ...drafts, [key]: e.target.value })} className="w-24 glass-input rounded-lg px-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300" />
                      </div>
                      <button type="button" onClick={() => void save(l.launchId, b.branchId, Boolean(b.manualCutoff), b.capacityUnits)} className="px-3 py-1.5 rounded-lg bg-gold-500 text-slate-950 font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">حفظ</button>
                      {b.configured && <button type="button" onClick={() => void save(l.launchId, b.branchId, !b.manualCutoff, b.capacityUnits)} className="px-3 py-1.5 rounded-lg bg-white/10 text-slate-100 font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">{b.manualCutoff ? 'استئناف الطلبات' : 'إيقاف الطلبات'}</button>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {data && (
        <div className="space-y-2">
          <h4 className="text-xs font-black text-slate-100 flex items-center gap-2"><MessageSquareText className="w-4 h-4 text-sky-300" aria-hidden="true" /> ردود جاهزة لفريق الدعم</h4>
          <ul className="grid md:grid-cols-2 gap-2">
            {data.cannedReplies.map(r => (
              <li key={r.id} className="rounded-xl p-3 bg-white/5 border border-white/10 text-xs space-y-1.5">
                <div className="flex items-center justify-between gap-2"><span className="font-bold text-slate-100">{r.titleAr}</span>
                  <button type="button" onClick={() => void copy(r.bodyAr)} className="p-1.5 rounded-lg bg-white/5 text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300" aria-label={`نسخ رد: ${r.titleAr}`}><Copy className="w-3.5 h-3.5" aria-hidden="true" /></button>
                </div>
                <p className="text-slate-300 leading-6">{r.bodyAr}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};
