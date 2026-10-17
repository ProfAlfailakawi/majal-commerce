import React, { useEffect, useState } from 'react';
import { ArrowRight, BadgeCheck, BriefcaseBusiness, CalendarCheck, ChefHat, Eye, Factory, Gift, Handshake, Megaphone, Rocket, ShieldCheck, Sparkles, Store, Target, Truck, Users } from 'lucide-react';
import { fetchPartnerKit, type PartnerKit } from '../../lib/audienceClient';
import { MajalMark } from '../brand/MajalMark';
import { ShareBars, TrendBars, WeekdayBars } from './charts';
import { AUDIENCE_TONE, SLOT_LABEL, SURFACE_LABEL, audienceLabel, num } from './audienceLabels';
import { AdRequestForm } from './BusinessShowcase';
import { AD_AUDIENCES, AD_AUDIENCE_LABEL, AD_TOPICS } from '../../lib/adAudience';

const SLOT_NOTE: Record<string, string> = {
  SPONSOR: 'شريط ثابت أسفل القائمة، لشركة واحدة لكل جمهور في الفترة.',
  MARKET: 'بين إطلاقات السوق وفرص العمل، حيث يتصفح المتسوقون.',
  PORTAL: 'داخل بوابات المبدعين والمنشآت والموردين.',
};
const STEPS = [
  { icon: Megaphone, t: 'اطلب مساحتك', s: 'عنوان قصير ورابط https ورقم تواصل' },
  { icon: ShieldCheck, t: 'نراجع ونعتمد', s: 'نحدد الموقع والمدة والجمهور' },
  { icon: Eye, t: 'يظهر إعلانك', s: 'بوسم «إعلان» واضح للجميع' },
  { icon: Target, t: 'تصلك أرقامك', s: 'رابط تقرير خاص بكل حملة' },
];

