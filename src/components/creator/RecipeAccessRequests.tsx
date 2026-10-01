import React from 'react';
import { CheckCircle2, Clock3, LockKeyhole, ShieldCheck, XCircle } from 'lucide-react';
import { store } from '../../lib/store';

interface RecipeAccessRequestsProps {
  creatorId: string;
}

const DAY = 86_400_000;

/** Remaining-days arc: how much of the grant's window is left. The date stays printed beside it. */
const DaysArc: React.FC<{ from?: string; until: string }> = ({ from, until }) => {
  const end = new Date(until).getTime();
  const start = from ? new Date(from).getTime() : NaN;
  if (!Number.isFinite(end)) return null;
  const days = Math.max(0, Math.ceil((end - Date.now()) / DAY));
  const span = Number.isFinite(start) && end > start ? end - start : Math.max(days, 1) * DAY;
  const left = Math.max(0, Math.min(1, (end - Date.now()) / span));
  const r = 17, c = 2 * Math.PI * r;
  return (
    <span className="relative inline-grid place-items-center w-11 h-11 shrink-0" role="img" aria-label={`المتبقي ${days} يوم`}>
      <svg viewBox="0 0 44 44" className="absolute inset-0 w-full h-full -rotate-90" aria-hidden="true">
        <circle cx="22" cy="22" r={r} fill="none" strokeWidth="3" className="stroke-white/10" />
        <circle cx="22" cy="22" r={r} fill="none" strokeWidth="3" strokeLinecap="round" className="stroke-emerald-400" strokeDasharray={c} strokeDashoffset={c * (1 - left)} />
      </svg>
      <span className="relative text-xs font-black text-slate-100 tabular-nums leading-none">{days}</span>
    </span>
  );
};

export const RecipeAccessRequests: React.FC<RecipeAccessRequestsProps> = ({ creatorId }) => {
  const requests = store.recipeGrants.filter(g => g.creatorId === creatorId && (g.status === 'REQUESTED' || g.status === 'APPROVED'));

  if (!requests.length) return null;

  return (
    <section className="glass-panel rounded-3xl border border-white/10 p-5 md:p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-fuchsia-500/10 border border-fuchsia-400/20 flex items-center justify-center text-fuchsia-300"><LockKeyhole className="w-6 h-6" /></div>
        <div>
          <h3 className="text-lg font-black text-slate-100">أذونات الوصفات</h3>
          <p className="text-xs text-slate-400 mt-1">أنت من يقرر من يرى ماذا، ولأي مدة، وبأي مستوى إفصاح.</p>
        </div>
      </div>

      <div className="space-y-3">
        {requests.map(grant => {
          const product = store.products.find(p => p.id === grant.productId);
          const host = store.hosts.find(h => h.id === grant.hostBusinessId);
          return (
            <div key={grant.id} className="rounded-2xl p-4 bg-white/5 border border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-slate-100">{product?.publicName}</span>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-black ${grant.status === 'REQUESTED' ? 'bg-gold-500/10 text-gold-300 border border-gold-400/20' : 'bg-emerald-500/10 text-emerald-300 border border-emerald-400/20'}`}>
                    {grant.status === 'REQUESTED' ? 'طلب جديد' : 'إذن فعّال'}
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-2 leading-6">{host?.commercialName} — مستوى الإفصاح المطلوب/المعتمد: <strong className="text-slate-200">L{grant.disclosureLevel}</strong></div>
                <div className="text-xs text-slate-400 mt-1">السبب: {grant.purpose}</div>
              </div>

              {grant.status === 'REQUESTED' ? (
                <div className="flex flex-wrap gap-2">
                  <button onClick={async () => { await Promise.resolve(store.approveRecipeAccess(grant.id, Math.min(grant.disclosureLevel, 2) as 0 | 1 | 2 | 3)); }} className="px-3 py-2 rounded-xl bg-sky-400 text-slate-950 text-xs font-black flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> اعتماد L2</button>
                  <button onClick={async () => { await Promise.resolve(store.approveRecipeAccess(grant.id, grant.disclosureLevel)); }} className="px-3 py-2 rounded-xl bg-emerald-500 text-slate-950 text-xs font-black flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> اعتماد المطلوب</button>
                  <button onClick={async () => { await Promise.resolve(store.revokeRecipeAccess(grant.id)); }} className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-xs font-black flex items-center gap-1.5"><XCircle className="w-4 h-4" /> رفض</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1.5 rounded-xl bg-emerald-500/8 border border-emerald-400/15 text-emerald-300 text-xs font-black flex items-center gap-2">{grant.expiresAt ? <DaysArc from={grant.grantedAt || grant.requestedAt} until={grant.expiresAt} /> : <Clock3 className="w-4 h-4" />} حتى {grant.expiresAt ? new Date(grant.expiresAt).toLocaleDateString('ar-KW') : 'غير محدد'}</span>
                  <button onClick={async () => { await Promise.resolve(store.revokeRecipeAccess(grant.id)); }} className="px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-400/20 text-rose-300 text-xs font-black">سحب الإذن</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
