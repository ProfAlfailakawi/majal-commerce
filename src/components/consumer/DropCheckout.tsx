import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BadgeCheck, Bell, CheckCircle2, CreditCard, PackageX, ShoppingBag, Star, Store, Truck } from 'lucide-react';
import { Launch } from '../../types/majal';
import { shortRef } from '../../lib/displayRef';
import { store } from '../../lib/store';
import { IS_DEMO_MODE } from '../../lib/runtime';
import { formatFils, kwdToFils } from '../../lib/money';
import { CheckoutOptions, commerceClient, newCheckoutKey, normalizeKuwaitPhone } from '../../lib/commerceClient';
import { DomainApiError, domainClient } from '../../lib/domainClient';
import { DropTrustChecklist } from './DropTrustChecklist';
import { DnaRing, DnaStepper } from '../dna/DnaKit';

interface Props { launch: Launch; acquisitionSource: 'MAJAL' | 'CREATOR' | 'HOST' }

type Placed = { orderId: string; totalFils: number; holdExpiresAt: string | null; checkoutUrl: string | null };

const inputClass = 'w-full glass-input rounded-xl px-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300';

/** Demo mode has no server: branches come from the local host record and there is no logistics. */
function demoOptions(launch: Launch): CheckoutOptions {
  const host = store.hosts.find(h => h.id === launch.hostBusinessId);
  const remaining = launch.quantityCapUnits ? Math.max(0, launch.quantityCapUnits - launch.unitsSold) : null;
  return {
    launchId: launch.id, unitPriceFils: kwdToFils(launch.sellingPriceKwd), holdMinutes: 15, quantityCap: launch.quantityCapUnits ?? null, remainingUnits: remaining,
    branches: launch.branches.map(id => {
      const branch = host?.branches.find(b => b.id === id);
      return { id, name: branch?.name || id, area: branch?.area ?? null, deliveryZones: [], pickupSlots: [], remainingUnits: null, orderingOpen: true };
    })
  };
}

function useCountdown(deadline: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [deadline]);
  if (!deadline) return null;
  const left = Math.max(0, Date.parse(deadline) - now);
  return { left, label: `${String(Math.floor(left / 60_000)).padStart(2, '0')}:${String(Math.floor((left % 60_000) / 1000)).padStart(2, '0')}` };
}

