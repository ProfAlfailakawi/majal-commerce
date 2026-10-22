import React, { FormEvent, useEffect, useState } from 'react';
import { BadgeCheck, CalendarRange, Check, ClipboardCopy, ImagePlus, KeyRound, Megaphone, Truck, Pause, Play, Plus, RefreshCw, Store, Trash2, X } from 'lucide-react';
import { createCampaign, fetchShowcaseOverview, removeCampaignImage, reviewBusiness, editCampaign, reviewDirectorySupplier, rotateReportLink, setCampaignBilling, setCampaignStatus, setCampaignTargeting, uploadCampaignImage } from '../../lib/showcaseClient';
import { upcomingSeasons } from '../../lib/adSeasons';
import { AD_AUDIENCES, AD_AUDIENCE_LABEL, AD_TOPICS } from '../../lib/adAudience';
import type { AdCampaign, AdSlot, BusinessListing, DirectorySupplier } from '../../types/majal';
import { SECTORS, SUPPLIER_CATEGORIES } from '../showcase/sectors';
import { AD_ACCENT_DOT, AD_ACCENT_KEYS, AD_ICON_KEYS, AdIcon } from '../showcase/AdSlot';
import { useAutoRefresh } from '../../lib/autoRefresh';

const SLOTS: Record<AdSlot, string> = { SPONSOR: 'الراعي (حصري)', MARKET: 'السوق', PORTAL: 'بوابات الشركاء' };
const STATUS: Record<string, string> = { PENDING_REVIEW: 'معلّق', APPROVED: 'معتمد', PAUSED: 'موقوف', REJECTED: 'مرفوض', SOLD: 'تم البيع' };
const PHASE: Record<string, { label: string; cls: string }> = {
  pending: { label: 'بانتظار الاعتماد', cls: 'bg-amber-500/10 text-amber-300' }, scheduled: { label: 'مجدولة', cls: 'bg-sky-500/10 text-sky-300' },
  live: { label: 'تعمل الآن', cls: 'bg-emerald-500/10 text-emerald-300' }, ended: { label: 'انتهت', cls: 'bg-slate-500/20 text-slate-300' }, inactive: { label: 'متوقفة', cls: 'bg-white/10 text-slate-300' },
};

const pct = (c: number, i: number) => (i ? `${((c / i) * 100).toLocaleString('ar-KW-u-nu-latn', { maximumFractionDigits: 1 })}%` : '0%');
/** Results of a running A/B test with the verdict in words; applying a winner is a manual, explicit step. */
const VariantsPanel: React.FC<{ c: AdCampaign; busy: boolean; onApply: (headline: string, tagline: string) => void }> = ({ c, busy, onApply }) => {
  const v = c.variants;
  if (!v) return null;
  const rows = [{ k: 'أ', h: v.headlineA, t: v.taglineA, s: v.A, key: 'A' as const }, { k: 'ب', h: v.headlineB, t: v.taglineB, s: v.B, key: 'B' as const }];
  const verdict = v.verdict;
  return (
    <div className="rounded-xl border border-gold-300/20 bg-gold-500/[0.04] p-3 space-y-2" aria-label="نتيجة اختبار A/B">
      <div className="text-xs font-black text-gold-200">اختبار A/B</div>
      {rows.map(r => (
        <div key={r.key} className={`rounded-lg border px-2.5 py-2 text-xs space-y-0.5 ${verdict.state === 'winner' && verdict.winner === r.key ? 'border-emerald-400/40 bg-emerald-500/10' : 'border-white/10 bg-white/[0.03]'}`}>
          <div className="flex justify-between gap-2"><strong className="truncate">{r.k}: {r.h}</strong><span className="shrink-0 text-slate-300">{pct(r.s.clicks, r.s.impressions)}</span></div>
          <div className="text-slate-400">{r.s.impressions.toLocaleString('ar-KW-u-nu-latn')} ظهور · {r.s.clicks.toLocaleString('ar-KW-u-nu-latn')} نقرة</div>
        </div>
      ))}
      <p className="text-xs leading-5 text-slate-200">
        {verdict.state === 'not_enough_data' && `يلزم ${verdict.needed.toLocaleString('ar-KW-u-nu-latn')} ظهور لكل نسخة قبل الحكم.`}
        {verdict.state === 'no_difference' && 'لا فرق واضح بين النسختين حتى الآن.'}
        {verdict.state === 'winner' && `النسخة ${verdict.winner === 'A' ? 'أ' : 'ب'} تتفوق بنسبة ${verdict.liftPercent.toLocaleString('ar-KW-u-nu-latn')}% — توصية فقط.`}
      </p>
      {verdict.state === 'winner' && (
        <button type="button" disabled={busy} onClick={() => { const w = rows.find(r => r.key === verdict.winner)!; onApply(w.h, w.t); }} className="w-full py-2 rounded-lg bg-emerald-400 text-slate-950 text-xs font-black disabled:opacity-50">اعتمد النسخة الفائزة وأنهِ الاختبار</button>
      )}
    </div>
  );
};

