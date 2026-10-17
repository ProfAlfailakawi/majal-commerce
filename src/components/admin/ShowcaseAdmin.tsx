import React, { FormEvent, useEffect, useState } from 'react';
import { BadgeCheck, CalendarRange, Check, ClipboardCopy, ImagePlus, KeyRound, Megaphone, Truck, Pause, Play, Plus, RefreshCw, Store, Trash2, X } from 'lucide-react';
import { createCampaign, fetchShowcaseOverview, removeCampaignImage, reviewBusiness, reviewDirectorySupplier, rotateReportLink, setCampaignStatus, uploadCampaignImage } from '../../lib/showcaseClient';
import { upcomingSeasons } from '../../lib/adSeasons';
import type { AdCampaign, AdSlot, BusinessListing, DirectorySupplier } from '../../types/majal';
import { SECTORS, SUPPLIER_CATEGORIES } from '../showcase/sectors';

const SLOTS: Record<AdSlot, string> = { SPONSOR: 'الراعي (حصري)', MARKET: 'السوق', PORTAL: 'بوابات الشركاء' };
const STATUS: Record<string, string> = { PENDING_REVIEW: 'معلّق', APPROVED: 'معتمد', PAUSED: 'موقوف', REJECTED: 'مرفوض', SOLD: 'تم البيع' };
const kuwaitDay = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
const field = 'w-full glass-input rounded-xl px-3 py-2.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300';

