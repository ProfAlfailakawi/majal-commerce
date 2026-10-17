import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { BadgeCheck, Banknote, CalendarClock, ChevronLeft, Eye, FileUp, Gift, Handshake, Info, Layers, Megaphone, MapPin, MessageCircle, Phone, ShieldCheck, Store, TrendingUp, X } from 'lucide-react';
import type { AdAccent, AdSlot, BusinessListing, BusinessSector, SurfaceType } from '../../types/majal';
import { AD_AUDIENCES, AD_AUDIENCE_LABEL, AD_TOPICS } from '../../lib/adAudience';
import { fetchBusinesses, requestAdSlot, submitBusiness } from '../../lib/showcaseClient';
import { reportGateEvent } from '../../lib/audienceClient';
import { arCount } from '../../lib/arPlural';
import { useDialogBehavior } from '../../hooks/useDialogBehavior';
import { SectorArt } from './SectorArt';
import { PrivateLinkNote } from './PrivateLinkNote';
import { SECTORS, SECTOR_KEYS } from './sectors';
import { AdSlot as AdSlotView, AdPreview, AdIcon, AD_ACCENT_DOT, AD_ACCENT_KEYS, AD_ICON_KEYS } from './AdSlot';

/** Asking prices are whole dinars; formatKwd's three decimals would read as fils. */
const formatKwd = (kwd: number) => `${kwd.toLocaleString('ar-EG')} د.ك`;
const forSale = { one: 'مشروع واحد', two: 'مشروعان', few: 'مشاريع', many: 'مشروعًا' };
const fieldClass = 'w-full glass-input rounded-xl px-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300';
const waLink = (phone: string, title: string) => `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(`مرحبًا، أنا مهتم بمشروعك المعروض في مجال: ${title}`)}`;

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; labelId: string }> = ({ title, onClose, children, labelId }) => {
  const ref = useDialogBehavior<HTMLDivElement>(true, onClose);
  return createPortal(
    <div className="fixed inset-0 z-[85] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={labelId} className="w-full max-w-xl max-h-[90dvh] overflow-y-auto overscroll-contain glass-panel rounded-[28px] border border-white/10 p-6 relative">
        <button type="button" onClick={onClose} aria-label="إغلاق" className="absolute top-4 end-4 p-2 rounded-full text-slate-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"><X className="w-4 h-4" aria-hidden="true" /></button>
        <h3 id={labelId} className="text-xl font-black pe-10">{title}</h3>
        {children}
      </div>
    </div>, document.body);
};

const Fact: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-slate-300">{icon}{label}</span>
);

const ListingCard: React.FC<{ item: BusinessListing; onOpen: () => void }> = ({ item, onOpen }) => (
  <article className="glass-card rounded-3xl border border-white/10 overflow-hidden flex flex-col hover:-translate-y-1 transition-transform">
    <div className="relative">
      <SectorArt sector={item.sector} seed={item.id} className="h-36" />
      <span className="absolute top-3 start-3 px-2.5 py-1 rounded-full bg-slate-950/75 border border-white/10 text-xs text-gold-300 font-black">{SECTORS[item.sector]?.label}</span>
      {item.askingPriceKwd !== null && <span className="absolute bottom-3 end-3 px-3 py-1 rounded-full bg-gold-500 text-slate-950 text-xs font-black">{formatKwd(item.askingPriceKwd)}</span>}
    </div>
    <div className="p-5 flex flex-col gap-3 flex-1">
      <h3 className="font-black leading-snug line-clamp-2">{item.title}</h3>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        <Fact icon={<MapPin className="w-3.5 h-3.5 text-gold-300" aria-hidden="true" />} label={item.city} />
        {item.yearsOperating !== null && <Fact icon={<CalendarClock className="w-3.5 h-3.5 text-gold-300" aria-hidden="true" />} label={item.yearsOperating === 0 ? 'جديد' : `${item.yearsOperating} سنوات`} />}
        {item.revenueBand && <Fact icon={<TrendingUp className="w-3.5 h-3.5 text-gold-300" aria-hidden="true" />} label={item.revenueBand} />}
      </div>
      {item.highlights.length > 0 && <ul className="flex flex-wrap gap-1.5">{item.highlights.slice(0, 3).map(h => <li key={h} className="text-xs px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-400/15 text-emerald-200">{h}</li>)}</ul>}
      <button type="button" onClick={onOpen} className="mt-auto w-full py-2.5 rounded-xl bg-gold-500/10 border border-gold-300/25 text-gold-300 text-xs font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">التفاصيل والتواصل</button>
    </div>
  </article>
);