export const DropCheckout: React.FC<Props> = ({ launch, acquisitionSource }) => {
  const [demoState, setDemoState] = useState<'PENDING' | 'PAID' | 'CANCELLED' | 'REFUNDED'>('PENDING');
  const [options, setOptions] = useState<CheckoutOptions | null>(IS_DEMO_MODE ? demoOptions(launch) : null);
  const [loadError, setLoadError] = useState('');
  const [reviews, setReviews] = useState<{ count: number; taste: number; keepItPercent: number } | null>(null);
  const [units, setUnits] = useState(1);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [branchId, setBranchId] = useState('');
  const [fulfillment, setFulfillment] = useState<'PICKUP' | 'DELIVERY'>('PICKUP');
  const [zoneId, setZoneId] = useState('');
  const [slotId, setSlotId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState<Placed | null>(null);
  const [waitlistMsg, setWaitlistMsg] = useState('');
  const checkoutKey = useRef(newCheckoutKey());

  useEffect(() => {
    if (IS_DEMO_MODE) return;
    let live = true;
    commerceClient.checkoutOptions(launch.id).then(result => {
      if (!live) return;
      setOptions(result);
      const firstOpen = result.branches.find(b => b.orderingOpen) || result.branches[0];
      if (firstOpen) setBranchId(firstOpen.id);
    }).catch(() => { if (live) setLoadError('تعذّر تحميل خيارات الطلب. حاول مرة أخرى بعد لحظات.'); });
    domainClient.launchReviews(launch.id).then(r => { if (live) setReviews({ count: r.summary.count, taste: r.summary.taste, keepItPercent: r.summary.keepItPercent }); }).catch(() => undefined);
    return () => { live = false; };
  }, [launch.id]);

  useEffect(() => { if (IS_DEMO_MODE && !branchId && launch.branches[0]) setBranchId(launch.branches[0]); }, [branchId, launch.branches]);

  const branch = options?.branches.find(b => b.id === branchId);
  const zone = branch?.deliveryZones.find(z => z.id === zoneId);
  const unitPriceFils = options?.unitPriceFils ?? kwdToFils(launch.sellingPriceKwd);
  const feeFils = fulfillment === 'DELIVERY' ? zone?.feeFils ?? 0 : 0;
  const totalFils = unitPriceFils * units + feeFils;
  const remaining = useMemo(() => {
    const values = [options?.remainingUnits, branch?.remainingUnits].filter((v): v is number => typeof v === 'number');
    return values.length ? Math.min(...values) : null;
  }, [options, branch]);
  const soldOut = remaining === 0 || (branch ? !branch.orderingOpen : false);
  const maxUnits = Math.max(1, Math.min(store.policy.maxOrderUnits, remaining ?? store.policy.maxOrderUnits));
  const countdown = useCountdown(placed?.holdExpiresAt ?? null);

  // Changing branch invalidates a zone/slot chosen for another branch.
  useEffect(() => { setZoneId(''); setSlotId(''); }, [branchId]);
  useEffect(() => { if (units > maxUnits) setUnits(maxUnits); }, [maxUnits, units]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const contactPhone = normalizeKuwaitPhone(phone);
    if (!contactPhone) return setError('أدخل رقمًا كويتيًا من 8 أرقام، مثل 5XXX XXXX أو ‎+965 5XXX XXXX.');
    if (options?.branches.length && !branchId) return setError('اختر الفرع.');
    if (fulfillment === 'DELIVERY' && !zone) return setError('اختر منطقة التوصيل.');
    setBusy(true);
    try {
      if (IS_DEMO_MODE) {
        const order = store.placeOrder(launch.id, units, name || 'عميل مجال', contactPhone, acquisitionSource, branchId || undefined) as { id?: string } | undefined;
        if (!order || !order.id) { setError(store.lastGuardMessage || 'تعذر تسجيل الطلب.'); return; }
        setPlaced({ orderId: order.id, totalFils, holdExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(), checkoutUrl: null });
        return;
      }
      const result = await commerceClient.placeOrder({
        launchId: launch.id, units, contactPhone, branchId: branchId || undefined, fulfillmentType: fulfillment,
        deliveryZoneId: fulfillment === 'DELIVERY' ? zoneId : undefined, pickupSlotId: fulfillment === 'PICKUP' && slotId ? slotId : undefined
      }, checkoutKey.current);
      setPlaced({ orderId: result.order.id, totalFils: result.order.totalFils, holdExpiresAt: result.holdExpiresAt, checkoutUrl: result.checkoutUrl });
    } catch (err) {
      setError(err instanceof DomainApiError ? err.message : 'تعذّر إنشاء الطلب.');
      // A definitive refusal ends this attempt; the next submit is a new order.
      if (err instanceof DomainApiError && err.status && err.status < 500) checkoutKey.current = newCheckoutKey();
    } finally { setBusy(false); }
  };

  const joinWaitlist = async () => {
    const contactPhone = normalizeKuwaitPhone(phone);
    if (!contactPhone) { setWaitlistMsg('أدخل رقمك الكويتي أولًا لنبلغك عبر واتساب.'); return; }
    if (IS_DEMO_MODE) { setWaitlistMsg('تم! (عرض تجريبي) بنرسل لك على واتساب أول ما يتوفر.'); return; }
    try {
      const r = await commerceClient.joinWaitlist(launch.id, contactPhone);
      setWaitlistMsg(`تم! بنرسل لك على واتساب أول ما يتوفر. عدد المنتظرين: ${r.waiting}`);
    } catch (err) { setWaitlistMsg(err instanceof DomainApiError ? err.message : 'تعذّر التسجيل في قائمة الانتظار. سجّل دخولك ثم حاول.'); }
  };

  if (placed) {
    const expired = countdown ? countdown.left === 0 : false;
    return (
      <div role="status" className="dna-surface p-5 text-center space-y-4">
        <div className="font-black text-slate-100">تم حجز طلبك — رقم <span className="font-mono" title={placed.orderId}>{shortRef(placed.orderId, 'ط')}</span></div>
        <DnaStepper
          size="sm"
          ariaLabel="حالة الطلب"
          steps={[
            { key: 'hold', label: 'حجز', state: 'done', icon: <CheckCircle2 /> },
            { key: 'pay', label: 'دفع', state: demoState === 'PENDING' ? (expired ? 'blocked' : 'current') : demoState === 'CANCELLED' ? 'blocked' : 'done', icon: <CreditCard /> },
            { key: 'prep', label: 'تجهيز', state: demoState === 'PAID' ? 'current' : 'pending', icon: <ShoppingBag /> },
            { key: 'pickup', label: 'استلام', state: 'pending', icon: <Store /> }
          ]}
        />
        <div className="text-sm text-slate-100 pt-2">الإجمالي: <strong className="text-gold-300">{formatFils(placed.totalFils)}</strong></div>
        {countdown && demoState === 'PENDING' && (
          <div className="flex items-center justify-center gap-3" aria-live="polite">
            <DnaRing
              value={countdown.left}
              max={(options?.holdMinutes ?? 15) * 60_000}
              size={60}
              tone={expired ? 'danger' : 'accent'}
              label={<span dir="ltr">{countdown.label}</span>}
              ariaLabel={expired ? 'انتهت مهلة الحجز' : `الوقت المتبقي للحجز ${countdown.label}`}
            />
            <span className={`text-sm font-black text-start ${expired ? 'text-rose-300' : 'text-slate-200'}`}>
              {expired ? 'انتهت مهلة الحجز وتحررت الكمية.' : 'الحجز محفوظ لك'}
            </span>
          </div>
        )}
        {placed.checkoutUrl && !expired && (
          <a href={placed.checkoutUrl} className="dna-btnp w-full min-h-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">
            <CreditCard className="w-4 h-4" aria-hidden="true" /> أكمل الدفع
          </a>
        )}
        {IS_DEMO_MODE && demoState === 'PENDING' && !expired && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { store.simulateDemoPayment(placed.orderId); setDemoState('PAID'); }} className="dna-btnp min-h-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">
              <CreditCard className="w-4 h-4" aria-hidden="true" /> ادفع الآن (محاكاة)
            </button>
            <button type="button" onClick={() => { if (store.cancelDemoOrder(placed.orderId)) setDemoState('CANCELLED'); }} className="min-h-12 rounded-xl bg-white/5 border border-white/10 text-slate-200 font-bold text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">إلغاء الطلب</button>
          </div>
        )}
        {IS_DEMO_MODE && demoState === 'PAID' && (
          <div className="space-y-2">
            <div role="status" className="text-emerald-300 font-black text-sm">تم الدفع (محاكاة) — الطلب مؤكد</div>
            <button type="button" onClick={() => { if (store.refundDemoOrder(placed.orderId)) setDemoState('REFUNDED'); }} className="w-full min-h-11 rounded-xl bg-white/5 border border-white/10 text-rose-200 font-bold text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">طلب استرجاع (محاكاة)</button>
          </div>
        )}
        {IS_DEMO_MODE && demoState === 'CANCELLED' && <div role="status" className="text-slate-300 font-black text-sm">أُلغي الطلب وتحررت الكمية المحجوزة.</div>}
        {IS_DEMO_MODE && demoState === 'REFUNDED' && <div role="status" className="text-amber-200 font-black text-sm">تم استرجاع المبلغ (محاكاة) وأُلغي مستحق المبدع.</div>}
        {demoState === 'PENDING' && <p className="text-xs text-slate-400">يتأكد الطلب فقط بعد تأكيد الدفع من البوابة. لم تُخصم أي أموال قبل ذلك.</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {reviews && reviews.count > 0 && (
        <div className="flex items-center gap-4 rounded-2xl p-3 bg-white/5 border border-white/10 text-xs text-slate-200">
          <DnaRing value={reviews.keepItPercent} size={56} stroke={5} tone="info" label={`${reviews.keepItPercent}%`} ariaLabel={`خلّوه ${reviews.keepItPercent}%`} />
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-1 font-black text-sm"><Star className="w-4 h-4 text-gold-300" aria-hidden="true" />{reviews.taste.toFixed(1)} <span className="font-medium text-slate-300 text-xs">للطعم</span></div>
            <div className="flex items-center gap-1"><BadgeCheck className="w-4 h-4 text-emerald-300 shrink-0" aria-hidden="true" />{reviews.count} تقييم من مشترين موثّقين</div>
            <div className="text-slate-300"><bdi dir="ltr">{reviews.keepItPercent}%</bdi> يبونه يستمر</div>
          </div>
        </div>
      )}
      {remaining !== null && (
        <div className={`rounded-xl px-3 py-2 text-xs font-black flex items-center gap-2 ${soldOut ? 'py-3 bg-rose-500/10 text-rose-300 border border-dashed border-rose-400/40' : remaining <= 5 ? 'bg-rose-500/10 text-rose-300 border border-rose-400/20' : 'bg-white/5 text-slate-200 border border-white/10'}`} aria-live="polite">
          {soldOut && <PackageX className="w-5 h-5 shrink-0" aria-hidden="true" />}
          {soldOut ? 'نفدت الكمية المتاحة حاليًا' : `متبقي ${remaining} ${branch?.remainingUnits != null ? 'في هذا الفرع' : 'في هذا الإصدار'}`}
        </div>
      )}
      <DropTrustChecklist launchId={launch.id} />
      {loadError && <div role="alert" className="p-3 rounded-xl bg-rose-500/10 border border-rose-400/20 text-xs text-rose-300 font-bold">{loadError}</div>}

      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <div role="alert" className="p-3 rounded-xl bg-rose-500/10 border border-rose-400/20 text-xs text-rose-300 font-bold leading-6">{error}</div>}
        <div>
          <label htmlFor="drop-name" className="text-xs text-slate-300 block mb-1.5">الاسم</label>
          <input id="drop-name" value={name} onChange={e => setName(e.target.value)} maxLength={80} autoComplete="name" className={inputClass} />
        </div>
        <div>
          <label htmlFor="drop-phone" className="text-xs text-slate-300 block mb-1.5">رقم الهاتف (الكويت ‎+965)</label>
          <input id="drop-phone" dir="ltr" value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" maxLength={18} placeholder="+965 5XXX XXXX" aria-describedby="drop-phone-hint" className={`${inputClass} text-end`} required />
          <p id="drop-phone-hint" className="text-xs text-slate-300 mt-1">8 أرقام، يُستخدم للتواصل بشأن الطلب فقط.</p>
        </div>
        {options && options.branches.length > 0 && (
          <div>
            <label htmlFor="drop-branch" className="text-xs text-slate-300 block mb-1.5">الفرع</label>
            <select id="drop-branch" value={branchId} onChange={e => setBranchId(e.target.value)} className={inputClass}>
              {options.branches.map(b => <option key={b.id} value={b.id} disabled={!b.orderingOpen}>{b.name}{b.area ? ` — ${b.area}` : ''}{b.orderingOpen ? '' : ' (مكتمل)'}</option>)}
            </select>
          </div>
        )}
        <fieldset>
          <legend className="text-xs text-slate-300 mb-1.5">طريقة الاستلام</legend>
          <div className="grid grid-cols-2 gap-2">
            {([['PICKUP', 'استلام من الفرع', Store, 'جاهز لك في الفرع'], ['DELIVERY', 'توصيل', Truck, 'يصلك لمنطقتك']] as const).map(([value, label, Icon, hint]) => {
              const disabled = value === 'DELIVERY' && !branch?.deliveryZones.length;
              return (
                <label key={value} className={`relative flex flex-col items-center justify-center gap-1.5 rounded-2xl p-4 min-h-24 border text-xs font-black cursor-pointer text-center transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gold-300 ${fulfillment === value ? 'bg-gold-500/15 border-gold-300/50 text-gold-300 shadow-[inset_0_0_0_1px_rgba(199,165,91,0.35)]' : 'bg-white/5 border-white/10 text-slate-200'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <input type="radio" name="fulfillment" value={value} checked={fulfillment === value} disabled={disabled} onChange={() => setFulfillment(value)} className="sr-only" />
                  <Icon className="w-6 h-6" aria-hidden="true" />
                  <span>{label}</span>
                  <span className="text-[0.7rem] font-medium text-slate-400">{hint}</span>
                  {fulfillment === value && <CheckCircle2 className="absolute top-2 end-2 w-4 h-4" aria-hidden="true" />}
                </label>
              );
            })}
          </div>
        </fieldset>
        {fulfillment === 'DELIVERY' && branch && (
          <div>
            <label htmlFor="drop-zone" className="text-xs text-slate-300 block mb-1.5">منطقة التوصيل</label>
            <select id="drop-zone" value={zoneId} onChange={e => setZoneId(e.target.value)} className={inputClass} required>
              <option value="">اختر المنطقة</option>
              {branch.deliveryZones.map(z => <option key={z.id} value={z.id}>{z.nameAr} — {formatFils(z.feeFils)} — خلال {z.etaMinutes} دقيقة</option>)}
            </select>
          </div>
        )}
        {fulfillment === 'PICKUP' && branch && branch.pickupSlots.length > 0 && (
          <div>
            <label htmlFor="drop-slot" className="text-xs text-slate-300 block mb-1.5">موعد الاستلام</label>
            <select id="drop-slot" value={slotId} onChange={e => setSlotId(e.target.value)} className={inputClass}>
              <option value="">أقرب وقت متاح</option>
              {branch.pickupSlots.map(s => <option key={s.id} value={s.id} disabled={!s.available}>{s.label}{s.available ? '' : ' (ممتلئ)'}</option>)}
            </select>
          </div>
        )}
        <div className="flex items-center justify-between rounded-xl p-3 bg-white/5 border border-white/10">
          <span className="text-xs text-slate-300" id="drop-qty-label">الكمية</span>
          <div className="flex items-center gap-3" role="group" aria-labelledby="drop-qty-label">
            <button type="button" aria-label="تقليل الكمية" onClick={() => setUnits(Math.max(1, units - 1))} className="w-9 h-9 rounded-lg bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">−</button>
            <strong aria-live="polite">{units}</strong>
            <button type="button" aria-label="زيادة الكمية" onClick={() => setUnits(Math.min(maxUnits, units + 1))} className="w-9 h-9 rounded-lg bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">+</button>
          </div>
        </div>
        <div className="max-sm:sticky max-sm:-bottom-6 max-sm:z-10 max-sm:-mx-6 max-sm:px-6 max-sm:pt-3 max-sm:pb-9 max-sm:bg-[var(--majal-bg)] max-sm:border-t max-sm:border-white/10 space-y-4">
        <dl className="rounded-xl p-4 bg-slate-950/40 border border-white/10 space-y-1.5 text-xs">
          <div className="flex justify-between"><dt className="text-slate-300">{units} × {formatFils(unitPriceFils)}</dt><dd>{formatFils(unitPriceFils * units)}</dd></div>
          {fulfillment === 'DELIVERY' && <div className="flex justify-between"><dt className="text-slate-300">رسوم التوصيل</dt><dd>{zone ? formatFils(zone.feeFils) : '—'}</dd></div>}
          <div className="flex justify-between text-sm pt-1.5 border-t border-white/10"><dt className="text-slate-200 font-bold">الإجمالي</dt><dd className="font-black text-gold-300">{formatFils(totalFils)}</dd></div>
        </dl>
        {soldOut ? (
          <div className="space-y-2">
            <button type="button" onClick={joinWaitlist} className="w-full py-3.5 rounded-xl bg-white/10 border border-white/15 text-slate-100 font-black text-sm flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"><Bell className="w-4 h-4" aria-hidden="true" /> نبّهني عبر واتساب عند التوفر</button>
            <p className="text-xs text-slate-300">بالضغط توافق على استلام رسالة واتساب واحدة عند توفر هذا الإطلاق. يمكنك الإلغاء في أي وقت.</p>
            {waitlistMsg && <div role="status" className="text-xs text-emerald-300 font-bold">{waitlistMsg}</div>}
          </div>
        ) : (
          <button type="submit" disabled={busy || (!IS_DEMO_MODE && !options)} className="w-full py-3.5 rounded-xl bg-gold-500 text-slate-950 font-black text-sm flex items-center justify-center gap-2 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950">
            <ShoppingBag className="w-4 h-4" aria-hidden="true" /> {busy ? 'جارٍ الحجز…' : `احجز وادفع — ${formatFils(totalFils)}`}
          </button>
        )}
        </div>
        <p className="text-xs text-slate-300 text-center">يُحجز طلبك {options?.holdMinutes ?? 15} دقيقة بانتظار الدفع، ثم تتحرر الكمية تلقائيًا.</p>
      </form>
    </div>
  );
};