const BILLING_LABEL = { UNSET: 'بانتظار السعر والدفع', PAID: 'مدفوعة', COMPLIMENTARY: 'ضيافة' } as const;

/** The commercial side: agreed price and payment (made outside the app). Approval needs this first. */
const BillingEditor: React.FC<{ c: AdCampaign; busy: boolean; onSave: (billing: 'UNSET' | 'PAID' | 'COMPLIMENTARY', price: number | null, note: string) => void }> = ({ c, busy, onSave }) => {
  const [billing, setBilling] = useState<'UNSET' | 'PAID' | 'COMPLIMENTARY'>(c.billing ?? 'UNSET');
  const [price, setPrice] = useState(c.priceKwd ? String(c.priceKwd) : ''), [note, setNote] = useState(c.billingNote ?? '');
  const k = 'w-full glass-input rounded-xl px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300';
  return (
    <details className="rounded-xl border border-white/10 bg-white/[0.02]" open={c.billing === 'UNSET' && c.status === 'PENDING_REVIEW'}>
      <summary className="cursor-pointer max-sm:min-h-11 px-3 py-2 text-xs font-black flex items-center justify-between gap-2"><span>السعر والدفع</span><span className={c.billing === 'PAID' ? 'text-emerald-300' : c.billing === 'COMPLIMENTARY' ? 'text-slate-300' : 'text-amber-300'}>{BILLING_LABEL[c.billing ?? 'UNSET']}{c.billing === 'PAID' && c.priceKwd ? ` · ${c.priceKwd.toLocaleString('ar-KW-u-nu-latn')} د.ك` : ''}</span></summary>
      <form className="p-3 space-y-2" onSubmit={e => { e.preventDefault(); onSave(billing, price ? Number(price) : null, note); }}>
        <select aria-label="حالة الدفع" value={billing} onChange={e => setBilling(e.target.value as typeof billing)} className={k}>{(Object.keys(BILLING_LABEL) as (keyof typeof BILLING_LABEL)[]).map(b => <option key={b} value={b}>{BILLING_LABEL[b]}</option>)}</select>
        {billing === 'PAID' && <input aria-label="المبلغ المدفوع بالدينار" inputMode="numeric" pattern="\d*" dir="ltr" placeholder="المبلغ (د.ك)" value={price} onChange={e => setPrice(e.target.value.replace(/\D/g, ''))} className={k} />}
        <input aria-label="ملاحظة الدفع" maxLength={300} placeholder="مرجع التحويل أو سبب الضيافة" value={note} onChange={e => setNote(e.target.value)} className={k} />
        <p className="text-[11px] text-slate-400 leading-5">الدفع يتم خارج التطبيق (تحويل أو فاتورة). لا تُعتمد الحملة قبل تسجيل الدفع أو الضيافة.</p>
        <button disabled={busy} className="w-full py-2 rounded-xl bg-gold-500 text-slate-950 text-xs font-black disabled:opacity-50">حفظ</button>
      </form>
    </details>
  );
};

