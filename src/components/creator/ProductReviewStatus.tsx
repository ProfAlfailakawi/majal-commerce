import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, Pencil, X } from 'lucide-react';
import { store } from '../../lib/store';
import { CreatorProduct } from '../../types/majal';
import { useDialogBehavior } from '../../hooks/useDialogBehavior';

const BADGE = {
  PENDING: { label: 'قيد المراجعة', cls: 'bg-amber-500/10 text-amber-300 border-amber-400/25', icon: <Clock3 className="w-3.5 h-3.5" aria-hidden="true" /> },
  APPROVED: { label: 'معتمد', cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-400/25', icon: <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> },
  REJECTED: { label: 'يحتاج تعديلًا', cls: 'bg-rose-500/10 text-rose-300 border-rose-400/25', icon: <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" /> }
} as const;

/** حالة اعتماد المنتج للمبدع: قيد المراجعة / معتمد / يحتاج تعديلًا مع سبب الأدمن، وتعديل وإعادة إرسال. */
export const ProductReviewStatus: React.FC<{ product: CreatorProduct }> = ({ product }) => {
  const status = product.approvalStatus;
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ publicName: '', category: '', shortDescription: '', story: '', cost: '', price: '' });
  const close = () => { if (!busy) setEditing(false); };
  const dialogRef = useDialogBehavior<HTMLDivElement>(editing, close);
  if (!status) return null;
  const badge = BADGE[status];
  const canEdit = status !== 'APPROVED';

  const open = () => {
    setForm({ publicName: product.publicName, category: product.category, shortDescription: product.shortDescription, story: product.story || '', cost: String(product.estimatedUnitCostKwd), price: String(product.targetSellingPriceKwd) });
    setError('');
    setEditing(true);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const cost = Number(form.cost), price = Number(form.price);
    if (form.publicName.trim().length < 2) return setError('اسم المنتج يجب أن يكون حرفين على الأقل.');
    if (form.shortDescription.trim().length < 5) return setError('اكتب وصفًا من 5 أحرف على الأقل.');
    if (!Number.isFinite(cost) || cost < 0) return setError('التكلفة غير صالحة.');
    if (!Number.isFinite(price) || price <= 0) return setError('السعر المستهدف يجب أن يكون أكبر من صفر.');
    setBusy(true); setError('');
    const ok = await store.resubmitProduct(product.id, { publicName: form.publicName.trim(), category: form.category.trim() || product.category, shortDescription: form.shortDescription.trim(), story: form.story.trim() || undefined, estimatedUnitCostKwd: cost, targetSellingPriceKwd: price });
    setBusy(false);
    if (ok) setEditing(false); else setError(store.lastGuardMessage || 'تعذّر إرسال التعديل. حاول مجددًا.');
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-black ${badge.cls}`}>{badge.icon}{badge.label}</span>
        {status === 'PENDING' && <span className="text-xs text-slate-400">لا يراه أي منشأة قبل اعتماد الإدارة.</span>}
      </div>
      {status === 'REJECTED' && (
        <div role="note" className="rounded-xl bg-rose-500/10 border border-rose-400/20 p-3 text-xs text-rose-100 leading-6">
          <span className="font-black">ملاحظة الإدارة: </span>{product.approvalReason || 'لم تُذكر ملاحظة. راجع بيانات المنتج وأعد الإرسال.'}
        </div>
      )}
      {canEdit && <button type="button" onClick={open} className="min-h-11 w-full rounded-xl bg-white/5 border border-white/10 text-xs font-black text-gold-300 flex items-center justify-center gap-2 hover:bg-white/10"><Pencil className="w-4 h-4" aria-hidden="true" />{status === 'REJECTED' ? 'عدّل وأعد الإرسال' : 'عدّل بيانات المنتج'}</button>}
      {editing && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`edit-${product.id}`} className="w-full max-w-lg max-h-dvh overflow-y-auto bg-slate-900 border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 space-y-4 text-slate-100">
            <div className="flex items-center justify-between gap-3">
              <h3 id={`edit-${product.id}`} className="font-black">تعديل المنتج وإعادة إرساله للمراجعة</h3>
              <button type="button" onClick={close} aria-label="إغلاق" className="min-w-11 min-h-11 grid place-items-center rounded-xl hover:bg-white/10"><X className="w-5 h-5" aria-hidden="true" /></button>
            </div>
            <form onSubmit={submit} className="space-y-3">
              <label className="block text-xs font-black space-y-1.5"><span>اسم المنتج</span><input value={form.publicName} onChange={e => setForm({ ...form, publicName: e.target.value })} maxLength={140} className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none" /></label>
              <label className="block text-xs font-black space-y-1.5"><span>الفئة</span><input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} maxLength={80} className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none" /></label>
              <label className="block text-xs font-black space-y-1.5"><span>وصف قصير</span><textarea value={form.shortDescription} onChange={e => setForm({ ...form, shortDescription: e.target.value })} rows={3} maxLength={1500} className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none" /></label>
              <label className="block text-xs font-black space-y-1.5"><span>القصة (اختياري)</span><textarea value={form.story} onChange={e => setForm({ ...form, story: e.target.value })} rows={2} maxLength={4000} className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none" /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-black space-y-1.5"><span>التكلفة (د.ك)</span><input type="number" inputMode="decimal" min="0" step="0.001" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none" /></label>
                <label className="block text-xs font-black space-y-1.5"><span>السعر المستهدف (د.ك)</span><input type="number" inputMode="decimal" min="0" step="0.001" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none" /></label>
              </div>
              {error && <div role="alert" className="text-xs font-bold text-rose-300">{error}</div>}
              <button type="submit" disabled={busy} className="w-full min-h-12 rounded-xl bg-gold-500 text-slate-950 text-sm font-black disabled:opacity-60">{busy ? 'جارٍ الإرسال…' : 'أرسل للمراجعة'}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
