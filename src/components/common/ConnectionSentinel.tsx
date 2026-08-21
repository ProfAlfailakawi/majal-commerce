import React, { useEffect, useState } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';

export const ConnectionSentinel: React.FC = () => {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (online) return null;
  return <div role="status" aria-live="polite" className="fixed bottom-5 left-5 z-[94] w-[min(360px,calc(100vw-2.5rem))] rounded-2xl bg-[#151b2b]/98 border border-amber-400/25 shadow-2xl p-4 flex items-start gap-3">
    <span className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-300 grid place-items-center shrink-0"><CloudOff className="w-5 h-5" /></span>
    <div className="flex-1"><strong className="block text-xs text-slate-100">الاتصال متوقف مؤقتاً</strong><span className="block mt-1 text-[11px] leading-5 text-slate-400">لم ننفذ أي عملية حساسة. أعد المحاولة بعد عودة الاتصال.</span></div>
    <button onClick={() => window.location.reload()} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5" aria-label="إعادة تحميل الصفحة"><RefreshCw className="w-4 h-4" /></button>
  </div>;
};