/** Change what a campaign says or where it sits. A new link or slot on an approved campaign pauses it for review. */
const CampaignEditor: React.FC<{ c: AdCampaign; busy: boolean; onSave: (input: Parameters<typeof editCampaign>[1]) => void }> = ({ c, busy, onSave }) => {
  const [f, setF] = useState({ company: c.company, headline: c.headline, tagline: c.tagline, linkUrl: c.linkUrl, slot: c.slot as AdSlot, accent: c.accent as string, icon: c.icon, bHeadline: c.variants?.headlineB ?? '', bTagline: c.variants?.taglineB ?? '' });
  const k = 'w-full glass-input rounded-xl px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300';
  return (
    <details className="rounded-xl border border-white/10 bg-white/[0.02]">
      <summary className="cursor-pointer flex items-center max-sm:min-h-11 px-3 py-2 text-xs font-black">تعديل الحملة</summary>
      <form className="p-3 space-y-2" onSubmit={e => { e.preventDefault(); onSave({ ...f, tagline: f.tagline }); }}>
        <div className="grid sm:grid-cols-2 gap-2">
          <input aria-label="الشركة" required maxLength={80} value={f.company} onChange={e => setF({ ...f, company: e.target.value })} className={k} />
          <select aria-label="الموقع" value={f.slot} onChange={e => setF({ ...f, slot: e.target.value as AdSlot })} className={k}>{(Object.keys(SLOTS) as AdSlot[]).map(s => <option key={s} value={s}>{SLOTS[s]}</option>)}</select>
        </div>
        <input aria-label="العنوان" required minLength={4} maxLength={70} value={f.headline} onChange={e => setF({ ...f, headline: e.target.value })} className={k} />
        <input aria-label="السطر التوضيحي" maxLength={120} value={f.tagline} onChange={e => setF({ ...f, tagline: e.target.value })} className={k} />
        <div className="rounded-xl border border-dashed border-gold-300/25 p-2.5 space-y-2">
          <div className="text-[11px] font-black text-gold-200">اختبار A/B — نسخة ثانية من النص (اختياري)</div>
          <input aria-label="عنوان النسخة ب" maxLength={70} placeholder="عنوان النسخة (ب)" value={f.bHeadline} onChange={e => setF({ ...f, bHeadline: e.target.value })} className={k} />
          {f.bHeadline && <input aria-label="سطر النسخة ب" maxLength={120} placeholder="سطر توضيحي للنسخة (ب)" value={f.bTagline} onChange={e => setF({ ...f, bTagline: e.target.value })} className={k} />}
          <p className="text-[11px] text-slate-400 leading-5">يُعرض كل إعلان بإحدى النسختين عشوائيًا. تعديل أي نص يبدأ اختبارًا جديدًا. الحكم يحتاج 500 ظهور لكل نسخة، والنتيجة توصية فقط.</p>
        </div>
        <input aria-label="الرابط" required type="url" dir="ltr" value={f.linkUrl} onChange={e => setF({ ...f, linkUrl: e.target.value })} className={k} />
        <div className="flex flex-wrap items-center gap-2">{AD_ACCENT_KEYS.map(a => <button type="button" key={a} aria-label={`لون ${a}`} aria-pressed={f.accent === a} onClick={() => setF({ ...f, accent: a })} className={`w-6 h-6 rounded-full ${AD_ACCENT_DOT[a]} ${f.accent === a ? 'ring-2 ring-offset-2 ring-gold-300 ring-offset-transparent' : 'opacity-60'}`} />)}
          <span className="w-px h-5 bg-white/10" />{AD_ICON_KEYS.map(i => <button type="button" key={i} aria-label={`أيقونة ${i}`} aria-pressed={f.icon === i} onClick={() => setF({ ...f, icon: i })} className={`w-8 h-8 rounded-lg border grid place-items-center ${f.icon === i ? 'bg-gold-500/20 border-gold-300/60 text-gold-200' : 'bg-white/5 border-white/10 text-slate-300'}`}><AdIcon name={i} className="w-3.5 h-3.5" /></button>)}</div>
        {c.status === 'APPROVED' && <p className="text-[11px] text-amber-200/90 leading-5">تغيير الرابط أو الموقع يوقف الحملة لإعادة اعتمادها.</p>}
        <button disabled={busy} className="w-full py-2 rounded-xl bg-gold-500 text-slate-950 text-xs font-black disabled:opacity-50">حفظ التعديل</button>
      </form>
    </details>
  );
};

