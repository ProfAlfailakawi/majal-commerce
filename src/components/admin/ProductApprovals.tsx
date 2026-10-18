import React, { useEffect, useState } from 'react';
import { Check, ClipboardCheck, X } from 'lucide-react';
import { store } from '../../lib/store';

/**
 * اعتماد المنتجات: كل منتج جديد من مبدع يبدأ «قيد المراجعة» ولا يراه أي منشأة قبل قرار أدمن.
 * الاعتماد يرفعه للمطابقة؛ الرفض يعيده للمبدع مع السبب ليعدّل ويعيد الإرسال.
 */
export const ProductApprovals: React.FC = () => {
  const [, setTick] = useState(0);
  useEffect(() => store.subscribe(() => setTick(t => t + 1)), []);
  const [busy, setBusy] = useState('');
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [shown, setShown] = useState(10);

  const pending = store.products.filter(p => p.approvalStatus === 'PENDING');
  const creatorName = (creatorId: string) => store.creators.find(c => c.id === creatorId)?.displayName || 'مبدع';

  const decide = async (productId: string, decision: 'APPROVE' | 'REJECT') => {
    if (busy) return;
    const cleaned = reason.trim();
    if (decision === 'REJECT' && cleaned && cleaned.length < 3) { setNotice({ tone: 'error', text: 'السبب قصير جدًا. اكتب 3 أحرف على الأقل أو اتركه فارغًا.' }); return; }
    setBusy(productId);
    const ok = await store.decideProduct(productId, decision, decision === 'REJECT' ? cleaned : '');
    setBusy('');
    if (ok) {
      setNotice({ tone: 'ok', text: decision === 'APPROVE' ? 'اعتُمد المنتج وصار ظاهرًا للمنشآت، وأُبلغ المبدع.' : 'رُفض المنتج وأُبلغ المبدع بالسبب.' });
      setRejecting(null); setReason('');
    } else {
      setNotice({ tone: 'error', text: store.lastGuardMessage || 'تعذّر تنفيذ القرار. حدّث الصفحة وحاول مجددًا.' });
    }
    window.setTimeout(() => setNotice(null), 5000);
  };

  return (
    <section className="glass-panel rounded-3xl p-5 border border-white/10 space-y-4" aria-labelledby="product-approvals-title">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-2xl bg-gold-500/10 border border-gold-300/20 text-gold-300 grid place-items-center"><ClipboardCheck className="w-5 h-5" aria-hidden="true" /></span>
          <div>
            <h3 id="product-approvals-title" className="font-black text-slate-100">اعتماد المنتجات</h3>
            <p className="text-xs text-slate-400 mt-1">لا يظهر أي منتج جديد للمنشآت قبل اعتماده هنا.</p>
          </div>
        </div>
        <span className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-black text-slate-200">{pending.length} بانتظار القرار</span>
      </div>
      {notice && <div role={notice.tone === 'error' ? 'alert' : 'status'} className={`p-3 rounded-xl text-xs font-bold border ${notice.tone === 'ok' ? 'bg-emerald-500/10 border-emerald-400/20 text-emerald-300' : 'bg-rose-500/10 border-rose-400/20 text-rose-200'}`}>{notice.text}</div>}
      {pending.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-slate-400">لا توجد منتجات بانتظار الاعتماد الآن.</div>
      ) : (
        <div className="space-y-3">
          {pending.slice(0, shown).map(product => (
            <article key={product.id} className="rounded-2xl p-4 bg-slate-950/40 border border-white/10 space-y-3">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-black text-slate-100 break-words">{product.publicName}</div>
                  <div className="text-xs text-slate-400 mt-1">{creatorName(product.creatorId)} · {product.category} · السعر المستهدف <span className="whitespace-nowrap">{product.targetSellingPriceKwd.toFixed(3)} د.ك</span></div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button type="button" disabled={Boolean(busy)} onClick={() => void decide(product.id, 'APPROVE')} className="min-h-11 px-4 rounded-xl bg-emerald-500 text-slate-950 text-xs font-black flex items-center gap-1.5 disabled:opacity-50"><Check className="w-4 h-4" aria-hidden="true" />{busy === product.id ? 'جارٍ التنفيذ…' : 'اعتماد'}</button>
                  <button type="button" disabled={Boolean(busy)} onClick={() => { setRejecting(rejecting === product.id ? null : product.id); setReason(''); }} aria-expanded={rejecting === product.id} className="min-h-11 px-4 rounded-xl bg-rose-500/10 text-rose-300 border border-rose-400/20 text-xs font-black flex items-center gap-1.5 disabled:opacity-50"><X className="w-4 h-4" aria-hidden="true" />رفض</button>
                </div>
              </div>
              <p className="text-xs text-slate-300 leading-6 break-words">{product.shortDescription}</p>
              {product.generalIngredients.length > 0 && <div className="text-xs text-slate-400">المكونات: {product.generalIngredients.slice(0, 8).join('، ')}</div>}
              {product.allergens.length > 0 && <div className="text-xs text-amber-300">مسببات الحساسية: {product.allergens.join('، ')}</div>}
              {rejecting === product.id && (
                <div className="space-y-2">
                  <label className="block text-xs font-black text-slate-300" htmlFor={`reject-${product.id}`}>سبب الرفض (اختياري، يصل المبدع كما هو)</label>
                  <textarea id={`reject-${product.id}`} value={reason} onChange={e => setReason(e.target.value)} maxLength={500} rows={2} className="glass-input w-full rounded-xl px-3 py-2 text-xs outline-none" placeholder="مثال: أضف المكونات الأساسية وحجم الحصة." />
                  <button type="button" disabled={Boolean(busy)} onClick={() => void decide(product.id, 'REJECT')} className="min-h-11 px-4 rounded-xl bg-rose-500 text-white text-xs font-black disabled:opacity-50">تأكيد الرفض</button>
                </div>
              )}
            </article>
          ))}
          {pending.length > shown && <button type="button" onClick={() => setShown(v => v + 10)} className="mx-auto flex min-h-11 items-center rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-bold text-gold-300">عرض المزيد ({pending.length - shown})</button>}
        </div>
      )}
    </section>
  );
};
