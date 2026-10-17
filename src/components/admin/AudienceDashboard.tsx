import React, { useCallback, useEffect, useState } from 'react';
import { BriefcaseBusiness, Check, ChefHat, Clock3, Copy, Eye, Factory, Handshake, KeyRound, Megaphone, MousePointerClick, RefreshCw, Rocket, Store, TrendingUp, Truck, Users } from 'lucide-react';
import { fetchAudienceOverview, rotatePartnerKit, type AudienceOverview } from '../../lib/audienceClient';
import { ShareBars, TrendBars, WeekdayBars } from '../showcase/charts';
import { AUDIENCE_TONE, SLOT_LABEL, SURFACE_LABEL, audienceLabel, num } from '../showcase/audienceLabels';
import { clockLabel, useAutoRefresh } from '../../lib/autoRefresh';

const Kpi: React.FC<{ icon: React.ReactNode; label: string; value: string; hint?: string; tone?: string }> = ({ icon, label, value, hint, tone = 'text-gold-300' }) => (
  <div className="glass-card rounded-2xl border border-white/10 p-4 space-y-1.5">
    <div className={`flex items-center gap-2 text-xs ${tone}`}>{icon}<span className="font-black">{label}</span></div>
    <div className="text-2xl sm:text-3xl font-black tabular-nums">{value}</div>
    {hint && <div className="text-xs text-slate-400 leading-5">{hint}</div>}
  </div>
);
const Panel: React.FC<{ title: string; sub?: string; children: React.ReactNode; className?: string }> = ({ title, sub, children, className = '' }) => (
  <section className={`glass-panel rounded-3xl border border-white/10 p-5 space-y-4 ${className}`}>
    <div><h3 className="font-black">{title}</h3>{sub && <p className="text-xs text-slate-400 mt-1 leading-5">{sub}</p>}</div>
    {children}
  </section>
);