/** Toggle chips for "who sees it" (none selected = everyone) and "which category pages". */
const TargetChips: React.FC<{ audiences: string[]; topics: string[]; disabled?: boolean; onChange: (audiences: string[], topics: string[]) => void }> = ({ audiences, topics, disabled, onChange }) => {
  const flip = (list: string[], v: string) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);
  const chip = (on: boolean) => `px-2.5 py-1 rounded-full text-xs border transition disabled:opacity-50 ${on ? 'bg-gold-500 text-slate-950 border-gold-300 font-black' : 'bg-white/5 border-white/10 text-slate-300'}`;
  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="الجمهور"><span className="text-slate-400 me-1">يراه:</span>{audiences.length === 0 && <span className="text-emerald-300">الجميع</span>}
        {AD_AUDIENCES.map(a => <button type="button" key={a} disabled={disabled} aria-pressed={audiences.includes(a)} onClick={() => onChange(flip(audiences, a), topics)} className={chip(audiences.includes(a))}>{AD_AUDIENCE_LABEL[a]}</button>)}</div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="الاهتمام"><span className="text-slate-400 me-1">يتبع صفحات:</span>{topics.length === 0 && <span className="text-emerald-300">أي فئة</span>}
        {AD_TOPICS.map(t => <button type="button" key={t} disabled={disabled} aria-pressed={topics.includes(t)} onClick={() => onChange(audiences, flip(topics, t))} className={chip(topics.includes(t))}>{t}</button>)}</div>
    </div>
  );
};
/** Pending items always show; decided ones fold behind a toggle so the review queue stays short. */
function useFolded<T extends { status: string }>(rows: T[], keep = 3) {
  const [all, setAll] = useState(false);
  const pending = rows.filter(r => r.status === 'PENDING_REVIEW'), rest = rows.filter(r => r.status !== 'PENDING_REVIEW');
  const shown = all ? rows : [...pending, ...rest.slice(0, Math.max(0, keep - pending.length))];
  const hidden = rows.length - shown.length;
  const toggle = hidden > 0 || all
    ? <button type="button" onClick={() => setAll(v => !v)} className="w-full py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-black">{all ? 'إخفاء المعالَج' : `عرض الكل (${hidden.toLocaleString('ar-KW-u-nu-latn')} أخرى)`}</button>
    : null;
  return { shown, toggle };
}
const kuwaitDay = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
const field = 'w-full glass-input rounded-xl px-3 py-2.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300';