const SubmitForm: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [f, setF] = useState({ title: '', sector: 'CAFE' as BusinessSector, city: '', summary: '', price: '', years: '', revenueBand: '', highlights: '', includes: '', reason: '', sellerName: '', phone: '', contactPublic: true, terms: false, website: '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState(''), [token, setToken] = useState('');
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(prev => ({ ...prev, [k]: v }));
  const split = (v: string) => v.split(/[،,\n]/).map(x => x.trim()).filter(Boolean);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const r = await submitBusiness({
        title: f.title, sector: f.sector, city: f.city, summary: f.summary, sellerName: f.sellerName, contactPhone: f.phone,
        contactPublic: f.contactPublic, termsAccepted: f.terms, highlights: split(f.highlights), includes: split(f.includes),
        askingPriceKwd: f.price ? Number(f.price) : null, yearsOperating: f.years ? Number(f.years) : null, revenueBand: f.revenueBand, reason: f.reason, website: f.website,
      });
      setDone(r.message); setToken(r.reportToken ?? '');
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذّر إرسال الطلب.'); } finally { setBusy(false); }
  };
  return (
    <Modal title="اعرض مشروعك للبيع" onClose={onClose} labelId="biz-submit-title">
      {done ? (
        <div className="mt-6 space-y-4 text-center py-4">
          <BadgeCheck className="w-12 h-12 mx-auto text-emerald-300" aria-hidden="true" />
          <p role="status" className="text-sm text-slate-200 leading-7">{done}</p>
          {token && <PrivateLinkNote token={token} />}
          <button type="button" onClick={onClose} className="px-6 py-2.5 rounded-xl bg-gold-500 text-slate-950 text-sm font-black">تم</button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <p className="text-xs text-slate-300 leading-6">مجانًا وبلا عمولة. نراجع الطلب ثم يظهر للجمهور.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block text-xs font-black space-y-1.5"><span>عنوان الإعلان</span><input required minLength={3} maxLength={120} value={f.title} onChange={e => set('title', e.target.value)} className={fieldClass} placeholder="مقهى جاهز للتشغيل في حولي" /></label>
            <label className="block text-xs font-black space-y-1.5"><span>نوع النشاط</span><select value={f.sector} onChange={e => set('sector', e.target.value as BusinessSector)} className={fieldClass}>{SECTOR_KEYS.map(k => <option key={k} value={k}>{SECTORS[k].label}</option>)}</select></label>
            <label className="block text-xs font-black space-y-1.5"><span>المدينة / المنطقة</span><input required maxLength={80} value={f.city} onChange={e => set('city', e.target.value)} className={fieldClass} /></label>
            <label className="block text-xs font-black space-y-1.5"><span>السعر المطلوب (د.ك) — اختياري</span><input inputMode="numeric" pattern="\d*" value={f.price} onChange={e => set('price', e.target.value.replace(/\D/g, ''))} className={fieldClass} dir="ltr" /></label>
            <label className="block text-xs font-black space-y-1.5"><span>سنوات التشغيل — اختياري</span><input inputMode="numeric" pattern="\d*" value={f.years} onChange={e => set('years', e.target.value.replace(/\D/g, ''))} className={fieldClass} dir="ltr" /></label>
            <label className="block text-xs font-black space-y-1.5"><span>الدخل الشهري التقريبي — اختياري</span><input maxLength={60} value={f.revenueBand} onChange={e => set('revenueBand', e.target.value)} className={fieldClass} placeholder="٣–٤ آلاف د.ك" /></label>
          </div>
          <label className="block text-xs font-black space-y-1.5"><span>وصف مختصر</span><textarea required minLength={20} maxLength={1200} rows={3} value={f.summary} onChange={e => set('summary', e.target.value)} className={fieldClass} /></label>
          <label className="block text-xs font-black space-y-1.5"><span>أبرز المميزات (افصل بفاصلة)</span><input value={f.highlights} onChange={e => set('highlights', e.target.value)} className={fieldClass} placeholder="زبائن ثابتون، عقد ساري" /></label>
          <label className="block text-xs font-black space-y-1.5"><span>ما يشمله البيع (افصل بفاصلة)</span><input value={f.includes} onChange={e => set('includes', e.target.value)} className={fieldClass} placeholder="معدات، علامة تجارية، حسابات" /></label>
          <label className="block text-xs font-black space-y-1.5"><span>سبب البيع — اختياري</span><input maxLength={300} value={f.reason} onChange={e => set('reason', e.target.value)} className={fieldClass} /></label>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block text-xs font-black space-y-1.5"><span>اسمك</span><input required maxLength={80} value={f.sellerName} onChange={e => set('sellerName', e.target.value)} className={fieldClass} /></label>
            <label className="block text-xs font-black space-y-1.5"><span>رقم التواصل (واتساب)</span><input required type="tel" inputMode="tel" maxLength={24} value={f.phone} onChange={e => set('phone', e.target.value)} className={fieldClass} dir="ltr" placeholder="+965 5xxx xxxx" /></label>
          </div>
          <label className="flex gap-2 items-start text-xs text-slate-200 leading-6"><input type="checkbox" checked={f.contactPublic} onChange={e => set('contactPublic', e.target.checked)} className="mt-1.5" /><span>أوافق على عرض رقمي للمهتمين بعد اعتماد الإعلان (وإلا يبقى مخفيًا وتتواصل الإدارة معك).</span></label>
          <label className="flex gap-2 items-start text-xs text-slate-200 leading-6"><input required type="checkbox" checked={f.terms} onChange={e => set('terms', e.target.checked)} className="mt-1.5" /><span>أقرّ بأن بياناتي صحيحة، وأفهم أن مراجعة مجال شكلية ولا تتحقق من الأرقام ولا تضمن الصفقة.</span></label>
          <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={e => set('website', e.target.value)} className="hidden" name="website" />
          {error && <div role="alert" className="p-3 rounded-xl bg-rose-500/10 border border-rose-400/20 text-xs text-rose-200">{error}</div>}
          <button disabled={busy} className="w-full py-3 rounded-xl bg-gold-500 text-slate-950 text-sm font-black disabled:opacity-50">{busy ? 'جارٍ الإرسال…' : 'أرسل للمراجعة'}</button>
        </form>
      )}
    </Modal>
  );
};

