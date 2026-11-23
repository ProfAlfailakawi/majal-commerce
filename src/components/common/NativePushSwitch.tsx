import React, { useEffect, useState } from 'react';
import { disableNativePush, enableNativePush, isNativePushAvailable, nativePushEnabledLocally, readNativePushPermission } from '../../lib/nativePush';

/** مفتاح «فعّل التنبيهات» داخل تطبيق iOS وحده؛ لا يظهر في المتصفح. */
export function NativePushSwitch() {
  const [available] = useState(isNativePushAvailable);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!available) return;
    void readNativePushPermission().then(p => setOn(p === 'granted' && nativePushEnabledLocally()));
  }, [available]);

  if (!available) return null;

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    setNote('');
    try {
      if (on) {
        await disableNativePush();
        setOn(false);
      } else {
        const result = await enableNativePush();
        setOn(result === 'granted');
        if (result === 'denied') setNote('التنبيهات موقوفة لهذا التطبيق. فعّلها من الإعدادات ← مجال ← الإشعارات.');
      }
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'تعذّر تفعيل التنبيهات.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-3 p-3 rounded-xl bg-white/[0.04] border border-white/10">
      <div className="flex items-center justify-between gap-3">
        <span>
          <span className="block font-bold text-slate-100">فعّل التنبيهات</span>
          <span className="block text-xs text-slate-400 leading-5">تصلك الطلبات وتحديثاتها على جهازك ولو كان التطبيق مغلقًا.</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="فعّل التنبيهات"
          disabled={busy}
          onClick={toggle}
          className={`relative shrink-0 w-12 h-7 rounded-full transition-colors disabled:opacity-60 ${on ? 'bg-gold-500' : 'bg-white/15'}`}
        >
          <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? 'start-6' : 'start-1'}`} />
        </button>
      </div>
      {note && <p className="mt-2 text-xs text-rose-200 leading-5" role="status">{note}</p>}
    </div>
  );
}
