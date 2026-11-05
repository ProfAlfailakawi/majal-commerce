import React, { useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { DEMO_AVAILABLE, enterDemoMode } from '../../lib/runtime';

/**
 * زر نصي ظاهر لدخول البيئة التجريبية المعزولة (بلا حساب وبلا بيانات حقيقية).
 * الدخول يمرّ بالخادم أولًا: إن كان معطّلًا أو ممتلئًا يظهر السبب هنا ولا يُدخَل بصمت.
 */
export const DemoEntryButton: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!DEMO_AVAILABLE) return null;
  const enter = async () => {
    setBusy(true);
    setError('');
    const result = await enterDemoMode();
    if (!result.ok) { setError(result.message); setBusy(false); }
  };
  return (
    <div className={className}>
      <button
        type="button"
        data-testid="demo-entry"
        onClick={() => void enter()}
        disabled={busy}
        aria-busy={busy}
        className="w-full min-h-11 px-4 py-3 rounded-2xl border border-amber-400/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
      >
        <FlaskConical className="w-4 h-4" aria-hidden="true" />
        <span>{busy ? 'جارٍ تجهيز البيئة التجريبية…' : 'تجربة العرض بلا حساب'}</span>
      </button>
      <p className="mt-1.5 text-center text-xs text-slate-400 leading-5">بيئة تجريبية معزولة ببيانات مصطنعة — لا تمسّ أي حساب أو بيانات حقيقية.</p>
      {error && <p role="alert" className="mt-1.5 text-center text-xs text-rose-300">{error}</p>}
    </div>
  );
};