const SLOT_CHOICES: { key: AdSlot; label: string; hint: string }[] = [
  { key: 'MARKET', label: 'السوق', hint: 'بين إطلاقات السوق وفرص العمل' },
  { key: 'PORTAL', label: 'بوابات الشركاء', hint: 'داخل بوابات المبدعين والمنشآت والموردين' },
  { key: 'SPONSOR', label: 'شريط الراعي', hint: 'شريط ثابت أعلى الصفحات (حصري)' },
];

export const AdRequestForm: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [f, setF] = useState({ company: '', headline: '', tagline: '', linkUrl: 'https://', phone: '', website: '', slot: 'MARKET' as AdSlot, accent: 'gold' as AdAccent, icon: 'megaphone', audiences: [] as string[], topics: [] as string[] });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState<{ message: string; token: string } | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(prev => ({ ...prev, [k]: v }));
  const flip = (list: string[], v: string) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);
  const chip = (on: boolean) => `px-2.5 py-1 rounded-full text-xs border transition ${on ? 'bg-gold-500 text-slate-950 border-gold-300 font-black' : 'bg-white/5 border-white/10 text-slate-300'}`;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const r = await requestAdSlot({ company: f.company, headline: f.headline, tagline: f.tagline, linkUrl: f.linkUrl, contactPhone: f.phone, website: f.website, slot: f.slot, accent: f.accent, icon: f.icon, audiences: f.audiences, topics: f.topics });
      setDone({ message: r.message, token: r.reportToken });
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذّر إرسال الطلب.'); } finally { setBusy(false); }
  };
  const reportUrl = done ? `${window.location.origin}/?ad-report=${done.token}` : '';
  return (
    <Modal title="اطلب مساحة إعلانية" onClose={onClose} labelId="ad-request-title">
      {done ? (
        <div className="mt-5 space-y-4">
          <p role="status" className="text-sm text-slate-200 leading-7">{done.message}</p>
          <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3 text-xs space-y-1"><div className="font-black text-gold-300">رابط تقرير حملتك (يُعرض مرة واحدة)</div><div dir="ltr" className="break-all text-slate-200 select-all">{reportUrl}</div></div>
          <button type="button" onClick={onClose} className="px-6 py-2.5 rounded-xl bg-gold-500 text-slate-950 text-sm font-black">تم</button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <p className="text-xs text-slate-300 leading-6">الإعلان خدمة مدفوعة: نتواصل معك على رقمك لنتفق على الموقع والمدة والسعر، ثم يُعتمد وينشر بعد الاتفاق. كل إعلان يحمل وسم «إعلان»، ولا يظهر شيء قبل اعتماد الإدارة.</p>
          <AdPreview ad={{ company: f.company, headline: f.headline, tagline: f.tagline, accent: f.accent, icon: f.icon }} />
          <label className="block text-xs font-black space-y-1.5"><span>اسم الشركة</span><input required maxLength={80} value={f.company} onChange={e => set('company', e.target.value)} className={fieldClass} /></label>
          <label className="block text-xs font-black space-y-1.5"><span>عنوان الإعلان ({(70 - f.headline.length).toLocaleString('ar-EG')} حرفًا متبقيًا)</span><input required minLength={4} maxLength={70} value={f.headline} onChange={e => set('headline', e.target.value)} className={fieldClass} /></label>
          <label className="block text-xs font-black space-y-1.5"><span>سطر توضيحي — اختياري</span><input maxLength={120} value={f.tagline} onChange={e => set('tagline', e.target.value)} className={fieldClass} /></label>
          <label className="block text-xs font-black space-y-1.5"><span>رابط الوجهة (https)</span><input required type="url" value={f.linkUrl} onChange={e => set('linkUrl', e.target.value)} className={fieldClass} dir="ltr" /></label>
          <label className="block text-xs font-black space-y-1.5"><span>رقم التواصل</span><input required type="tel" maxLength={24} value={f.phone} onChange={e => set('phone', e.target.value)} className={fieldClass} dir="ltr" /></label>
          <fieldset className="space-y-1.5"><legend className="text-xs font-black">أين تفضّل أن يظهر؟ (الإدارة تقرر)</legend>
            <div className="grid gap-2">{SLOT_CHOICES.map(c => <label key={c.key} className={`flex gap-2 items-start rounded-xl border p-2.5 text-xs cursor-pointer ${f.slot === c.key ? 'border-gold-300/50 bg-gold-500/10' : 'border-white/10 bg-white/[0.03]'}`}><input type="radio" name="slot" checked={f.slot === c.key} onChange={() => set('slot', c.key)} className="mt-1" /><span><strong className="block">{c.label}</strong><span className="text-slate-400">{c.hint}</span></span></label>)}</div>
          </fieldset>
          <fieldset className="space-y-1.5"><legend className="text-xs font-black">من تريد أن يراه؟ (اتركه فارغًا للجميع)</legend>
            <div className="flex flex-wrap gap-1.5">{AD_AUDIENCES.map(a => <button type="button" key={a} aria-pressed={f.audiences.includes(a)} onClick={() => set('audiences', flip(f.audiences, a))} className={chip(f.audiences.includes(a))}>{AD_AUDIENCE_LABEL[a]}</button>)}</div>
          </fieldset>
          <fieldset className="space-y-1.5"><legend className="text-xs font-black">ويتبع أي فئة منتجات؟ (اختياري)</legend>
            <div className="flex flex-wrap gap-1.5">{AD_TOPICS.map(t => <button type="button" key={t} aria-pressed={f.topics.includes(t)} onClick={() => set('topics', flip(f.topics, t))} className={chip(f.topics.includes(t))}>{t}</button>)}</div>
          </fieldset>
          <fieldset className="space-y-1.5"><legend className="text-xs font-black">اللون والأيقونة</legend>
            <div className="flex flex-wrap items-center gap-2">{AD_ACCENT_KEYS.map(a => <button type="button" key={a} aria-label={`لون ${a}`} aria-pressed={f.accent === a} onClick={() => set('accent', a)} className={`w-7 h-7 rounded-full ${AD_ACCENT_DOT[a]} ${f.accent === a ? 'ring-2 ring-offset-2 ring-gold-300 ring-offset-transparent' : 'opacity-70'}`} />)}</div>
            <div className="flex flex-wrap gap-1.5">{AD_ICON_KEYS.map(i => <button type="button" key={i} aria-label={`أيقونة ${i}`} aria-pressed={f.icon === i} onClick={() => set('icon', i)} className={`w-9 h-9 rounded-xl border grid place-items-center ${f.icon === i ? 'bg-gold-500/20 border-gold-300/60 text-gold-200' : 'bg-white/5 border-white/10 text-slate-300'}`}><AdIcon name={i} className="w-4 h-4" /></button>)}</div>
          </fieldset>
          <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={e => set('website', e.target.value)} className="hidden" name="website" />
          {error && <div role="alert" className="p-3 rounded-xl bg-rose-500/10 border border-rose-400/20 text-xs text-rose-200">{error}</div>}
          <button disabled={busy} className="w-full py-3 rounded-xl bg-gold-500 text-slate-950 text-sm font-black disabled:opacity-50">{busy ? 'جارٍ الإرسال…' : 'أرسل الطلب'}</button>
        </form>
      )}
    </Modal>
  );
};

