import React, { useEffect, useMemo, useState } from 'react';
import {
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  FileCheck2,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  AlertTriangle,
  Milestone,
  StickyNote
} from 'lucide-react';
import { Collaboration, DealDecision } from '../../types/majal';
import { store } from '../../lib/store';
import { roleLabel } from '../../lib/permissions';
import { buildDealRoomCopilot } from '../../lib/intelligence';
import { intelligenceClient, type DealRoomEnrichment } from '../../lib/intelligenceClient';
import { Bot } from 'lucide-react';
import { StatusPill } from './StatusPill';
import { EmptyState } from './EmptyState';

interface DealRoomProps {
  collaboration: Collaboration;
}

export const DealRoom: React.FC<DealRoomProps> = ({ collaboration }) => {
  const [, setTick] = useState(0);
  useEffect(() => store.subscribe(() => setTick(t => t + 1)), []);
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState<DealDecision['category']>('DECISION');

  const product = store.products.find(p => p.id === collaboration.productId);
  const creator = store.creators.find(c => c.id === collaboration.creatorId);
  const host = store.hosts.find(h => h.id === collaboration.hostBusinessId);
  const gate = store.getLaunchGate(collaboration.id);
  const recipeVersions = store.recipeVersions
    .filter(v => v.productId === collaboration.productId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const currentRecipe = recipeVersions.find(v => v.versionNumber === product?.currentRecipeVersion) || recipeVersions[0];

  const decisions = useMemo(
    () => store.dealDecisions
      .filter(d => d.collaborationId === collaboration.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [collaboration.id, store.dealDecisions.length]
  );

  const tasks = [
    { title: 'تثبيت نسخة الوصفة الحالية', done: !!currentRecipe, owner: 'المبدع + الشيف', detail: currentRecipe?.versionNumber || 'لا توجد نسخة' },
    { title: 'تثبيت الشروط التجارية', done: collaboration.currentOffer?.status === 'ACCEPTED' || ['COMMERCIAL_AGREED','CONTRACT_DRAFTED','SIGNED','PRE_LAUNCH','LIVE','REVIEW','RENEWED'].includes(collaboration.stage), owner: 'الطرفان', detail: collaboration.currentOffer ? `V${collaboration.currentOffer.version}` : 'لا يوجد عرض' },
    { title: 'توقيع العقد', done: collaboration.contract?.status === 'FULLY_SIGNED', owner: 'المبدع + مالك المنشأة', detail: collaboration.contract?.status || 'لم ينشأ' },
    { title: 'اجتياز بوابة الإطلاق', done: !!gate?.allRequirementsPassed, owner: 'التشغيل + النظام', detail: gate ? `${Object.entries(gate).filter(([k,v]) => k !== 'allRequirementsPassed' && v).length}/11` : 'غير مهيأ' }
  ];

  const categoryMeta: Record<DealDecision['category'], { label: string; icon: React.ReactNode; cls: string }> = {
    DECISION: { label: 'قرار', icon: <ShieldCheck className="w-4 h-4" />, cls: 'text-gold-300' },
    NOTE: { label: 'ملاحظة', icon: <StickyNote className="w-4 h-4" />, cls: 'text-sky-300' },
    RISK: { label: 'مخاطرة', icon: <AlertTriangle className="w-4 h-4" />, cls: 'text-rose-300' },
    MILESTONE: { label: 'محطة', icon: <Milestone className="w-4 h-4" />, cls: 'text-emerald-300' }
  };

  const addDecision = () => {
    const created = store.addDealDecision(collaboration.id, message, category);
    if (created) setMessage('');
  };

  // Deterministic copilot: summarizes options and risks. It never executes a
  // contract or decides — the guardrails are part of the returned object.
  const copilot = useMemo(
    () => buildDealRoomCopilot({
      collaboration,
      product,
      host,
      offers: collaboration.currentOffer ? [collaboration.currentOffer] : [],
      gatePassed: !!gate?.allRequirementsPassed
    }),
    [collaboration.id, collaboration.stage, collaboration.currentOffer?.version, gate?.allRequirementsPassed]
  );

  // Optional AI narrative layered on the deterministic copilot. Absent when AI
  // is disabled; numbers are grounded server-side against the option summaries.
  const [aiNarrative, setAiNarrative] = useState<DealRoomEnrichment | null>(null);
  useEffect(() => {
    let active = true;
    setAiNarrative(null);
    intelligenceClient.dealRoom({
      stage: collaboration.stage,
      contractStatus: collaboration.contract?.status || 'NONE',
      optionSummaries: copilot.optionSummaries,
      gatePassed: !!gate?.allRequirementsPassed
    }).then(result => { if (active && result) setAiNarrative(result); });
    return () => { active = false; };
  }, [collaboration.id, collaboration.stage, collaboration.currentOffer?.version, gate?.allRequirementsPassed]);

  return (
    <section className="glass-panel rounded-3xl border border-white/10 p-5 md:p-6 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-400/20 flex items-center justify-center text-sky-300"><BriefcaseBusiness className="w-6 h-6" /></div>
          <div>
            <h3 className="text-lg font-black text-slate-100">غرفة الصفقة</h3>
            <p className="text-xs text-slate-400 mt-1">{creator?.displayName || 'مبدع'} × {host?.commercialName || 'منشأة'} — {product?.publicName || 'منتج'}</p>
          </div>
        </div>
        <StatusPill status={collaboration.stage} prefix="المرحلة" size="md" />
      </div>

      <div className="grid xl:grid-cols-[.9fr_1.1fr] gap-5">
        <div className="space-y-3">
          <div className="font-bold text-sm text-slate-100 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-300" /> خط سير الصفقة</div>
          {tasks.map((task, idx) => (
            <div key={idx} className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10 gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${task.done ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'}`}>
                  {task.done ? <CheckCircle2 className="w-4 h-4" /> : <Clock3 className="w-4 h-4" />}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-200">{task.title}</div>
                  <div className="text-[11px] text-slate-500 mt-1">المسؤول: {task.owner} — {task.detail}</div>
                </div>
              </div>
              <span className={`text-[10px] font-bold shrink-0 ${task.done ? 'text-emerald-300' : 'text-amber-300'}`}>{task.done ? 'مكتمل' : 'قيد التنفيذ'}</span>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="font-bold text-sm text-slate-100 flex items-center gap-2"><MessageSquareText className="w-4 h-4 text-fuchsia-300" /> سجل القرارات</div>
            <span className="text-[10px] text-slate-500">{decisions.length} سجلات بشرية محفوظة</span>
          </div>

          <div className="rounded-2xl bg-slate-950/50 border border-white/10 p-4 space-y-3 max-h-72 overflow-auto">
            {decisions.length === 0 ? (
              <EmptyState
                    variant="inline"
                    icon={<MessageSquareText className="w-6 h-6" />}
                    title="ما فيه قرارات مسجّلة بعد"
                    body="كل قرار أو ملاحظة تتسجّل هنا بصاحبها ووقتها، فتصير الصفقة قابلة للمراجعة بدل ما تعتمد على الذاكرة."
                  />
            ) : decisions.map(decision => {
              const meta = categoryMeta[decision.category];
              return (
                <div key={decision.id} className="rounded-xl p-3 bg-white/5 border border-white/10 text-xs leading-6 text-slate-300">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className={`flex items-center gap-2 font-black ${meta.cls}`}>{meta.icon}{meta.label}</div>
                    <span className="text-[9px] text-slate-600">{new Date(decision.createdAt).toLocaleString('ar-KW')}</span>
                  </div>
                  <div>{decision.text}</div>
                  <div className="mt-2 text-[10px] text-slate-500">{decision.authorName} — {roleLabel(decision.authorRole)}</div>
                </div>
              );
            })}
          </div>

          <div className="grid sm:grid-cols-[140px_1fr_auto] gap-2">
            <select value={category} onChange={e => setCategory(e.target.value as DealDecision['category'])} className="glass-input px-3 py-2 rounded-xl text-xs outline-none">
              <option value="DECISION">قرار</option>
              <option value="NOTE">ملاحظة</option>
              <option value="RISK">مخاطرة</option>
              <option value="MILESTONE">محطة</option>
            </select>
            <input value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addDecision(); }} placeholder="سجّل قرارًا أو ملاحظة مرتبطة بالصفقة..." className="glass-input px-4 py-2.5 rounded-xl text-xs outline-none text-slate-100" />
            <button onClick={addDecision} disabled={message.trim().length < 3} className="px-4 py-2.5 rounded-xl bg-gold-500 disabled:bg-white/5 disabled:text-slate-600 text-slate-950 font-black text-xs">حفظ</button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl p-4 bg-indigo-500/5 border border-indigo-400/15 space-y-3">
        <div className="flex items-center gap-2 text-sm font-black text-indigo-200"><Bot className="w-4 h-4" /> يلخّص ولا يقرّر</div>
        <p className="text-[11px] text-slate-400 leading-6">{aiNarrative?.narrative || copilot.summary}</p>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <div className="text-[11px] font-bold text-slate-300">الخيارات</div>
            {copilot.optionSummaries.map((option, idx) => (
              <div key={idx} className="text-[11px] text-slate-400 rounded-lg px-3 py-2 bg-white/5 border border-white/10">{option}</div>
            ))}
          </div>
          <div className="space-y-2">
            <div className="text-[11px] font-bold text-slate-300">مخاطر ونقاط انتباه</div>
            {copilot.risks.map((risk, idx) => (
              <div key={idx} className={`text-[11px] rounded-lg px-3 py-2 border ${risk.level === 'HIGH' ? 'bg-rose-500/10 border-rose-400/20 text-rose-200' : 'bg-amber-500/10 border-amber-400/20 text-amber-200'}`}>{risk.text}</div>
            ))}
            {(aiNarrative?.watchouts || []).map((watch, idx) => (
              <div key={`ai-${idx}`} className="text-[11px] rounded-lg px-3 py-2 bg-white/5 border border-white/10 text-slate-400">{watch}</div>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
          {copilot.blockedActions.map((guard, idx) => (
            <span key={idx} className="inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full bg-slate-950/50 border border-white/10 text-slate-400">
              <ShieldCheck className="w-3 h-3 text-emerald-300" /> {guard.label}
            </span>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3 text-xs">
        <div className="rounded-2xl p-4 bg-white/5 border border-white/10"><FileCheck2 className="w-4 h-4 text-sky-300 mb-2" /><div className="text-slate-400">العقد</div><div className="font-black text-slate-100 mt-1">{collaboration.contract?.status || 'لم ينشأ'}</div></div>
        <div className="rounded-2xl p-4 bg-white/5 border border-white/10"><Sparkles className="w-4 h-4 text-gold-300 mb-2" /><div className="text-slate-400">آخر عرض</div><div className="font-black text-slate-100 mt-1">{collaboration.currentOffer ? `${collaboration.currentOffer.creatorRoyaltyRatePercent}% للمبدع — V${collaboration.currentOffer.version}` : 'لا يوجد'}</div></div>
        <div className="rounded-2xl p-4 bg-white/5 border border-white/10"><UserRoundCheck className="w-4 h-4 text-emerald-300 mb-2" /><div className="text-slate-400">سلامة السجل</div><div className="font-black text-emerald-300 mt-1">محفوظ + مرتبط بـ Audit</div></div>
      </div>
    </section>
  );
};