/** Public page behind the private link `/?partners=<token>`: real, anonymous figures for a company deciding to advertise. */
export const PartnerKitPage: React.FC<{ token: string; onClose: () => void }> = ({ token, onClose }) => {
  const [kit, setKit] = useState<PartnerKit | null>(null);
  const [error, setError] = useState(''), [form, setForm] = useState(false);
  useEffect(() => { fetchPartnerKit(token).then(setKit).catch(e => setError(e instanceof Error ? e.message : 'الرابط غير صالح.')); }, [token]);

  if (!kit) return (
    <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
      {error ? <><div role="alert" className="p-5 rounded-2xl bg-rose-500/10 border border-rose-400/20 text-sm text-rose-200">{error}</div><button type="button" onClick={onClose} className="text-xs underline">العودة إلى مجال</button></> : <div role="status" className="text-sm text-slate-300">جارٍ تجهيز الملف…</div>}
    </div>
  );
  const t = kit.traffic, f = kit.facts;
  const since = t.measuringSince ? new Date(`${t.measuringSince}T00:00:00Z`).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : null;
  const young = t.daily.filter(d => d.browsers > 0).length < 7;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3"><MajalMark size={34} tone="ink" /><span className="font-black text-lg">مجال <span className="text-slate-400 font-bold text-sm">· ملف الشراكة</span></span></div>
        <button type="button" onClick={onClose} className="inline-flex items-center gap-2 text-xs text-slate-300 hover:text-white"><ArrowRight className="w-4 h-4" aria-hidden="true" />الموقع</button>
      </div>

      <section className="glass-panel majal-grain rounded-[28px] p-6 sm:p-10 border border-white/10 relative overflow-hidden text-center sm:text-start space-y-5">
        <div className="majal-glow -top-[14rem] -end-[14rem] w-[34rem] h-[34rem]" style={{ '--glow': 'rgba(199,165,91,0.12)' } as React.CSSProperties} />
        <div className="relative z-10 space-y-4 max-w-2xl">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass-card border border-emerald-400/25 text-emerald-300 text-xs font-black"><Gift className="w-4 h-4" aria-hidden="true" />مجاني: خدمة منا بلا أي مقابل</span>
          <h1 className="text-3xl sm:text-4xl font-black leading-tight">اعرض شركتك أمام <span className="majal-wordmark">مجتمع مجال</span></h1>
          <p className="text-sm sm:text-base text-slate-300 leading-7">مبدعون ومنشآت وموردون ومتسوقون يتحركون من الفكرة إلى المنتج في مكان واحد. هذه أرقامنا الحقيقية، مجهولة بالكامل، وما نعرضه عليك بلا رسوم ولا عمولة.</p>
          <button type="button" onClick={() => setForm(true)} className="px-6 py-3.5 rounded-2xl bg-gold-500 hover:bg-gold-400 text-slate-950 font-black text-sm inline-flex items-center gap-2"><Megaphone className="w-4 h-4" aria-hidden="true" />اطلب مساحة إعلانية</button>
        </div>
      </section>
      {kit.demo && <p className="text-xs text-amber-200 bg-amber-500/10 border border-amber-400/20 rounded-xl p-3">هذه النسخة تجريبية: الأرقام مولّدة للعرض وليست مقاسة.</p>}

      <section aria-label="أرقام الدخول" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[{ icon: Eye, l: 'داخلون اليوم', v: t.totals.browsersToday, c: 'text-gold-300' }, { icon: Users, l: 'آخر ٧ أيام', v: t.totals.browsers7, c: 'text-emerald-300' }, { icon: CalendarCheck, l: 'آخر ٣٠ يومًا', v: t.totals.browsers30, c: 'text-sky-300' }, { icon: Sparkles, l: 'مشاهدات الصفحات', v: t.totals.views30, c: 'text-fuchsia-300' }].map(k => (
          <div key={k.l} className="glass-card rounded-2xl border border-white/10 p-4 space-y-1.5"><div className={`flex items-center gap-2 text-xs font-black ${k.c}`}><k.icon className="w-4 h-4" aria-hidden="true" />{k.l}</div><div className="text-3xl font-black tabular-nums">{num(k.v)}</div></div>
        ))}
      </section>

      <section className="grid lg:grid-cols-[1.6fr_1fr] gap-6">
        <div className="glass-panel rounded-3xl border border-white/10 p-5 space-y-3"><h2 className="font-black">الداخلون يوميًا</h2><TrendBars points={t.daily.map(d => ({ day: d.day, value: d.browsers }))} label="عدد الداخلين يوميًا خلال ٣٠ يومًا" /></div>
        <div className="glass-panel rounded-3xl border border-white/10 p-5 space-y-3"><h2 className="font-black">أفضل أيام الأسبوع</h2><WeekdayBars values={t.weekday} /></div>
      </section>

      <section className="grid lg:grid-cols-2 gap-6">
        <div className="glass-panel rounded-3xl border border-white/10 p-5 space-y-4"><h2 className="font-black">من يزور مجال؟</h2><ShareBars rows={t.byAudience.map(a => ({ key: a.key, label: audienceLabel(a.key), value: a.visits, tone: AUDIENCE_TONE[a.key] }))} /></div>
        <div className="glass-panel rounded-3xl border border-white/10 p-5 space-y-4"><h2 className="font-black">وأين يقضون وقتهم؟</h2><ShareBars rows={t.bySurface.map(s => ({ key: s.key, label: SURFACE_LABEL[s.key] ?? s.key, value: s.visits }))} /></div>
      </section>

      <section className="glass-panel rounded-3xl border border-white/10 p-5 sm:p-6 space-y-4">
        <h2 className="font-black">من تجاور في مجال</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[{ i: ChefHat, l: 'مبدعون', v: f.creators }, { i: Factory, l: 'منشآت موثّقة', v: f.verifiedFacilities }, { i: Truck, l: 'موردون موثّقون', v: f.verifiedSuppliers }, { i: Rocket, l: 'إطلاقات حيّة', v: f.liveLaunches }, { i: BriefcaseBusiness, l: 'وظائف مفتوحة', v: f.openJobs }, { i: Store, l: 'مشاريع للبيع', v: f.businessesForSale }, { i: Handshake, l: 'موردون في الدليل', v: f.directorySuppliers }].map(x => (
            <div key={x.l} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 flex items-center gap-3"><span className="w-10 h-10 rounded-xl grid place-items-center bg-gold-500/10 border border-gold-300/20 text-gold-300 shrink-0"><x.i className="w-5 h-5" aria-hidden="true" /></span><div><div className="text-xl font-black tabular-nums">{num(x.v)}</div><div className="text-xs text-slate-400">{x.l}</div></div></div>
          ))}
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="kit-slots">
        <h2 id="kit-slots" className="font-black text-lg">أين يظهر إعلانك؟</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {kit.slots.map(s => (
            <div key={s.slot} className="glass-card rounded-2xl border border-white/10 p-5 space-y-3">
              <div className="flex items-center justify-between gap-2"><h3 className="font-black text-sm">{SLOT_LABEL[s.slot]}</h3><span className={`text-xs px-2 py-1 rounded-full font-black ${s.live >= s.capacity ? 'bg-amber-500/10 text-amber-300' : 'bg-emerald-500/10 text-emerald-300'}`}>{s.live >= s.capacity ? 'ممتلئ الآن' : `${num(s.capacity - s.live)} متاح`}</span></div>
              <p className="text-xs text-slate-300 leading-6">{SLOT_NOTE[s.slot]}</p>
              <div className="flex gap-1.5" aria-hidden="true">{Array.from({ length: s.capacity }, (_, i) => <span key={i} className={`h-2 flex-1 rounded-full ${i < s.live ? 'bg-amber-400' : 'bg-emerald-400/70'}`} />)}</div>
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-gold-300/20 bg-gold-500/[0.05] p-5 space-y-3">
          <h3 className="font-black text-sm flex items-center gap-2"><Target className="w-4 h-4 text-gold-300" aria-hidden="true" />استهداف ذكي بلا بيانات شخصية</h3>
          <p className="text-xs text-slate-300 leading-6">نعرف فقط نوع الزائر، ولا نعرف من هو. اختر من يرى إعلانك، وأي فئة منتجات يتبعها.</p>
          <div className="flex flex-wrap gap-1.5">{AD_AUDIENCES.map(a => <span key={a} className="px-2.5 py-1 rounded-full text-xs bg-white/5 border border-white/10">{AD_AUDIENCE_LABEL[a]}</span>)}{AD_TOPICS.map(x => <span key={x} className="px-2.5 py-1 rounded-full text-xs bg-gold-500/10 border border-gold-300/20 text-gold-200">{x}</span>)}</div>
        </div>
      </section>

      <section aria-label="خطوات" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {STEPS.map((s, i) => (
          <div key={s.t} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center space-y-2"><span className="mx-auto w-12 h-12 rounded-2xl grid place-items-center bg-gold-500/10 border border-gold-300/25 text-gold-300 relative"><s.icon className="w-6 h-6" aria-hidden="true" /><span className="absolute -top-2 -end-2 w-5 h-5 rounded-full bg-gold-500 text-slate-950 text-[11px] font-black grid place-items-center">{i + 1}</span></span><div className="text-sm font-black">{s.t}</div><div className="text-xs text-slate-400 leading-5">{s.s}</div></div>
        ))}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-xs text-slate-300 leading-7 space-y-1.5">
        <h2 className="font-black text-sm flex items-center gap-2 text-slate-100"><BadgeCheck className="w-4 h-4 text-emerald-300" aria-hidden="true" />شروطنا بوضوح</h2>
        <p>• مجاني: لا رسوم ولا عمولة، وهو خدمة من مجال لأصحاب الأعمال.</p>
        <p>• كل إعلان بوسم «إعلان»، ويمر على الإدارة قبل الظهور، ويقودك إلى رابط https عام تعتمده الإدارة.</p>
        <p>• الأرقام مجهولة: لا نحفظ IP ولا اسمًا ولا هوية. المتصفح الواحد يُحسب مرة يوميًا لكل صفحة.</p>
        <p>• {since ? `القياس بدأ يوم ${since} ولا يرجع للماضي.` : 'القياس بدأ حديثًا.'}{young ? ' الأرقام ما زالت في أيامها الأولى، وستنمو مع الوقت.' : ''}</p>
      </section>
      {form && <AdRequestForm onClose={() => setForm(false)} />}
    </div>
  );
};