const STEPS = [
  { icon: FileUp, title: 'ارفع طلبك', sub: 'بياناتك ورقم تواصلك' },
  { icon: ShieldCheck, title: 'نراجعه ونعتمده', sub: 'مراجعة شكلية سريعة' },
  { icon: Eye, title: 'يراه المهتمون', sub: 'بطاقة جميلة وتواصل مباشر' },
];

export const BusinessShowcase: React.FC<{ onSurfaceChange: (surface: SurfaceType) => void }> = ({ onSurfaceChange }) => {
  const [listings, setListings] = useState<BusinessListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [sector, setSector] = useState<BusinessSector | 'ALL'>('ALL');
  const [open, setOpen] = useState<BusinessListing | null>(null);
  const [form, setForm] = useState<'sell' | 'ad' | null>(null);
  useEffect(() => { fetchBusinesses().then(r => setListings(r.listings)).catch(() => setListings([])).finally(() => setLoading(false)); }, []);
  const present = useMemo(() => SECTOR_KEYS.filter(k => listings.some(l => l.sector === k)), [listings]);
  const shown = sector === 'ALL' ? listings : listings.filter(l => l.sector === sector);
  const closeDetail = () => setOpen(null);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-8 space-y-10">
      <section className="glass-panel majal-grain rounded-[28px] p-6 sm:p-10 border border-white/10 relative overflow-hidden">
        <div className="majal-glow -top-[16rem] -end-[16rem] w-[40rem] h-[40rem]" style={{ '--glow': 'rgba(199,165,91,0.10)' } as React.CSSProperties} />
        <div className="relative z-10 grid lg:grid-cols-[1.1fr_1fr] gap-8 items-center">
          <div className="space-y-4">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass-card border border-emerald-400/25 text-emerald-300 text-xs font-black"><Gift className="w-4 h-4" aria-hidden="true" />مجانية بالكامل وبلا عمولة</span>
            <h1 className="text-3xl sm:text-4xl font-black leading-tight">عندك مشروع <span className="majal-wordmark">تبي تبيعه؟</span></h1>
            <p className="text-sm sm:text-base text-slate-300 leading-7 max-w-xl">اعرضه أمام جمهور مجال في بطاقة واضحة. نراجع الطلب ثم ينشر. نقدّم الخدمة مجانًا لأنها تعرّف الناس بمنصتنا — وهذا هو سببنا الصريح.</p>
            <div className="flex flex-wrap gap-3 pt-1">
              <button type="button" onClick={() => setForm('sell')} className="px-6 py-3.5 rounded-2xl bg-gold-500 hover:bg-gold-400 text-slate-950 font-black text-sm shadow-sm flex items-center gap-2"><Store className="w-4 h-4" aria-hidden="true" />اعرض مشروعك للبيع</button>
              <button type="button" onClick={() => onSurfaceChange('PUBLIC')} className="px-6 py-3.5 rounded-2xl glass-card border border-slate-700/60 text-slate-200 font-semibold text-sm flex items-center gap-2">تعرّف على مجال<ChevronLeft className="w-4 h-4" aria-hidden="true" /></button>
            </div>
          </div>
          <ol className="grid grid-cols-3 gap-2 sm:gap-4 relative" aria-label="خطوات العرض">
            <span aria-hidden="true" className="absolute top-8 inset-x-[16%] border-t-2 border-dashed border-gold-300/30" />
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative text-center space-y-2">
                <span className="mx-auto w-16 h-16 rounded-3xl grid place-items-center bg-gold-500/10 border border-gold-300/25 text-gold-300 relative"><s.icon className="w-7 h-7" aria-hidden="true" /><span className="absolute -top-2 -end-2 w-6 h-6 rounded-full bg-gold-500 text-slate-950 text-xs font-black grid place-items-center">{i + 1}</span></span>
                <div className="text-xs sm:text-sm font-black leading-5">{s.title}</div>
                <div className="text-xs text-slate-400 leading-5">{s.sub}</div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <AdSlotView slot="MARKET" />

      <section className="space-y-5" aria-labelledby="biz-list-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 id="biz-list-title" className="text-xl font-black">مشاريع معروضة للبيع</h2><p className="text-xs text-slate-400 mt-1">كل بطاقة اعتُمدت من الإدارة قبل ظهورها{listings.length ? ` · ${arCount(listings.length, forSale)}` : ''}</p></div>
          {present.length > 1 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="تصفية حسب النشاط">
              {(['ALL', ...present] as const).map(k => (
                <button key={k} type="button" aria-pressed={sector === k} onClick={() => setSector(k)} className={`px-3 py-1.5 rounded-full text-xs font-black border transition ${sector === k ? 'bg-gold-500 text-slate-950 border-gold-300' : 'bg-white/5 text-slate-300 border-white/10 hover:border-gold-300/30'}`}>{k === 'ALL' ? 'الكل' : SECTORS[k].label}</button>
              ))}
            </div>
          )}
        </div>
        {loading ? <div role="status" className="text-xs text-slate-300 py-6">جارٍ تحميل المشاريع…</div> : shown.length ? (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">{shown.map(item => <ListingCard key={item.id} item={item} onOpen={() => { reportGateEvent('listing_open', item.id); setOpen(item); }} />)}</div>
        ) : (
          <div className="rounded-3xl border border-dashed border-white/15 p-10 text-center space-y-3"><Layers className="w-8 h-8 mx-auto text-gold-300" aria-hidden="true" /><p className="text-sm text-slate-300">لا توجد مشاريع معروضة الآن. كن أول من يعرض مشروعه.</p><button type="button" onClick={() => setForm('sell')} className="px-5 py-2.5 rounded-xl bg-gold-500 text-slate-950 text-xs font-black">اعرض مشروعك</button></div>
        )}
      </section>

      <section className="grid md:grid-cols-3 gap-4" aria-label="لماذا هذه البوابة">
        {[
          { icon: Gift, title: 'مجانية وصريحة', body: 'لا رسوم ولا عمولة. هدفنا أن تتعرّف على منصتنا.' },
          { icon: Handshake, title: 'تواصل مباشر', body: 'يتواصل المهتم مع البائع بنفسه. لا نتوسط في الصفقة.' },
          { icon: Info, title: 'مراجعة شكلية', body: 'نراجع الوضوح والسلامة، ولا نتحقق من الأرقام ولا نضمن البيع.' },
        ].map(c => (
          <div key={c.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 flex gap-3"><span className="w-10 h-10 shrink-0 rounded-xl grid place-items-center bg-gold-500/10 border border-gold-300/20 text-gold-300"><c.icon className="w-5 h-5" aria-hidden="true" /></span><div><h3 className="font-black text-sm">{c.title}</h3><p className="text-xs text-slate-300 leading-6 mt-1">{c.body}</p></div></div>
        ))}
      </section>

      <section className="rounded-3xl border border-gold-300/20 bg-gold-500/[0.05] p-6 sm:p-8 grid md:grid-cols-[1fr_auto] gap-5 items-center">
        <div className="space-y-2"><h2 className="text-lg font-black flex items-center gap-2"><Store className="w-5 h-5 text-gold-300" aria-hidden="true" />جرّب مجال بكامل تفاصيله</h2><p className="text-xs sm:text-sm text-slate-300 leading-7">مبدعون ومنشآت وموردون وسوق في مكان واحد. ادخل واستكشف كيف نحوّل الوصفة إلى منتج تجاري.</p></div>
        <div className="flex flex-wrap gap-3"><button type="button" onClick={() => onSurfaceChange('CONSUMER')} className="px-5 py-3 rounded-xl bg-gold-500 text-slate-950 text-sm font-black">استكشف السوق</button><button type="button" onClick={() => onSurfaceChange('PUBLIC')} className="px-5 py-3 rounded-xl glass-card border border-slate-700/60 text-sm font-semibold">عن مجال</button></div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
        <div className="flex items-center gap-3"><Megaphone className="w-5 h-5 text-gold-300" aria-hidden="true" /><p className="text-xs text-slate-300 leading-6">هل تمثل شركة؟ اعرض دعايتك أمام مبدعين ومنشآت وزبائن مجال، بوسم «إعلان» واضح وتقرير بأرقامك. الأسعار نتفق عليها معك.</p></div>
        <button type="button" onClick={() => setForm('ad')} className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-black">اطلب مساحة إعلانية</button>
      </section>

      {open && (
        <Modal title={open.title} onClose={closeDetail} labelId="biz-detail-title">
          <SectorArt sector={open.sector} seed={open.id} className="h-32 rounded-2xl mt-4" />
          <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4">
            <Fact icon={<Store className="w-3.5 h-3.5 text-gold-300" aria-hidden="true" />} label={SECTORS[open.sector]?.label} />
            <Fact icon={<MapPin className="w-3.5 h-3.5 text-gold-300" aria-hidden="true" />} label={open.city} />
            {open.askingPriceKwd !== null && <Fact icon={<Banknote className="w-3.5 h-3.5 text-gold-300" aria-hidden="true" />} label={formatKwd(open.askingPriceKwd)} />}
            {open.revenueBand && <Fact icon={<TrendingUp className="w-3.5 h-3.5 text-gold-300" aria-hidden="true" />} label={open.revenueBand} />}
            {open.yearsOperating !== null && <Fact icon={<CalendarClock className="w-3.5 h-3.5 text-gold-300" aria-hidden="true" />} label={`${open.yearsOperating} سنوات تشغيل`} />}
          </div>
          <p className="text-sm text-slate-200 leading-7 mt-4">{open.summary}</p>
          {open.includes.length > 0 && <div className="mt-4"><h4 className="text-xs font-black mb-2">يشمله البيع</h4><ul className="flex flex-wrap gap-1.5">{open.includes.map(x => <li key={x} className="text-xs px-2.5 py-1 rounded-lg bg-white/5 border border-white/10">{x}</li>)}</ul></div>}
          {open.reason && <p className="text-xs text-slate-300 mt-4">سبب البيع: {open.reason}</p>}
          <div className="mt-5 space-y-3">
            {open.contactPhone ? (
              <div className="flex flex-wrap gap-2">
                <a href={waLink(open.contactPhone, open.title)} onClick={() => reportGateEvent('listing_contact', open.id)} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-[10rem] py-3 rounded-xl bg-emerald-400 text-slate-950 text-sm font-black flex items-center justify-center gap-2"><MessageCircle className="w-4 h-4" aria-hidden="true" />واتساب</a>
                <a href={`tel:${open.contactPhone}`} onClick={() => reportGateEvent('listing_contact', open.id)} dir="ltr" className="flex-1 min-w-[10rem] py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-black flex items-center justify-center gap-2"><Phone className="w-4 h-4" aria-hidden="true" />{open.contactPhone}</a>
              </div>
            ) : <p className="text-xs text-amber-200 bg-amber-500/10 border border-amber-400/20 rounded-xl p-3 leading-6">اختار البائع إخفاء رقمه. لا يظهر للجمهور.</p>}
            <p className="text-xs text-slate-400 leading-6">اعتماد الإعلان لا يعني التحقق من البيانات. تحقّق بنفسك قبل أي دفع.</p>
          </div>
        </Modal>
      )}
      {form === 'sell' && <SubmitForm onClose={() => setForm(null)} />}
      {form === 'ad' && <AdRequestForm onClose={() => setForm(null)} />}
    </div>
  );
};