export const ShowcaseAdmin: React.FC = () => {
  const [listings, setListings] = useState<BusinessListing[]>([]);
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [suppliers, setSuppliers] = useState<DirectorySupplier[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(''), [notice, setNotice] = useState('');
  const [dates, setDates] = useState<Record<string, { s: string; e: string }>>({});
  const [draft, setDraft] = useState({ company: '', headline: '', tagline: '', linkUrl: 'https://', slot: 'MARKET' as AdSlot, startsOn: '', endsOn: '', audiences: [] as string[], topics: [] as string[] });
  const load = () => { setLoading(true); fetchShowcaseOverview().then(r => { setListings(r.listings); setCampaigns(r.campaigns); setSuppliers(r.suppliers ?? []); setError(''); }).catch(e => setError(e instanceof Error ? e.message : 'تعذّر التحميل.')).finally(() => setLoading(false)); };
  useEffect(load, []);
  // Campaign numbers refresh every minute without the loading flicker, so a form being edited keeps its state.
  useAutoRefresh(() => { fetchShowcaseOverview().then(r => { setListings(r.listings); setCampaigns(r.campaigns); setSuppliers(r.suppliers ?? []); }).catch(() => undefined); });
  const run = async (key: string, job: () => Promise<unknown>, ok = '') => {
    setBusy(key); setError(''); setNotice('');
    try { await job(); if (ok) setNotice(ok); load(); } catch (e) { setError(e instanceof Error ? e.message : 'تعذّر تنفيذ العملية.'); } finally { setBusy(''); }
  };
  const create = (e: FormEvent) => {
    e.preventDefault();
    void run('create', async () => {
      const r = await createCampaign({ company: draft.company, headline: draft.headline, tagline: draft.tagline, linkUrl: draft.linkUrl, slot: draft.slot, startsOn: draft.startsOn || null, endsOn: draft.endsOn || null, audiences: draft.audiences, topics: draft.topics });
      setNotice(`أُنشئت الحملة كمعلّقة. رابط تقرير الشركة (يظهر مرة واحدة): ${window.location.origin}/?ad-report=${r.reportToken}`);
      setDraft(d => ({ ...d, company: '', headline: '', tagline: '', linkUrl: 'https://' }));
    });
  };
  const seasons = upcomingSeasons(kuwaitDay());
  const weekly = (c: AdCampaign) => `ملخص أسبوع حملة «${c.headline}» (${c.company}) في مجال:\nظهور: ${(c.weekImpressions ?? 0).toLocaleString('ar-KW-u-nu-latn')}\nنقرات: ${(c.weekClicks ?? 0).toLocaleString('ar-KW-u-nu-latn')}\nالإجمالي: ظهور ${c.impressions.toLocaleString('ar-KW-u-nu-latn')} · نقرات ${c.clicks.toLocaleString('ar-KW-u-nu-latn')}${c.endsOn ? `\nتنتهي: ${c.endsOn}` : ''}`;
  const copy = async (text: string, ok: string) => { try { await navigator.clipboard.writeText(text); setNotice(ok); } catch { setNotice(text); } };
  const sup = useFolded(suppliers), lis = useFolded(listings), cam = useFolded(campaigns, 4);
  const pendingListings = listings.filter(l => l.status === 'PENDING_REVIEW').length, pendingAds = campaigns.filter(c => c.status === 'PENDING_REVIEW').length;

  return (
    <div className="space-y-6">
      <section className="glass-panel rounded-3xl p-5 border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3"><span className="w-11 h-11 rounded-2xl bg-gold-500/10 border border-gold-300/20 grid place-items-center"><Megaphone className="w-5 h-5 text-gold-300" aria-hidden="true" /></span><div><h2 className="font-black text-lg">المشاريع المعروضة والإعلانات</h2><p className="text-xs text-slate-400 mt-1">{pendingListings.toLocaleString('ar-KW-u-nu-latn')} مشروع و{pendingAds.toLocaleString('ar-KW-u-nu-latn')} حملة و{suppliers.filter(s => s.status === 'PENDING_REVIEW').length.toLocaleString('ar-KW-u-nu-latn')} مورد بانتظار القرار</p></div></div>
        <button type="button" onClick={load} className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-black flex items-center gap-2"><RefreshCw className="w-4 h-4" aria-hidden="true" />تحديث</button>
      </section>
      {error && <div role="alert" className="p-4 rounded-2xl bg-rose-500/10 border border-rose-400/20 text-xs text-rose-200">{error}</div>}
      {notice && <div role="status" className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-400/20 text-xs text-emerald-200 break-all">{notice}</div>}
      {loading ? <div className="text-center py-10 text-sm text-slate-400">جارٍ التحميل…</div> : (
        <>
        <section className="space-y-3" aria-labelledby="dir-admin-title">
          <div className="flex items-center gap-2"><Truck className="w-5 h-5 text-gold-300" aria-hidden="true" /><h3 id="dir-admin-title" className="font-black">دليل الموردين</h3></div>
          {suppliers.length ? <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{sup.shown.map(s => (
            <article key={s.id} className="glass-card rounded-2xl p-4 border border-white/10 space-y-2.5">
              <div className="flex justify-between gap-3"><div className="min-w-0"><div className="text-xs text-gold-300 font-black">{SUPPLIER_CATEGORIES[s.category]?.label} · {s.region}</div><h4 className="font-black mt-0.5 truncate">{s.name}</h4></div><span className={`text-xs px-2 py-1 rounded-full h-fit shrink-0 ${s.status === 'PENDING_REVIEW' ? 'bg-amber-500/10 text-amber-300' : 'bg-emerald-500/10 text-emerald-300'}`}>{STATUS[s.status]}</span></div>
              <p className="text-xs text-slate-400 leading-6 line-clamp-2">{s.description}</p>
              <div className="text-xs text-slate-400">{s.contactName} · <span dir="ltr">{s.contactPhone}</span> · {s.contactPublic ? 'الرقم يظهر' : 'الرقم مخفي'}</div>
              <div className="flex gap-2">
                {s.status !== 'APPROVED' && <button disabled={busy === s.id} onClick={() => run(s.id, () => reviewDirectorySupplier(s.id, 'APPROVED'))} className="flex-1 py-2 rounded-xl bg-emerald-400 text-slate-950 text-xs font-black disabled:opacity-40 flex items-center justify-center gap-1.5"><Check className="w-4 h-4" aria-hidden="true" />اعتماد ونشر</button>}
                <button disabled={busy === s.id} onClick={() => run(s.id, () => reviewDirectorySupplier(s.id, 'REJECTED', 'يحتاج تعديلًا قبل النشر.'))} className="px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-400/20 text-rose-300 text-xs font-black flex items-center gap-1"><X className="w-4 h-4" aria-hidden="true" />{s.status === 'APPROVED' ? 'إخفاء' : 'رفض'}</button>
              </div>
            </article>))}{sup.toggle && <div className="md:col-span-2 xl:col-span-3">{sup.toggle}</div>}</div>
            : <div className="rounded-2xl p-6 border border-dashed border-white/10 text-center text-xs text-slate-400">لا توجد طلبات موردين.</div>}
        </section>
        <div className="grid xl:grid-cols-2 gap-6">
          <section className="space-y-3">
            <div className="flex items-center gap-2"><Store className="w-5 h-5 text-gold-300" aria-hidden="true" /><h3 className="font-black">مشاريع للبيع</h3></div>
            {listings.length ? lis.shown.map(l => (
              <article key={l.id} className="glass-card rounded-2xl p-5 border border-white/10 space-y-3">
                <div className="flex justify-between gap-3"><div className="min-w-0"><div className="text-xs text-gold-300 font-black">{SECTORS[l.sector]?.label} · {l.city}</div><h4 className="font-black mt-1">{l.title}</h4></div><span className={`text-xs px-2 py-1 rounded-full h-fit shrink-0 whitespace-nowrap ${l.status === 'PENDING_REVIEW' ? 'bg-amber-500/10 text-amber-300' : 'bg-emerald-500/10 text-emerald-300'}`}>{STATUS[l.status]}</span></div>
                <p className="text-xs text-slate-400 leading-6 line-clamp-3">{l.summary}</p>
                <div className="text-xs text-slate-400">{l.sellerName} · <span dir="ltr">{l.contactPhone}</span> · {l.contactPublic ? 'الرقم يظهر للجمهور' : 'الرقم مخفي'}</div>
                <div className="flex gap-2">
                  {l.status !== 'APPROVED' && <button disabled={busy === l.id} onClick={() => run(l.id, () => reviewBusiness(l.id, 'APPROVED'))} className="flex-1 py-2.5 rounded-xl bg-emerald-400 text-slate-950 text-xs font-black disabled:opacity-40 flex items-center justify-center gap-1.5"><Check className="w-4 h-4" aria-hidden="true" />اعتماد ونشر</button>}
                  {l.status === 'APPROVED' && <button disabled={busy === l.id} onClick={() => run(l.id, () => reviewBusiness(l.id, 'SOLD'))} className="flex-1 py-2.5 rounded-xl bg-sky-500/10 border border-sky-400/20 text-sky-300 text-xs font-black">تم البيع</button>}
                  <button disabled={busy === l.id} onClick={() => run(l.id, () => reviewBusiness(l.id, 'REJECTED', 'الإعلان يحتاج تعديلًا قبل النشر.'))} className="px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-400/20 text-rose-300 text-xs font-black flex items-center gap-1"><X className="w-4 h-4" aria-hidden="true" />{l.status === 'APPROVED' ? 'إخفاء' : 'رفض'}</button>
                </div>
              </article>
            )) : <div className="rounded-2xl p-6 border border-dashed border-white/10 text-center text-xs text-slate-400"><BadgeCheck className="w-6 h-6 mx-auto text-gold-300 mb-2" aria-hidden="true" />لا توجد مشاريع.</div>}
          {lis.toggle}
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2"><Megaphone className="w-5 h-5 text-gold-300" aria-hidden="true" /><h3 className="font-black">حملات الشركات</h3></div>
            <form onSubmit={create} className="glass-card rounded-2xl p-4 border border-white/10 space-y-2">
              <div className="text-xs font-black flex items-center gap-1.5"><Plus className="w-4 h-4" aria-hidden="true" />حملة جديدة</div>
              <div className="grid sm:grid-cols-2 gap-2">
                <input required aria-label="اسم الشركة" placeholder="اسم الشركة" maxLength={80} value={draft.company} onChange={e => setDraft({ ...draft, company: e.target.value })} className={field} />
                <select aria-label="الموقع" value={draft.slot} onChange={e => setDraft({ ...draft, slot: e.target.value as AdSlot })} className={field}>{(Object.keys(SLOTS) as AdSlot[]).map(s => <option key={s} value={s}>{SLOTS[s]}</option>)}</select>
              </div>
              <input required aria-label="العنوان" placeholder="عنوان الإعلان" minLength={4} maxLength={70} value={draft.headline} onChange={e => setDraft({ ...draft, headline: e.target.value })} className={field} />
              <input aria-label="السطر التوضيحي" placeholder="سطر توضيحي (اختياري)" maxLength={120} value={draft.tagline} onChange={e => setDraft({ ...draft, tagline: e.target.value })} className={field} />
              <input required type="url" dir="ltr" aria-label="الرابط" value={draft.linkUrl} onChange={e => setDraft({ ...draft, linkUrl: e.target.value })} className={field} />
              <div className="flex flex-wrap items-center gap-1.5" aria-label="مواسم جاهزة"><CalendarRange className="w-4 h-4 text-gold-300" aria-hidden="true" />{seasons.map(s => <button type="button" key={s.key} onClick={() => setDraft(d => ({ ...d, startsOn: s.startsOn, endsOn: s.endsOn }))} title={`${s.startsOn} → ${s.endsOn}`} className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-xs hover:border-gold-300/40">{s.label}{s.active ? ' (جارٍ)' : ''}</button>)}</div>
              <div className="grid grid-cols-2 gap-2"><label className="text-xs text-slate-400 space-y-1"><span>من</span><input type="date" value={draft.startsOn} onChange={e => setDraft({ ...draft, startsOn: e.target.value })} className={field} /></label><label className="text-xs text-slate-400 space-y-1"><span>إلى</span><input type="date" value={draft.endsOn} onChange={e => setDraft({ ...draft, endsOn: e.target.value })} className={field} /></label></div>
              <TargetChips audiences={draft.audiences} topics={draft.topics} onChange={(audiences, topics) => setDraft(d => ({ ...d, audiences, topics }))} />
              <button disabled={busy === 'create'} className="w-full py-2.5 rounded-xl bg-gold-500 text-slate-950 text-xs font-black disabled:opacity-50">إنشاء</button>
            </form>
            {cam.shown.map(c => {
              const d = dates[c.id] ?? { s: c.startsOn ?? '', e: c.endsOn ?? '' };
              return (
                <article key={c.id} className="glass-card rounded-2xl p-5 border border-white/10 space-y-3">
                  <div className="flex justify-between gap-3"><div className="min-w-0"><div className="text-xs text-gold-300 font-black">{c.company} · {SLOTS[c.slot]}</div><h4 className="font-black mt-1">{c.headline}</h4></div><span className={`text-xs px-2 py-1 rounded-full h-fit shrink-0 whitespace-nowrap ${PHASE[c.phase ?? 'inactive'].cls}`}>{c.status === 'REJECTED' ? 'مرفوضة' : c.status === 'PAUSED' ? 'موقوفة' : PHASE[c.phase ?? 'inactive'].label}</span></div>
                  <div className="text-xs text-slate-400" dir="ltr">{c.linkUrl}</div>
                  {c.phase === 'live' && c.daysLeft !== null && c.daysLeft !== undefined && c.daysLeft <= 7 && <div className="text-xs text-amber-300 font-black">تنتهي {c.daysLeft === 0 ? 'اليوم' : `بعد ${c.daysLeft.toLocaleString('ar-KW-u-nu-latn')} أيام`} — تواصل للتجديد</div>}
                  {c.phase === 'ended' && <div className="text-xs text-slate-400">انتهت مدتها. عدّل التواريخ واعتمد من جديد للتجديد.</div>}
                  <div className="text-xs text-slate-300">ظهور {c.impressions.toLocaleString('ar-KW-u-nu-latn')} · نقرات {c.clicks.toLocaleString('ar-KW-u-nu-latn')}{c.contactPhone ? ` · ${c.contactPhone}` : ''}</div>
                  <VariantsPanel c={c} busy={busy === c.id} onApply={(headline, tagline) => void run(c.id, async () => { await editCampaign(c.id, { company: c.company, headline, tagline, linkUrl: c.linkUrl, slot: c.slot, accent: c.accent, icon: c.icon }); setNotice('طُبّقت النسخة الفائزة وانتهى الاختبار.'); })} />
                  <BillingEditor c={c} busy={busy === c.id} onSave={(billing, price, note) => void run(c.id, async () => { const r = await setCampaignBilling(c.id, billing, price, note); if (r.pausedForReview) setNotice('إلغاء حالة الدفع أوقف الحملة.'); })} />
                  <CampaignEditor c={c} busy={busy === c.id} onSave={input => void run(c.id, async () => { const r = await editCampaign(c.id, input); if (r.pausedForReview) setNotice('تغيير الرابط أو الموقع أوقف الحملة لإعادة اعتمادها.'); })} />
                  <TargetChips audiences={c.audiences ?? []} topics={c.topics ?? []} disabled={busy === c.id} onChange={(audiences, topics) => void run(c.id, async () => { const r = await setCampaignTargeting(c.id, audiences, topics); if (r.pausedForReview) setNotice('توسيع الجمهور أعاد الحملة إلى الإيقاف لإعادة الاعتماد.'); })} />
                  <div className="grid grid-cols-2 gap-2"><input type="date" aria-label="من" value={d.s} onChange={e => setDates({ ...dates, [c.id]: { ...d, s: e.target.value } })} className={field} /><input type="date" aria-label="إلى" value={d.e} onChange={e => setDates({ ...dates, [c.id]: { ...d, e: e.target.value } })} className={field} /></div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <label className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 font-black inline-flex items-center gap-1.5 cursor-pointer focus-within:ring-2 focus-within:ring-gold-300"><ImagePlus className="w-3.5 h-3.5" aria-hidden="true" />{c.hasImage ? 'استبدال الصورة' : 'رفع صورة'}<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy === c.id} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void run(c.id, () => uploadCampaignImage(c.id, f), 'رُفعت الصورة.'); }} /></label>
                    {c.hasImage && <button type="button" disabled={busy === c.id} onClick={() => run(c.id, () => removeCampaignImage(c.id))} className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 font-black inline-flex items-center gap-1.5"><Trash2 className="w-3.5 h-3.5" aria-hidden="true" />حذف الصورة</button>}
                    <button type="button" disabled={busy === c.id} onClick={() => copy(weekly(c), 'نُسخ ملخص الأسبوع.')} className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 font-black inline-flex items-center gap-1.5"><ClipboardCopy className="w-3.5 h-3.5" aria-hidden="true" />ملخص الأسبوع</button>
                    <button type="button" disabled={busy === c.id} onClick={() => { if (window.confirm('سيتوقف رابط التقرير الحالي. متابعة؟')) void run(c.id, async () => { const r = await rotateReportLink(c.id); setNotice(`رابط التقرير الجديد (يظهر مرة واحدة): ${window.location.origin}/?ad-report=${r.reportToken}`); }); }} className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 font-black inline-flex items-center gap-1.5"><KeyRound className="w-3.5 h-3.5" aria-hidden="true" />رابط تقرير جديد</button>
                  </div>
                  <div className="flex gap-2">
                    {c.status !== 'APPROVED' && <button disabled={busy === c.id || (c.billing ?? 'UNSET') === 'UNSET'} title={(c.billing ?? 'UNSET') === 'UNSET' ? 'سجّل السعر والدفع أولًا' : undefined} onClick={() => run(c.id, () => setCampaignStatus(c.id, 'APPROVED', { startsOn: d.s || null, endsOn: d.e || null }))} className="flex-1 py-2.5 rounded-xl bg-emerald-400 text-slate-950 text-xs font-black disabled:opacity-40 flex items-center justify-center gap-1.5"><Play className="w-4 h-4" aria-hidden="true" />اعتماد</button>}
                    {c.status === 'APPROVED' && <button disabled={busy === c.id} onClick={() => run(c.id, () => setCampaignStatus(c.id, 'PAUSED'))} className="flex-1 py-2.5 rounded-xl bg-amber-500/10 border border-amber-400/20 text-amber-300 text-xs font-black flex items-center justify-center gap-1.5"><Pause className="w-4 h-4" aria-hidden="true" />إيقاف</button>}
                    {c.status !== 'REJECTED' && <button disabled={busy === c.id} onClick={() => run(c.id, () => setCampaignStatus(c.id, 'REJECTED'))} className="px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-400/20 text-rose-300 text-xs font-black">رفض</button>}
                  </div>
                </article>
              );
            })}
          {cam.toggle}
          </section>
        </div>
        </>
      )}
    </div>
  );
};
