import React from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Eye,
  Fingerprint,
  Gauge,
  ShieldAlert,
  ShieldCheck,
  UserRoundCheck
} from 'lucide-react';
import { store } from '../../lib/store';

export const TrustEngine: React.FC = () => {
  const unresolved = store.disputes.filter(d => !['RESOLVED', 'CLOSED'].includes(d.status));
  const problematicDocs = store.compliance.filter(c => ['EXPIRED', 'REJECTED'].includes(c.status));

  const hostSignals = store.hosts.map(host => {
    const grants = store.recipeGrants.filter(g => g.hostBusinessId === host.id && ['REQUESTED', 'APPROVED'].includes(g.status)).length;
    const collaborations = store.collaborations.filter(c => c.hostBusinessId === host.id).length;
    const disputes = unresolved.filter(d => d.hostBusinessId === host.id).length;
    const docs = problematicDocs.filter(d => d.hostBusinessId === host.id).length;
    const accessPressure = Math.max(0, grants - Math.max(1, collaborations) * 2);
    const verificationPenalty = ['SUSPENDED', 'EXPIRED_DOCS'].includes(host.verificationStatus) ? 25 : host.verificationStatus === 'NEEDS_ACTION' ? 12 : 0;
    const score = Math.max(0, 100 - disputes * 20 - docs * 25 - accessPressure * 5 - verificationPenalty);
    const risk = score >= 85 ? 'LOW' : score >= 65 ? 'MEDIUM' : 'HIGH';
    return { host, grants, collaborations, disputes, docs, accessPressure, score, risk };
  });

  const overallRisk = hostSignals.some(h => h.risk === 'HIGH') || unresolved.some(d => d.priority === 'CRITICAL')
    ? 'HIGH'
    : hostSignals.some(h => h.risk === 'MEDIUM') || unresolved.length || problematicDocs.length
      ? 'MEDIUM'
      : 'LOW';

  const postureClass = overallRisk === 'LOW' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-400/20' : overallRisk === 'MEDIUM' ? 'bg-amber-500/10 text-amber-300 border-amber-400/20' : 'bg-rose-500/10 text-rose-300 border-rose-400/20';

  return (
    <section className="glass-panel rounded-3xl border border-white/10 p-5 md:p-6 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-400/20 flex items-center justify-center text-rose-300"><Fingerprint className="w-6 h-6" /></div>
          <div>
            <h3 className="text-lg font-black text-stone-100">Trust & Risk Engine — محرك الثقة والمخاطر</h3>
            <p className="text-xs text-stone-400 mt-1 leading-6">درجة إرشادية قابلة للتفسير مبنية فقط على بيانات مسجلة: النزاعات، الامتثال، حالة المنشأة، وضغط طلبات الوصول. ليست حكمًا آليًا نهائيًا.</p>
          </div>
        </div>
        <span className={`px-3 py-1.5 rounded-full text-xs font-bold border ${postureClass}`}>Risk posture: {overallRisk}</span>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="rounded-2xl p-4 bg-white/5 border border-white/10"><ShieldAlert className="w-5 h-5 text-rose-300" /><div className="mt-3 text-xs text-stone-400">نزاعات تحتاج متابعة</div><div className="mt-1 text-2xl font-black text-stone-100">{unresolved.length}</div></div>
        <div className="rounded-2xl p-4 bg-white/5 border border-white/10"><AlertTriangle className="w-5 h-5 text-amber-300" /><div className="mt-3 text-xs text-stone-400">مستندات منتهية/مرفوضة</div><div className="mt-1 text-2xl font-black text-stone-100">{problematicDocs.length}</div></div>
        <div className="rounded-2xl p-4 bg-white/5 border border-white/10"><Eye className="w-5 h-5 text-sky-300" /><div className="mt-3 text-xs text-stone-400">طلبات/أذونات وصفات نشطة</div><div className="mt-1 text-2xl font-black text-stone-100">{store.recipeGrants.filter(g => ['REQUESTED','APPROVED'].includes(g.status)).length}</div></div>
      </div>

      <div className="grid lg:grid-cols-[1fr_1fr] gap-4">
        <div className="rounded-2xl p-4 bg-white/5 border border-white/10 space-y-3">
          <div className="font-bold text-stone-100 flex items-center gap-2"><Gauge className="w-4 h-4 text-[#e8c880]" /> Heuristic Risk Score للمنشآت</div>
          {hostSignals.map(card => (
            <div key={card.host.id} className="rounded-xl p-3 bg-slate-950/45 border border-white/10">
              <div className="flex items-center justify-between text-xs gap-3">
                <div className="flex items-center gap-2 min-w-0"><UserRoundCheck className={`w-4 h-4 shrink-0 ${card.risk === 'LOW' ? 'text-emerald-300' : card.risk === 'MEDIUM' ? 'text-amber-300' : 'text-rose-300'}`} /><span className="font-bold text-stone-200 truncate">{card.host.commercialName}</span></div>
                <strong className={card.risk === 'LOW' ? 'text-emerald-300' : card.risk === 'MEDIUM' ? 'text-amber-300' : 'text-rose-300'}>{card.score}/100</strong>
              </div>
              <div className="mt-2 h-2 rounded-full bg-white/5 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-l from-emerald-400 to-[#c7a55b]" style={{ width: `${card.score}%` }} /></div>
              <div className="mt-2 text-[10px] text-stone-500">نزاعات: {card.disputes} • مستندات مشكلة: {card.docs} • وصولات نشطة: {card.grants} • تعاونات: {card.collaborations}</div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl p-4 bg-white/5 border border-white/10 space-y-3">
          <div className="font-bold text-stone-100 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-300" /> قواعد الكشف المطبقة</div>
          {[
            'خصم عند وجود نزاعات غير مغلقة مرتبطة بالمنشأة.',
            'خصم عند وجود مستند امتثال منتهي أو مرفوض.',
            'خصم عند تعليق المنشأة أو انتهاء مستنداتها.',
            'إشارة إضافية عندما تتجاوز طلبات الوصول حجم التعاونات الفعلية بشكل ملحوظ.',
            'لا يتم إيقاف حساب أو اتهام طرف تلقائيًا بناءً على الدرجة وحدها.'
          ].map((text, idx) => (
            <div key={idx} className="rounded-xl p-3 bg-slate-950/45 border border-white/10 text-xs text-stone-400 leading-6 flex gap-2">
              <BadgeCheck className="w-4 h-4 shrink-0 mt-1 text-[#e8c880]" /><span>{text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