export const ShowcaseAdmin: React.FC = () => {
  const [listings, setListings] = useState<BusinessListing[]>([]);
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [suppliers, setSuppliers] = useState<DirectorySupplier[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(''), [notice, setNotice] = useState('');
  const [dates, setDates] = useState<Record<string, { s: string; e: string }>>({});
  const [draft, setDraft] = useState({ company: '', headline: '', tagline: '', linkUrl: 'https://', slot: 'MARKET' as AdSlot, startsOn: '', endsOn: '' });
  const load = () => { setLoading(true); fetchShowcaseOverview().then(r => { setListings(r.listings); setCampaigns(r.campaigns); setSuppliers(r.suppliers ?? []); setError(''); }).catch(e => setError(e instanceof Error ? e.message : 'تعذّر التحميل.')).finally(() => setLoading(false)); };
  useEffect(load, []);
  const run = async (key: string, job: () => Promise<unknown>, ok = '') => {
    setBusy(key); setError(''); setNotice('');
    try { await job(); if (ok) setNotice(ok); load(); } catch (e) { setError(e instanceof Error ? e.message : 'تعذّر تنفيذ العملية.'); } finally { setBusy(''); }
  };
  const create = (e: FormEvent) => {
    e.preventDefault();
    void run('create', async () => {
      const r = await createCampaign({ company: draft.company, headline: draft.headline, tagline: draft.tagline, linkUrl: draft.linkUrl, slot: draft.slot, startsOn: draft.startsOn || null, endsOn: draft.endsOn || null });
      setNotice(`أُنشئت الحملة كمعلّقة. رابط تقرير الشركة (يظهر مرة واحدة): ${window.location.origin}/?ad-report=${r.reportToken}`);
      setDraft(d => ({ ...d, company: '', headline: '', tagline: '', linkUrl: 'https://' }));
    });
  };
  const seasons = upcomingSeasons(kuwaitDay());
  const weekly = (c: AdCampaign) => `ملخص أسبوع حملة «${c.headline}» (${c.company}) في مجال:\nظهور: ${(c.weekImpressions ?? 0).toLocaleString('ar-EG')}\nنقرات: ${(c.weekClicks ?? 0).toLocaleString('ar-EG')}\nالإجمالي: ظهور ${c.impressions.toLocaleString('ar-EG')} · نقرات ${c.clicks.toLocaleString('ar-EG')}${c.endsOn ? `\nتنتهي: ${c.endsOn}` : ''}`;
  const copy = async (text: string, ok: string) => { try { await navigator.clipboard.writeText(text); setNotice(ok); } catch { setNotice(text); } };
  const pendingListings = listings.filter(l => l.status === 'PENDING_REVIEW').length, pendingAds = campaigns.filter(c => c.status === 'PENDING_REVIEW').length;

  return (
    <div className="space-y-6">
      <section className="glass-panel rounded-3xl p-5 border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3"><span className="w-11 h-11 rounded-2xl bg-gold-500/10 border border-gold-300/20 grid place-items-center"><Megaphone className="w-5 h-5 text-gold-300" aria-hidden="true" /></span><div><h2 className="font-black text-lg">المشاريع المعروضة والإعلانات</h2><p className="text-xs text-slate-400 mt-1">{pendingListings} مشروع و{pendingAds} حملة و{suppliers.filter(s => s.status === 'PENDING_REVIEW').length} مورد بانتظار القرار</p></div></div>
        <button type="button" onClick={load} className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-black flex items-center gap-2"><RefreshCw className="w-4 h-4" aria-hidden="true" />تحديث</button>
      </section>
      {error && <div role="alert" className="p-4 rounded-2xl bg-rose-500/10 border border-rose-400/20 text-xs text-rose-200">{error}</div>}
      {notice && <div role="status" className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-400/20 text-xs text-emerald-200 break-all">{notice}</div>}
      {loading ? <div className="text-center py-10 text-sm text-slate-400">جارٍ التحميل…</div> : (
        <>
        <section className="space-y-3" aria-labelledby="dir-admin-title">
          <div className="flex items-center gap-2"><Truck className="w-5 h-5 text-gold-300" aria-hidden="true" /><h3 id="dir-admin-title" className="font-black">دليل الموردين</h3></div>
          {suppliers.length ? <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{suppliers.map(s => (
            <article key={s.id} className="glass-card rounded-2xl p-4 border border-white/10 space-y-2.5">
              <div className="flex justify-between gap-3"><div className="min-w-0"><div className="text-xs text-gold-300 font-black">{SUPPLIER_CATEGORIES[s.category]?.label} · {s.region}</div><h4 className="font-black mt-0.5 truncate">{s.name}</h4></div><span className={`text-xs px-2 py-1 rounded-full h-fit shrink-0 ${s.status === 'PENDING_REVIEW' ? 'bg-amber-500/10 text-amber-300' : 'bg-emerald-500/10 text-emerald-300'}`}>{STATUS[s.status]}</span></div>
              <p className="text-xs text-slate-400 leading-6 line-clamp-2">{s.description}</p>
              <div className="text-xs text-slate-400">{s.contactName} · <span dir="ltr">{s.contactPhone}</span> · {s.contactPublic ? 'الرقم يظهر' : 'الرقم مخفي'}</div>
              <div className="flex gap-2">
                {s.status !== 'APPROVED' && <button disabled={busy === s.id} onClick={() => run(s.id, () => reviewDirectorySupplier(s.id, 'APPROVED'))} className="flex-1 py-2 rounded-xl bg-emerald-400 text-slate-950 text-xs font-black disabled:opacity-40 flex items-center justify-center gap-1.5"><Check className="w-4 h-4" aria-hidden="true" />اعتماد ونشر</button>}
                <button disabled={busy === s.id} onClick={() => run(s.id, () => reviewDirectorySupplier(s.id, 'REJECTED', 'يحتاج تعديلًا قبل النشر.'))} className="px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-400/20 text-rose-300 text-xs font-black flex items-center gap-1"><X className="w-4 h-4" aria-hidden="true" />{s.status === 'APPROVED' ? 'إخفاء' : 'رفض'}</button>
              </div>
            </article>))}</div>
            : <div className="rounded-2xl p-6 border border-dashed border-white/10 text-center text-xs text-slate-400">لا توجد طلبات موردين.</div>}
        </section>
        <div className="grid xl:grid-cols-2 gap-6">
          <section className="space-y-3">
            <div className="flex items-center gap-2"><Store className="w-5 h-5 text-gold-300" aria-hidden="true" /><h3 className="font-black">مشاريع للبيع</h3></div>
            {listings.length ? listings.map(l => (
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
              <button disabled={busy === 'create'} className="w-full py-2.5 rounded-xl bg-gold-500 text-slate-950 text-xs font-black disabled:opacity-50">إنشاء</button>
            </form>
            {campaigns.map(c => {
              const d = dates[c.id] ?? { s: c.startsOn ?? '', e: c.endsOn ?? '' };
              return (
                <article key={c.id} className="glass-card rounded-2xl p-5 border border-white/10 space-y-3">
                  <div className="flex justify-between gap-3"><div className="min-w-0"><div className="text-xs text-gold-300 font-black">{c.company} · {SLOTS[c.slot]}</div><h4 className="font-black mt-1">{c.headline}</h4></div><span className={`text-xs px-2 py-1 rounded-full h-fit shrink-0 whitespace-nowrap ${c.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-300' : c.status === 'PENDING_REVIEW' ? 'bg-amber-500/10 text-amber-300' : 'bg-white/10 text-slate-300'}`}>{STATUS[c.status]}</span></div>
                  <div className="text-xs text-slate-400" dir="ltr">{c.linkUrl}</div>
                  <div className="text-xs text-slate-300">ظهور {c.impressions.toLocaleString('ar-EG')} · نقرات {c.clicks.toLocaleString('ar-EG')}{c.contactPhone ? ` · ${c.contactPhone}` : ''}</div>
                  <div className="grid grid-cols-2 gap-2"><input type="date" aria-label="من" value={d.s} onChange={e => setDates({ ...dates, [c.id]: { ...d, s: e.target.value } })} className={field} /><input type="date" aria-label="إلى" value={d.e} onChange={e => setDates({ ...dates, [c.id]: { ...d, e: e.target.value } })} className={field} /></div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <label className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 font-black inline-flex items-center gap-1.5 cursor-pointer focus-within:ring-2 focus-within:ring-gold-300"><ImagePlus className="w-3.5 h-3.5" aria-hidden="true" />{c.hasImage ? 'استبدال الصورة' : 'رفع صورة'}<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy === c.id} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void run(c.id, () => uploadCampaignImage(c.id, f), 'رُفعت الصورة.'); }} /></label>
                    {c.hasImage && <button type="button" disabled={busy === c.id} onClick={() => run(c.id, () => removeCampaignImage(c.id))} className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 font-black inline-flex items-center gap-1.5"><Trash2 className="w-3.5 h-3.5" aria-hidden="true" />حذف الصورة</button>}
                    <button type="button" disabled={busy === c.id} onClick={() => copy(weekly(c), 'نُسخ ملخص الأسبوع.')} className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 font-black inline-flex items-center gap-1.5"><ClipboardCopy className="w-3.5 h-3.5" aria-hidden="true" />ملخص الأسبوع</button>
                    <button type="button" disabled={busy === c.id} onClick={() => { if (window.confirm('سيتوقف رابط التقرير الحالي. متابعة؟')) void run(c.id, async () => { const r = await rotateReportLink(c.id); setNotice(`رابط التقرير الجديد (يظهر مرة واحدة): ${window.location.origin}/?ad-report=${r.reportToken}`); }); }} className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 font-black inline-flex items-center gap-1.5"><KeyRound className="w-3.5 h-3.5" aria-hidden="true" />رابط تقرير جديد</button>
                  </div>
                  <div className="flex gap-2">
                    {c.status !== 'APPROVED' && <button disabled={busy === c.id} onClick={() => run(c.id, () => setCampaignStatus(c.id, 'APPROVED', { startsOn: d.s || null, endsOn: d.e || null }))} className="flex-1 py-2.5 rounded-xl bg-emerald-400 text-slate-950 text-xs font-black disabled:opacity-40 flex items-center justify-center gap-1.5"><Play className="w-4 h-4" aria-hidden="true" />اعتماد</button>}
                    {c.status === 'APPROVED' && <button disabled={busy === c.id} onClick={() => run(c.id, () => setCampaignStatus(c.id, 'PAUSED'))} className="flex-1 py-2.5 rounded-xl bg-amber-500/10 border border-amber-400/20 text-amber-300 text-xs font-black flex items-center justify-center gap-1.5"><Pause className="w-4 h-4" aria-hidden="true" />إيقاف</button>}
                    {c.status !== 'REJECTED' && <button disabled={busy === c.id} onClick={() => run(c.id, () => setCampaignStatus(c.id, 'REJECTED'))} className="px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-400/20 text-rose-300 text-xs font-black">رفض</button>}
                  </div>
                </article>
              );
            })}
          </section>
        </div>
        </>
      )}
    </div>
  );
};
