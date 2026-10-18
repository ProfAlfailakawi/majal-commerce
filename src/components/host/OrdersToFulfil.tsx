import React, { useCallback, useEffect, useState } from 'react';
import { CheckCheck, PackageCheck, RefreshCw } from 'lucide-react';
import { commerceClient, HostOrders } from '../../lib/commerceClient';
import { DomainApiError } from '../../lib/domainClient';
import { IS_DEMO_MODE } from '../../lib/runtime';
import { store } from '../../lib/store';

const CAN_FULFIL = ['HOST_OWNER', 'HOST_OPERATIONS', 'HOST_CHEF', 'HOST_SUPPORT'];
const kwd = (fils: number) => `${(fils / 1000).toFixed(3)} د.ك`;
const when = (iso: string) => new Date(iso).toLocaleString('ar-KW-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * طلبات مدفوعة بانتظار «تم التنفيذ». تنفيذ الطلب (تسليم/توصيل) هو ما يجعل حق المبدع مؤهلًا للتسوية،
 * ويُبلَّغ العميل والمبدع. الزر مقصور على أدوار التنفيذ؛ بقية الأدوار ترى القائمة فقط.
 */
export const OrdersToFulfil: React.FC = () => {
  const [view, setView] = useState<'PAID' | 'FULFILLED'>('PAID');
  const [data, setData] = useState<HostOrders | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const canFulfil = CAN_FULFIL.includes(store.activeUser.role);

  const load = useCallback(() => {
    commerceClient.hostOrders(view).then(result => { setData(result); setError(''); })
      .catch(err => setError(err instanceof DomainApiError ? err.message : 'تعذّر تحميل الطلبات.'));
  }, [view]);
  useEffect(() => {
    if (IS_DEMO_MODE) return;
    setData(null);
    load();
    const timer = window.setInterval(load, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);
  if (IS_DEMO_MODE) return null;

  const fulfil = async (orderId: string) => {
    if (busy) return;
    setBusy(orderId); setError('');
    try {
      const result = await commerceClient.fulfilOrder(orderId);
      setNotice(result.alreadyFulfilled ? 'الطلب منفَّذ مسبقًا.' : 'تم تنفيذ الطلب وأُبلغ العميل.');
      window.setTimeout(() => setNotice(''), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر تنفيذ الطلب.');
    } finally {
      setBusy('');
      load();
    }
  };

  return (
    <section className="glass-panel rounded-3xl border border-white/10 p-5 md:p-6 space-y-4" aria-labelledby="orders-to-fulfil-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-400/20 text-emerald-300 grid place-items-center"><PackageCheck className="w-5 h-5" aria-hidden="true" /></span>
          <div>
            <h3 id="orders-to-fulfil-title" className="font-black">تنفيذ الطلبات</h3>
            <p className="text-xs text-slate-400 mt-1">بعد التسليم اضغط «تم التنفيذ»؛ هذا ما يُحرّر حق المبدع للتسوية.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div role="group" aria-label="عرض الطلبات" className="flex rounded-xl border border-white/10 overflow-hidden text-xs font-black">
            <button type="button" aria-pressed={view === 'PAID'} onClick={() => setView('PAID')} className={`min-h-11 px-3 ${view === 'PAID' ? 'bg-gold-500 text-slate-950' : 'bg-white/5 text-slate-300'}`}>بانتظار التنفيذ{data && view === 'PAID' ? ` (${data.awaiting})` : ''}</button>
            <button type="button" aria-pressed={view === 'FULFILLED'} onClick={() => setView('FULFILLED')} className={`min-h-11 px-3 ${view === 'FULFILLED' ? 'bg-gold-500 text-slate-950' : 'bg-white/5 text-slate-300'}`}>نُفِّذت</button>
          </div>
          <button type="button" onClick={load} aria-label="تحديث القائمة" className="min-w-11 min-h-11 grid place-items-center rounded-xl bg-white/5 border border-white/10"><RefreshCw className="w-4 h-4" aria-hidden="true" /></button>
        </div>
      </div>
      {error && <div role="alert" className="p-3 rounded-xl bg-rose-500/10 border border-rose-400/20 text-xs font-bold text-rose-200">{error}</div>}
      {notice && <div role="status" className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-400/20 text-xs font-bold text-emerald-300">{notice}</div>}
      {!data && !error && <div role="status" className="text-xs text-slate-300 py-4">جارٍ التحميل…</div>}
      {data && data.orders.length === 0 && (
        <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-slate-400">{view === 'PAID' ? 'لا توجد طلبات بانتظار التنفيذ الآن.' : 'لم يُنفَّذ أي طلب بعد.'}</div>
      )}
      {data && data.orders.length > 0 && (
        <ul className="space-y-3">
          {data.orders.map(order => (
            <li key={order.id} className="rounded-2xl p-4 bg-slate-950/40 border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="font-black text-slate-100 break-words">{order.product} <span className="text-gold-300 whitespace-nowrap">× {order.units}</span></div>
                <div className="text-xs text-slate-300">{order.customer}{order.phone ? <> · <bdi dir="ltr">{order.phone}</bdi></> : null}</div>
                <div className="text-xs text-slate-400">{order.fulfillment === 'DELIVERY' ? 'توصيل' : 'استلام'}{order.branch ? ` · ${order.branch}` : ''} · {kwd(order.totalFils)} · {order.fulfilledAt ? `نُفِّذ ${when(order.fulfilledAt)}` : `طُلب ${when(order.createdAt)}`}</div>
              </div>
              {view === 'PAID' && (canFulfil
                ? <button type="button" disabled={Boolean(busy)} onClick={() => void fulfil(order.id)} className="min-h-11 px-5 rounded-xl bg-emerald-500 text-slate-950 text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50 shrink-0"><CheckCheck className="w-4 h-4" aria-hidden="true" />{busy === order.id ? 'جارٍ التنفيذ…' : 'تم التنفيذ'}</button>
                : <span className="text-xs text-slate-400 shrink-0">التنفيذ لفريق التشغيل والمطبخ</span>)}
            </li>
          ))}
        </ul>
      )}
      {data?.hasMore && <p className="text-xs text-slate-400 text-center">يظهر أقدم 50 طلبًا؛ نفّذ ما أمامك لتظهر البقية.</p>}
    </section>
  );
};
