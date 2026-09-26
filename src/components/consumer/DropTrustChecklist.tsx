import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, ShieldCheck, XCircle } from 'lucide-react';
import { commerceClient, TrustChecklist, TrustItem } from '../../lib/commerceClient';
import { IS_DEMO_MODE } from '../../lib/runtime';

const STATUS: Record<TrustItem['status'], { label: string; tone: string; icon: React.ReactNode }> = {
  PASS: { label: 'مُتحقق', tone: 'text-emerald-300', icon: <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> },
  EXPIRING: { label: 'ينتهي قريبًا', tone: 'text-amber-300', icon: <Clock3 className="w-4 h-4" aria-hidden="true" /> },
  DECLARED: { label: 'مُصرّح به', tone: 'text-sky-300', icon: <ShieldCheck className="w-4 h-4" aria-hidden="true" /> },
  PENDING_REVIEW: { label: 'قيد المراجعة', tone: 'text-amber-300', icon: <Clock3 className="w-4 h-4" aria-hidden="true" /> },
  EXPIRED: { label: 'منتهٍ', tone: 'text-rose-300', icon: <XCircle className="w-4 h-4" aria-hidden="true" /> },
  MISSING: { label: 'غير متوفر', tone: 'text-slate-300', icon: <AlertTriangle className="w-4 h-4" aria-hidden="true" /> }
};

const dateAr = (iso: string) => new Date(iso).toLocaleDateString('ar-KW', { year: 'numeric', month: 'long', day: 'numeric' });

/** Public Launch Gate checklist for a Drop: licence, allergens, halal, food-safety expiry. */
export const DropTrustChecklist: React.FC<{ launchId: string }> = ({ launchId }) => {
  const [data, setData] = useState<TrustChecklist | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (IS_DEMO_MODE) return;
    let live = true;
    commerceClient.trust(launchId).then(result => { if (live) setData(result); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [launchId]);

  if (IS_DEMO_MODE || failed) return null;
  if (!data) return <div className="text-xs text-slate-300" role="status">جارٍ تحميل قائمة الامتثال…</div>;
  return (
    <section aria-labelledby={`trust-${launchId}`} className="rounded-2xl p-4 bg-white/5 border border-white/10 space-y-3">
      <h4 id={`trust-${launchId}`} className="text-xs font-black text-slate-100 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-300" aria-hidden="true" /> قائمة بوابة الإطلاق</h4>
      <ul className="space-y-2">
        {data.items.map(item => {
          const s = STATUS[item.status];
          return (
            <li key={item.key} className="flex items-start justify-between gap-3 text-xs">
              <div>
                <div className="font-bold text-slate-100">{item.labelAr}</div>
                {item.detail && <div className="text-slate-300 mt-0.5">{item.detail}</div>}
                {item.expiresAt && <div className="text-slate-300 mt-0.5">ساري حتى {dateAr(item.expiresAt)}</div>}
              </div>
              <span className={`shrink-0 inline-flex items-center gap-1 font-black ${s.tone}`}>{s.icon}{s.label}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