export const AudienceDashboard: React.FC = () => {
  const [data, setData] = useState<AudienceOverview | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [link, setLink] = useState(''), [copied, setCopied] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const load = useCallback(() => { fetchAudienceOverview().then(d => { setData(d); setError(''); setUpdatedAt(new Date()); }).catch(e => setError(e instanceof Error ? e.message : 'تعذّر التحميل.')); }, []);
  useEffect(load, [load]);
  // Numbers stay within a minute of the server while the tab is open.
  useAutoRefresh(load);

  const rotate = async () => {
    if (data?.kit.exists && !window.confirm('سيتوقف رابط الشراكة الحالي عن العمل. متابعة؟')) return;
    setBusy(true);
    try { const r = await rotatePartnerKit(); setLink(`${window.location.origin}/?partners=${r.token}`); setCopied(false); load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذّر إنشاء الرابط.'); } finally { setBusy(false); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); } };

  if (!data) return error ? <div role="alert" className="p-4 rounded-2xl bg-rose-500/10 border border-rose-400/20 text-sm text-rose-200">{error}</div> : <div role="status" className="py-12 text-center text-sm text-slate-400">جارٍ تحميل لوحة الجمهور…</div>;
  const t = data.traffic, f = data.facts, g = data.gates;
  const since = t.measuringSince ? new Date(`${t.measuringSince}T00:00:00Z`).toLocaleDateString('ar-KW-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : null;

  return (
    <div className="space-y-6">
      <section className="glass-panel rounded-3xl p-5 md:p-6 border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-400/20 grid place-items-center text-emerald-300"><Users className="w-6 h-6" aria-hidden="true" /></span>
          <div><h2 className="font-black text-lg">لوحة الجمهور</h2><p className="text-xs text-slate-400 mt-1 leading-5">أرقام حقيقية ومجهولة لما تسوّقه للشركات: كم دخل، ومن، وإلى أين.</p></div>
        </div>
        <div className="flex items-center gap-2">
          {data.demo && <span className="px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-400/20 text-xs font-black text-amber-300">أرقام تجريبية مولّدة</span>}
          {updatedAt && <span className="text-xs text-slate-400 tabular-nums" role="status">يتحدث تلقائيًا كل دقيقة · آخر تحديث <bdi dir="ltr">{clockLabel(updatedAt)}</bdi></span>}
          <button type="button" onClick={load} className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-black flex items-center gap-2"><RefreshCw className="w-4 h-4" aria-hidden="true" />تحديث</button>
        </div>
      </section>
      {error && <div role="alert" className="p-4 rounded-2xl bg-rose-500/10 border border-rose-400/20 text-xs text-rose-200">{error}</div>}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi icon={<Eye className="w-4 h-4" aria-hidden="true" />} label="داخلون اليوم" value={num(t.totals.browsersToday)} hint="متصفحات مختلفة" />
        <Kpi icon={<TrendingUp className="w-4 h-4" aria-hidden="true" />} label="آخر 7 أيام" value={num(t.totals.browsers7)} hint="متصفحات مختلفة (مجموع الأيام)" tone="text-emerald-300" />
        <Kpi icon={<Users className="w-4 h-4" aria-hidden="true" />} label="آخر 30 يومًا" value={num(t.totals.browsers30)} hint="مجموع داخلين يوميًا" tone="text-sky-300" />
        <Kpi icon={<MousePointerClick className="w-4 h-4" aria-hidden="true" />} label="مشاهدات الصفحات" value={num(t.totals.views30)} hint="30 يومًا" tone="text-fuchsia-300" />
      </div>

      <div className="grid xl:grid-cols-[1.6fr_1fr] gap-6">
        <Panel title="الداخلون يوميًا" sub="كل عمود متصفح دخل مجال في ذلك اليوم (مرة واحدة). الأخضر هو اليوم.">
          <TrendBars points={t.daily.map(d => ({ day: d.day, value: d.browsers }))} label="عدد الداخلين يوميًا خلال 30 يومًا" />
        </Panel>
        <Panel title="أيام الذروة" sub="يوم الأسبوع الأكثر دخولًا يظهر بالأخضر.">
          <WeekdayBars values={t.weekday} />
        </Panel>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Panel title="من يدخل؟" sub="مشاهدات الصفحات حسب نوع الزائر (دوره فقط، لا هويته).">
          <ShareBars rows={t.byAudience.map(a => ({ key: a.key, label: audienceLabel(a.key), value: a.visits, tone: AUDIENCE_TONE[a.key] }))} />
        </Panel>
        <Panel title="إلى أين يذهبون؟" sub="مشاهدات كل صفحة خلال 30 يومًا.">
          <ShareBars rows={t.bySurface.map(s => ({ key: s.key, label: SURFACE_LABEL[s.key] ?? s.key, value: s.visits }))} />
        </Panel>
      </div>

      <Panel title="ما الذي يعلنون بجانبه؟" sub="أعداد حقيقية من المنصة نفسها، بلا أسماء ولا مبالغ.">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: ChefHat, label: 'مبدعون', v: f.creators }, { icon: Factory, label: 'منشآت موثّقة', v: f.verifiedFacilities },
            { icon: Truck, label: 'موردون موثّقون', v: f.verifiedSuppliers }, { icon: Rocket, label: 'إطلاقات حيّة', v: f.liveLaunches },
            { icon: BriefcaseBusiness, label: 'وظائف مفتوحة', v: f.openJobs }, { icon: Store, label: 'مشاريع للبيع', v: f.businessesForSale },
            { icon: Handshake, label: 'موردون في الدليل', v: f.directorySuppliers },
          ].map(x => (
            <div key={x.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 flex items-center gap-3"><span className="w-10 h-10 rounded-xl grid place-items-center bg-gold-500/10 border border-gold-300/20 text-gold-300 shrink-0"><x.icon className="w-5 h-5" aria-hidden="true" /></span><div className="min-w-0"><div className="text-xl font-black tabular-nums">{num(x.v)}</div><div className="text-xs text-slate-400 truncate">{x.label}</div></div></div>
          ))}
        </div>
      </Panel>

      <div className="grid lg:grid-cols-2 gap-6">
        <Panel title="البوابات المجانية" sub="فتحات التفاصيل ونقرات التواصل (30 يومًا).">
          <div className="grid grid-cols-3 gap-3 text-center">
            {[{ l: 'فتح مشروع', v: g.listingOpens }, { l: 'تواصل مع بائع', v: g.listingContacts }, { l: 'تواصل مع مورد', v: g.supplierContacts }].map(x => (
              <div key={x.l} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"><div className="text-xl font-black tabular-nums">{num(x.v)}</div><div className="text-xs text-slate-400 mt-0.5">{x.l}</div></div>
            ))}
          </div>
          {[{ title: 'أكثر المشاريع اهتمامًا', rows: g.topListings }, { title: 'أكثر الموردين تواصلًا', rows: g.topSuppliers }].map(block => block.rows.length > 0 && (
            <div key={block.title} className="space-y-2"><h4 className="text-xs font-black text-slate-300">{block.title}</h4>
              {block.rows.map(r => <div key={r.id} className="flex justify-between gap-3 text-xs rounded-xl bg-white/[0.03] border border-white/10 px-3 py-2"><span className="truncate">{r.title}</span><span className="text-slate-400 shrink-0">{r.opens ? `${num(r.opens)} فتح · ` : ''}{num(r.contacts)} تواصل</span></div>)}
            </div>
          ))}
        </Panel>
        <Panel title="الإعلانات والإيراد" sub="مجمل الحملات (30 يومًا)، ما دفعه المعلنون، وامتلاء المواقع الآن.">
          <div className="grid grid-cols-2 gap-3 text-center">{[{ l: 'مدفوع (30 يومًا)', v: `${num(data.revenue.paid30)} د.ك`, tone: 'text-emerald-300' }, { l: 'إجمالي المدفوع', v: `${num(data.revenue.paidTotal)} د.ك`, tone: 'text-gold-300' }, { l: 'طلبات بانتظار السعر', v: num(data.revenue.awaitingBilling), tone: 'text-amber-300' }, { l: 'حملات ضيافة', v: num(data.revenue.complimentary), tone: 'text-slate-300' }].map(x => <div key={x.l} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"><div className={`text-xl font-black tabular-nums ${x.tone}`}>{x.v}</div><div className="text-xs text-slate-400 mt-0.5">{x.l}</div></div>)}</div>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[{ l: 'ظهور', v: num(data.ads.impressions) }, { l: 'نقرات', v: num(data.ads.clicks) }, { l: 'نسبة النقر', v: `${num(data.ads.ctr)}%` }].map(x => <div key={x.l} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"><div className="text-xl font-black tabular-nums">{x.v}</div><div className="text-xs text-slate-400 mt-0.5">{x.l}</div></div>)}
          </div>
          <div className="space-y-2.5">{data.slots.map(s => (
            <div key={s.slot} className="space-y-1"><div className="flex justify-between text-xs"><span className="font-bold flex items-center gap-1.5"><Megaphone className="w-3.5 h-3.5 text-gold-300" aria-hidden="true" />{SLOT_LABEL[s.slot]}</span><span className={s.live >= s.capacity ? 'text-amber-300' : 'text-emerald-300'}>{num(s.live)} / {num(s.capacity)}{s.live >= s.capacity ? ' ممتلئ' : ' متاح'}</span></div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className={`h-full rounded-full ${s.live >= s.capacity ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${(s.live / s.capacity) * 100}%` }} /></div></div>
          ))}</div>
        </Panel>
      </div>

      <Panel title="رابط الشراكة للشركات" sub="صفحة جميلة بأرقامك الحقيقية ترسلها لأي شركة. الرابط خاص، وتجديده يوقف القديم.">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={busy} onClick={rotate} className="px-5 py-3 rounded-xl bg-gold-500 text-slate-950 text-sm font-black flex items-center gap-2 disabled:opacity-50"><KeyRound className="w-4 h-4" aria-hidden="true" />{data.kit.exists ? 'تجديد الرابط' : 'إنشاء الرابط'}</button>
          {data.kit.exists && <span className="text-xs text-slate-400 flex items-center gap-1.5"><Clock3 className="w-3.5 h-3.5" aria-hidden="true" />{data.kit.rotatedAt ? 'جُدّد' : 'أُنشئ'} {new Date(data.kit.rotatedAt ?? data.kit.createdAt ?? Date.now()).toLocaleDateString('ar-KW-u-nu-latn')} — الرابط الحالي لا يمكن عرضه ثانية، جدّده للحصول على رابط جديد.</span>}
        </div>
        {link && (
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.06] p-4 space-y-2">
            <div className="text-xs font-black text-emerald-200">الرابط الجديد — يظهر مرة واحدة</div>
            <div dir="ltr" className="text-xs break-all select-all text-slate-200">{link}</div>
            <button type="button" onClick={copy} className="px-3 py-2 rounded-lg bg-white/10 text-xs font-black inline-flex items-center gap-1.5">{copied ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}{copied ? 'نُسخ' : 'نسخ'}</button>
          </div>
        )}
      </Panel>

      <p className="text-xs text-slate-400 leading-6 flex gap-2"><Clock3 className="w-4 h-4 shrink-0 mt-1" aria-hidden="true" /><span>{since ? `القياس بدأ يوم ${since} ولا يرجع إلى الماضي. ` : 'لم يبدأ القياس بعد؛ يظهر أول رقم بعد أول زيارة. '}المتصفح الواحد يُحسب مرة واحدة في اليوم لكل صفحة، ولا يُحفظ عنوان IP ولا هوية. المتصفحات التي تحجب التخزين المحلي قد تُحسب أكثر من مرة. زيارات الإدارة لا تُحسب.</span></p>
    </div>
  );
};
