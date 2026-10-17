import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { BadgeCheck, ChevronLeft, Clock3, Gift, MapPin, MessageCircle, Package, Phone, Plus, Search, ShieldCheck, Truck, X } from 'lucide-react';
import type { DirectorySupplier, SupplierCategory, SurfaceType } from '../../types/majal';
import { fetchDirectorySuppliers, submitDirectorySupplier } from '../../lib/showcaseClient';
import { fetchPublicEcosystem } from '../../lib/ecosystemClient';
import { reportGateEvent } from '../../lib/audienceClient';
import { useDialogBehavior } from '../../hooks/useDialogBehavior';
import { SupplierArt } from './SupplierArt';
import { SUPPLIER_CATEGORIES, SUPPLIER_CATEGORY_KEYS, categoryFromText } from './sectors';

const fieldClass = 'w-full glass-input rounded-xl px-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300';
const waLink = (phone: string, name: string) => `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(`مرحبًا، وجدتكم في دليل موردي مجال (${name}) وأرغب بالاستفسار.`)}`;
const norm = (s: string) => s.toLowerCase().replace(/[ً-ٟ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');

const SupplierCard: React.FC<{ s: DirectorySupplier }> = ({ s }) => (
  <article className="glass-card rounded-3xl border border-white/10 overflow-hidden flex flex-col">
    <div className="relative">
      <SupplierArt category={s.category} seed={s.id} className="h-24" />
      <span className="absolute top-2.5 start-3 px-2.5 py-1 rounded-full bg-slate-950/75 border border-white/10 text-xs text-gold-300 font-black">{SUPPLIER_CATEGORIES[s.category]?.label}</span>
      {s.verified && <span className="absolute top-2.5 end-3 px-2.5 py-1 rounded-full bg-emerald-400 text-slate-950 text-xs font-black inline-flex items-center gap-1"><BadgeCheck className="w-3.5 h-3.5" aria-hidden="true" />موثّق في مجال</span>}
    </div>
    <div className="p-5 flex flex-col gap-3 flex-1">
      <div><h3 className="font-black leading-snug">{s.name}</h3><div className="mt-1 text-xs text-slate-400 inline-flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-gold-300" aria-hidden="true" />{s.region}</div></div>
      <p className="text-xs text-slate-300 leading-6 line-clamp-3">{s.description}</p>
      {s.products.length > 0 && <ul className="flex flex-wrap gap-1.5">{s.products.slice(0, 4).map(p => <li key={p} className="text-xs px-2 py-1 rounded-lg bg-white/5 border border-white/10">{p}</li>)}</ul>}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-300">
        {s.minOrder && <span className="inline-flex items-center gap-1.5"><Package className="w-3.5 h-3.5 text-gold-300" aria-hidden="true" />أقل طلب: {s.minOrder}</span>}
        <span className="inline-flex items-center gap-1.5"><Truck className="w-3.5 h-3.5 text-gold-300" aria-hidden="true" />{s.delivers ? 'يوصّل' : 'استلام'}</span>
      </div>
      <div className="mt-auto pt-1">
        {s.contactPhone ? (
          <div className="flex gap-2">
            <a href={waLink(s.contactPhone, s.name)} onClick={() => reportGateEvent('supplier_contact', s.id)} target="_blank" rel="noopener noreferrer" className="flex-1 py-2.5 rounded-xl bg-emerald-400 text-slate-950 text-xs font-black flex items-center justify-center gap-1.5"><MessageCircle className="w-4 h-4" aria-hidden="true" />واتساب</a>
            <a href={`tel:${s.contactPhone}`} onClick={() => reportGateEvent('supplier_contact', s.id)} aria-label={`اتصال بـ ${s.name}`} className="px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center"><Phone className="w-4 h-4" aria-hidden="true" /></a>
          </div>
        ) : <div className="text-xs text-slate-400 rounded-xl bg-white/[0.03] border border-white/10 px-3 py-2.5">{s.verified ? 'حساب موثّق ولم يعرض رقمه للعامة بعد.' : 'المورد لم يعرض رقمه للعامة.'}</div>}
      </div>
    </div>
  </article>
);

const SubmitForm: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const ref = useDialogBehavior<HTMLDivElement>(true, onClose);
  const [f, setF] = useState({ name: '', category: 'INGREDIENTS' as SupplierCategory, region: '', description: '', products: '', minOrder: '', delivers: true, contactName: '', phone: '', contactPublic: true, terms: false, website: '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState('');
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(p => ({ ...p, [k]: v }));
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const r = await submitDirectorySupplier({ name: f.name, category: f.category, region: f.region, description: f.description, contactName: f.contactName, contactPhone: f.phone, contactPublic: f.contactPublic, termsAccepted: f.terms, products: f.products.split(/[،,\n]/).map(x => x.trim()).filter(Boolean), minOrder: f.minOrder, delivers: f.delivers, website: f.website });
      setDone(r.message);
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذّر إرسال الطلب.'); } finally { setBusy(false); }
  };
  return createPortal(
    <div className="fixed inset-0 z-[85] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="sup-submit-title" className="w-full max-w-xl max-h-[90dvh] overflow-y-auto overscroll-contain glass-panel rounded-[28px] border border-white/10 p-6 relative">
        <button type="button" onClick={onClose} aria-label="إغلاق" className="absolute top-4 end-4 p-2 rounded-full text-slate-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"><X className="w-4 h-4" aria-hidden="true" /></button>
        <h3 id="sup-submit-title" className="text-xl font-black pe-10">سجّل مورّدك في الدليل</h3>
        {done ? (
          <div className="mt-6 space-y-4 text-center py-4"><BadgeCheck className="w-12 h-12 mx-auto text-emerald-300" aria-hidden="true" /><p role="status" className="text-sm text-slate-200 leading-7">{done}</p><button type="button" onClick={onClose} className="px-6 py-2.5 rounded-xl bg-gold-500 text-slate-950 text-sm font-black">تم</button></div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <p className="text-xs text-slate-300 leading-6">مجاني وبلا عمولة. تراجعه الإدارة ثم يظهر في الدليل.</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block text-xs font-black space-y-1.5"><span>اسم المورد / الشركة</span><input required maxLength={100} value={f.name} onChange={e => set('name', e.target.value)} className={fieldClass} /></label>
              <label className="block text-xs font-black space-y-1.5"><span>الفئة</span><select value={f.category} onChange={e => set('category', e.target.value as SupplierCategory)} className={fieldClass}>{SUPPLIER_CATEGORY_KEYS.map(k => <option key={k} value={k}>{SUPPLIER_CATEGORIES[k].label}</option>)}</select></label>
              <label className="block text-xs font-black space-y-1.5"><span>المنطقة</span><input required maxLength={80} value={f.region} onChange={e => set('region', e.target.value)} className={fieldClass} /></label>
              <label className="block text-xs font-black space-y-1.5"><span>أقل طلب — اختياري</span><input maxLength={80} value={f.minOrder} onChange={e => set('minOrder', e.target.value)} className={fieldClass} placeholder="٢٥ كغ" /></label>
            </div>
            <label className="block text-xs font-black space-y-1.5"><span>وصف مختصر</span><textarea required minLength={15} maxLength={600} rows={3} value={f.description} onChange={e => set('description', e.target.value)} className={fieldClass} /></label>
            <label className="block text-xs font-black space-y-1.5"><span>أبرز منتجاتك (افصل بفاصلة)</span><input value={f.products} onChange={e => set('products', e.target.value)} className={fieldClass} placeholder="علب، أكياس، أغطية" /></label>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block text-xs font-black space-y-1.5"><span>اسم المسؤول</span><input required maxLength={80} value={f.contactName} onChange={e => set('contactName', e.target.value)} className={fieldClass} /></label>
              <label className="block text-xs font-black space-y-1.5"><span>رقم التواصل (واتساب)</span><input required type="tel" maxLength={24} value={f.phone} onChange={e => set('phone', e.target.value)} className={fieldClass} dir="ltr" placeholder="+965 5xxx xxxx" /></label>
            </div>
            <label className="flex gap-2 items-center text-xs text-slate-200"><input type="checkbox" checked={f.delivers} onChange={e => set('delivers', e.target.checked)} />أوفّر التوصيل</label>
            <label className="flex gap-2 items-start text-xs text-slate-200 leading-6"><input type="checkbox" checked={f.contactPublic} onChange={e => set('contactPublic', e.target.checked)} className="mt-1.5" /><span>أوافق على عرض رقمي للعامة بعد الاعتماد (وإلا يبقى مخفيًا).</span></label>
            <label className="flex gap-2 items-start text-xs text-slate-200 leading-6"><input required type="checkbox" checked={f.terms} onChange={e => set('terms', e.target.checked)} className="mt-1.5" /><span>أقرّ بصحة بياناتي، وأن مراجعة مجال شكلية ولا تعني التوثيق أو ضمان الجودة.</span></label>
            <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={e => set('website', e.target.value)} className="hidden" name="website" />
            {error && <div role="alert" className="p-3 rounded-xl bg-rose-500/10 border border-rose-400/20 text-xs text-rose-200">{error}</div>}
            <button disabled={busy} className="w-full py-3 rounded-xl bg-gold-500 text-slate-950 text-sm font-black disabled:opacity-50">{busy ? 'جارٍ الإرسال…' : 'أرسل للمراجعة'}</button>
          </form>
        )}
      </div>
    </div>, document.body);
};

export const SupplierDirectory: React.FC<{ onSurfaceChange: (surface: SurfaceType) => void }> = ({ onSurfaceChange }) => {
  const [items, setItems] = useState<DirectorySupplier[]>([]);
  const [loading, setLoading] = useState(true), [form, setForm] = useState(false);
  const [category, setCategory] = useState<SupplierCategory | 'ALL'>('ALL'), [query, setQuery] = useState('');
  useEffect(() => {
    let live = true;
    // Free directory entries plus verified supplier accounts; one failing source never blanks the other.
    Promise.allSettled([fetchDirectorySuppliers(), fetchPublicEcosystem()]).then(([dir, eco]) => {
      if (!live) return;
      const free = dir.status === 'fulfilled' ? dir.value.suppliers : [];
      const verified: DirectorySupplier[] = eco.status === 'fulfilled'
        ? eco.value.suppliers.map(s => ({
          id: `ver_${s.id}`, name: s.commercialName, category: categoryFromText(s.category), region: s.region, description: s.description || s.category,
          products: eco.value.offerings.filter(o => o.supplierId === s.id).map(o => o.name).slice(0, 4), minOrder: '', delivers: false,
          contactPublic: false, status: 'APPROVED' as const, submittedAt: s.createdAt, verified: true
        }))
        : [];
      setItems([...verified, ...free]);
      setLoading(false);
    });
    return () => { live = false; };
  }, []);
  const present = useMemo(() => SUPPLIER_CATEGORY_KEYS.filter(k => items.some(i => i.category === k)), [items]);
  const shown = useMemo(() => {
    const q = norm(query.trim());
    return items.filter(i => (category === 'ALL' || i.category === category) && (!q || norm(`${i.name} ${i.region} ${i.description} ${i.products.join(' ')}`).includes(q)));
  }, [items, category, query]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-8 space-y-8">
      <section className="glass-panel rounded-[28px] p-6 sm:p-9 border border-white/10 relative overflow-hidden">
        <div className="majal-glow -top-[14rem] -start-[14rem] w-[36rem] h-[36rem]" style={{ '--glow': 'rgba(37,165,138,0.10)' } as React.CSSProperties} />
        <div className="relative z-10 grid lg:grid-cols-[1.2fr_1fr] gap-6 items-center">
          <div className="space-y-3">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass-card border border-emerald-400/25 text-emerald-300 text-xs font-black"><Gift className="w-4 h-4" aria-hidden="true" />مجاني بالكامل</span>
            <h1 className="text-3xl sm:text-4xl font-black leading-tight">دليل <span className="majal-wordmark">الموردين</span></h1>
            <p className="text-sm sm:text-base text-slate-300 leading-7 max-w-xl">تبحث عن مورد تغليف أو بهارات أو لحوم؟ ابحث هنا وتواصل مباشرة. ولو كنت مورّدًا، سجّل نفسك مجانًا.</p>
            <div className="flex flex-wrap gap-3 pt-1">
              <button type="button" onClick={() => setForm(true)} className="px-5 py-3 rounded-2xl bg-gold-500 hover:bg-gold-400 text-slate-950 font-black text-sm flex items-center gap-2"><Plus className="w-4 h-4" aria-hidden="true" />سجّل مورّدًا</button>
              <button type="button" onClick={() => onSurfaceChange('PUBLIC')} className="px-5 py-3 rounded-2xl glass-card border border-slate-700/60 text-slate-200 font-semibold text-sm flex items-center gap-2">ما هو مجال؟<ChevronLeft className="w-4 h-4" aria-hidden="true" /></button>
            </div>
          </div>
          <ul className="grid grid-cols-3 gap-3 text-center text-xs" aria-label="كيف يعمل الدليل">
            {[{ icon: Search, t: 'ابحث' }, { icon: MessageCircle, t: 'تواصل مباشرة' }, { icon: ShieldCheck, t: 'اعتماد قبل النشر' }].map(x => (
              <li key={x.t} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 space-y-2"><span className="mx-auto w-10 h-10 rounded-xl grid place-items-center bg-gold-500/10 border border-gold-300/20 text-gold-300"><x.icon className="w-5 h-5" aria-hidden="true" /></span><div className="font-black">{x.t}</div></li>
            ))}
          </ul>
        </div>
      </section>

      <section className="space-y-4" aria-label="الموردون">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative flex-1 min-w-[14rem]"><span className="sr-only">ابحث عن مورد</span><Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-4 pointer-events-none" aria-hidden="true" /><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="ابحث: علب، هيل، دجاج…" className={`${fieldClass} ps-11`} /></label>
        </div>
        {present.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="تصفية حسب الفئة">
            {(['ALL', ...present] as const).map(k => (
              <button key={k} type="button" aria-pressed={category === k} onClick={() => setCategory(k)} className={`px-3 py-1.5 rounded-full text-xs font-black border transition ${category === k ? 'bg-gold-500 text-slate-950 border-gold-300' : 'bg-white/5 text-slate-300 border-white/10 hover:border-gold-300/30'}`}>{k === 'ALL' ? 'الكل' : SUPPLIER_CATEGORIES[k].label}</button>
            ))}
          </div>
        )}
        {loading ? <div role="status" className="text-xs text-slate-300 py-6 inline-flex items-center gap-2"><Clock3 className="w-4 h-4" aria-hidden="true" />جارٍ تحميل الدليل…</div> : shown.length ? (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">{shown.map(s => <SupplierCard key={s.id} s={s} />)}</div>
        ) : (
          <div className="rounded-3xl border border-dashed border-white/15 p-10 text-center space-y-3"><Search className="w-8 h-8 mx-auto text-gold-300" aria-hidden="true" /><p className="text-sm text-slate-300">{items.length ? 'لا نتائج مطابقة. جرّب كلمة أخرى.' : 'الدليل فارغ بعد. كن أول من يسجّل.'}</p><button type="button" onClick={() => setForm(true)} className="px-5 py-2.5 rounded-xl bg-gold-500 text-slate-950 text-xs font-black">سجّل مورّدًا</button></div>
        )}
      </section>

      <p className="text-xs text-slate-400 leading-6 text-center max-w-2xl mx-auto">الدليل مجاني ليعرّف الناس بمنصة مجال. مراجعتنا شكلية: نتحقق من وضوح البيانات فقط، ولا نضمن جودة المورد أو أسعاره. علامة «موثّق في مجال» تعني حسابًا تحقّقت منه الإدارة بسجله التجاري.</p>
      {form && <SubmitForm onClose={() => setForm(false)} />}
    </div>
  );
};
