import React from 'react';
import {
  Sparkles,
  Building2,
  Store,
  ChevronLeft,
  Lock,
  Coins,
  ShieldCheck,
  Users,
  LayoutPanelTop,
  BadgeCheck,
  Eye,
  Route,
  Tag
} from 'lucide-react';
import { SurfaceType, UserRole } from '../../types/majal';
import { store } from '../../lib/store';
import { IS_DEMO_MODE } from '../../lib/runtime';
import { JourneyInfographic } from './JourneyInfographic';
import { MajalMark } from '../brand/MajalMark';
import { Overture, shouldPlayOverture } from './Overture';

interface PublicLandingProps {
  onSurfaceChange: (surface: SurfaceType) => void;
}

/** The four movements of the model, orbiting the mark in the hero. */
const phases = [
  { icon: <Sparkles className="w-5 h-5" />, label: 'ابتكار', tone: 'text-gold-300 border-gold-300/25 bg-gold-500/10' },
  { icon: <Lock className="w-5 h-5" />, label: 'حماية', tone: 'text-fuchsia-300 border-fuchsia-400/25 bg-fuchsia-500/10' },
  { icon: <Building2 className="w-5 h-5" />, label: 'إنتاج', tone: 'text-sky-300 border-sky-400/25 bg-sky-500/10' },
  { icon: <Store className="w-5 h-5" />, label: 'إطلاق', tone: 'text-emerald-300 border-emerald-400/25 bg-emerald-500/10' }
];

/** Where each movement starts before drifting into its seat on the ring —
    hand-placed so each starts on the INNER side of its seat (the top seat sits a few px under the hero's top edge, the bottom seat above its bottom edge), so no label is ever cut by the card's overflow clip mid-flight, offsets and
    rotations deliberately unequal so the choreography reads as gathered rather
    than mechanical. Consumed by the `majal-hero-phase-in` keyframes. */
const scatter = [
  { x: '-7rem', y: '2.5rem', r: '-14deg', d: '0ms' },
  { x: '3rem', y: '-2.5rem', r: '10deg', d: '110ms' },
  { x: '6rem', y: '-2.5rem', r: '-8deg', d: '220ms' },
  { x: '6rem', y: '2rem', r: '12deg', d: '330ms' }
];

export const PublicLanding: React.FC<PublicLandingProps> = ({ onSurfaceChange }) => {
  // The white-room overture. Decided once, synchronously, before first paint:
  // if it plays, the in-hero entrance below is held on its opening frame and
  // released as the veil lifts, so the two read as one continuous sequence.
  // Gated off (repeat session, reduced motion), nothing here exists and the
  // page renders exactly as it always has.
  const [overture, setOverture] = React.useState(() => (shouldPlayOverture() ? { mounted: true, hold: true } : { mounted: false, hold: false }));
  const releaseHold = React.useCallback(() => setOverture(o => ({ ...o, hold: false })), []);
  const dismissOverture = React.useCallback(() => setOverture({ mounted: false, hold: false }), []);

  const openDemoRole = (role: UserRole, surface: SurfaceType) => {
    if (!IS_DEMO_MODE) return;
    const user = store.users.find(u => u.role === role && u.status !== 'SUSPENDED');
    // Navigate only once the identity actually changed. Calling onSurfaceChange after a
    // failed switch evaluates the permission check against the OLD user, which silently
    // bounces back to PUBLIC and reads to the visitor as a dead button.
    if (!user || !store.setUser(user)) return;
    onSurfaceChange(surface);
  };

  // No invented numbers: each tile states a fact about the model, not a metric.
  const stats = [
    { icon: <Users className="w-5 h-5" />, title: IS_DEMO_MODE ? 'تجارب الأدوار' : 'أطراف التشغيل', sub: 'مبدع · منشأة · مورد · سوق' },
    { icon: <Eye className="w-5 h-5" />, title: 'إفصاح بثلاثة مستويات', sub: 'كل طرف يرى ما يخصه' },
    { icon: <BadgeCheck className="w-5 h-5" />, title: 'إنتاج مرخّص', sub: 'عبر منشأة مرخّصة فقط' },
    { icon: <Route className="w-5 h-5" />, title: 'مسار واضح', sub: 'من الفكرة إلى الإطلاق' }
  ];

  return (
    <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-6 space-y-16 ${overture.hold ? 'majal-overture-hold' : ''}`}>
      {overture.mounted && <Overture onReveal={releaseHold} onDone={dismissOverture} />}
      <div className="glass-panel majal-grain rounded-[28px] p-8 sm:p-12 relative overflow-hidden text-center sm:text-start border border-white/10 elev-3">
        <div className="majal-glow -top-[18rem] -end-[18rem] w-[48rem] h-[48rem]" style={{ '--glow': 'rgba(199,165,91,0.10)' } as React.CSSProperties} />
        <div className="majal-glow -bottom-[18rem] -start-[18rem] w-[48rem] h-[48rem]" style={{ '--glow': 'rgba(75,106,163,0.10)' } as React.CSSProperties} />

        <span aria-hidden="true" className="majal-hero-rings xl:hidden" />

        {/* The gate itself: two nested arches rising from the panel's base, seating the
            constellation. Purely decorative, wide screens only, painted once (no motion). */}
        <svg aria-hidden="true" focusable="false" className="majal-gate hidden xl:block" viewBox="0 0 240 320" preserveAspectRatio="xMidYMax meet">
          <defs>
            <linearGradient id="majal-gate-fade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="currentColor" stopOpacity="0.55" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0.05" />
            </linearGradient>
          </defs>
          <path d="M6 320V120a114 114 0 0 1 228 0V320" fill="none" stroke="url(#majal-gate-fade)" strokeWidth="1.5" />
          <path d="M22 320V120a98 98 0 0 1 196 0V320" fill="none" stroke="url(#majal-gate-fade)" strokeWidth="1" strokeDasharray="2 5" />
        </svg>

        {/*
          The brand monument. The previous version put four flat tiles here, which said
          the same thing as the journey section further down the page and said it worse.
          This instead seats the mark itself at the centre of the four movements, so the
          logo's own metaphor — a licensed gate holding a protected idea — is the first
          explanation of the model a visitor gets, before a single paragraph.
        */}
        <aside aria-label="رحلة مجال المختصرة" className="hidden xl:block absolute end-12 top-1/2 -translate-y-1/2">
          <div className="relative w-[17rem] h-[17rem] grid place-items-center">
            <span aria-hidden="true" className="absolute inset-0 rounded-full border border-gold-500/12 majal-hero-ring" />
            <span aria-hidden="true" className="absolute inset-[13%] rounded-full border border-gold-500/[0.08] majal-hero-ring" />
            <span
              aria-hidden="true"
              className="absolute inset-[-6%] rounded-full majal-orbit majal-hero-ring"
              style={{
                background: 'conic-gradient(from 0deg, transparent 0deg, rgba(199,165,91,0.22) 75deg, transparent 185deg)',
                filter: 'blur(24px)'
              }}
            />

            <span className="majal-hero-mark" data-hero-mark>
              <MajalMark size={92} withGround />
            </span>

            {/* Positioned on the ring rather than in a grid: the four movements are a
                cycle around the platform, not a stack of features. */}
            {phases.map((phase, index) => {
              // Counter-clockwise from the top, so the cycle advances right-to-left the
              // way the rest of the page reads. Clockwise would run the journey backwards
              // for an Arabic reader.
              const angle = -90 - index * 90;
              const radius = 8.5;
              const x = Math.cos((angle * Math.PI) / 180) * radius;
              const y = Math.sin((angle * Math.PI) / 180) * radius;
              // The seat transform stays on the outer span; the entrance animates a
              // nested wrapper. One element can't carry both — the keyframes' final
              // `translate3d(0,0,0)` with fill-mode `both` would overwrite the seat.
              return (
                <span
                  key={phase.label}
                  className="absolute"
                  style={{ transform: `translate(${x}rem, ${y}rem)` }}
                >
                  <span
                    className="flex flex-col items-center gap-1.5 majal-hero-phase"
                    style={{
                      '--scatter-x': scatter[index].x,
                      '--scatter-y': scatter[index].y,
                      '--scatter-r': scatter[index].r,
                      '--scatter-d': scatter[index].d
                    } as React.CSSProperties}
                  >
                    <span className={`w-11 h-11 rounded-2xl border grid place-items-center backdrop-blur-sm ${phase.tone}`}>
                      {phase.icon}
                    </span>
                    <span className="text-xs font-black text-slate-300">{phase.label}</span>
                  </span>
                </span>
              );
            })}
          </div>
        </aside>

        <div className="relative z-10 max-w-4xl xl:ms-auto xl:me-[21rem] space-y-6 majal-hero-copy">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass-card border border-gold-300/20 text-gold-300 text-xs font-semibold">
            <LayoutPanelTop className="w-4 h-4" />
            <span>للمبدعين والمطاعم والمخابز والمصانع الغذائية في الكويت</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black text-slate-100 leading-tight">
            حوّل الموهبة إلى <span className="majal-wordmark">منتج تجاري حقيقي</span>{' '}
            <span className="block mt-3 text-lg sm:text-2xl font-bold text-slate-300">فكرتك محمية، وحقك واضح في كل بيعة</span>
          </h1>

          <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-3xl">
            المبدع يملك الوصفة، المنشأة تحتضن وتطلق، المورد يجهّز، والسوق يقيس الطلب — في مسار واحد.
          </p>

          {IS_DEMO_MODE ? <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 pt-4">
            <button
              onClick={() => openDemoRole('CREATOR', 'CREATOR')}
              className="px-6 py-3.5 rounded-2xl bg-gold-500 hover:bg-gold-400 text-slate-950 font-black text-sm shadow-sm transition-all flex items-center gap-2"
            >
              <span>استعرض تجربة المبدع</span>
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              onClick={() => openDemoRole('HOST_OWNER', 'HOST')}
              className="px-6 py-3.5 rounded-2xl glass-card hover:bg-slate-800/80 text-slate-200 border border-slate-700/60 font-semibold text-sm transition-all flex items-center gap-2"
            >
              <Building2 className="w-4 h-4 text-gold-300" />
              <span>استعرض تجربة المنشأة</span>
            </button>

          </div> : <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 pt-4">
            <button onClick={() => onSurfaceChange('CONSUMER')} className="px-6 py-3.5 rounded-2xl bg-gold-500 hover:bg-gold-400 text-slate-950 font-black text-sm shadow-sm transition-all flex items-center gap-2">
              <Store className="w-4 h-4" /> استكشف السوق
            </button>
            <span className="px-4 py-3 rounded-2xl bg-emerald-500/5 border border-emerald-400/15 text-emerald-200 text-xs flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> كل حساب يرى ما يخصه فقط — وبياناتك محمية
            </span>
          </div>}
        </div>
      </div>

      {/* One panel rather than four floating cards: these are facets of a single claim,
          and a hairline between them reads as a spec plate instead of four unrelated
          numbers competing for the same attention. */}
      <div className="majal-ledger grid grid-cols-2 lg:grid-cols-4">
        {stats.map((st, i) => (
          <div key={i} className="majal-ledger-cell flex flex-col sm:flex-row items-center gap-3 sm:gap-4 text-center sm:text-start px-3 sm:px-5 py-5">
            <span className="majal-arch-tile">{st.icon}</span>
            <div className="min-w-0">
              <div className="majal-ledger-title font-display leading-7">{st.title}</div>
              <div className="majal-ledger-sub text-sm leading-6">{st.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <JourneyInfographic hold={overture.mounted} />

      <section aria-labelledby="landing-showcase" className="rounded-3xl border border-gold-300/20 bg-gold-500/[0.05] p-6 sm:p-8 grid md:grid-cols-[1fr_auto] gap-5 items-center">
        <div className="space-y-2">
          <h2 id="landing-showcase" className="font-display text-xl sm:text-2xl font-black flex items-center gap-2"><Tag className="w-5 h-5 text-gold-300" aria-hidden="true" />عندك مشروع تبي تبيعه؟</h2>
          <p className="text-sm sm:text-base text-slate-300 leading-7 max-w-2xl">بوابة مجانية بلا عمولة: ارفع طلبك، نعتمده، ويظهر للجمهور.</p>
        </div>
        <button type="button" onClick={() => onSurfaceChange('SHOWCASE')} className="px-6 py-3.5 rounded-2xl bg-gold-500 hover:bg-gold-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2">تصفّح المشاريع المعروضة<ChevronLeft className="w-4 h-4" aria-hidden="true" /></button>
      </section>

      <div className="grid md:grid-cols-5 gap-5">
        {[
          { icon: <Users className="w-5 h-5" />, title: 'فصل الأدوار', body: 'كل طرف يرى ما يخصه فقط، حتى داخل المنشأة.', chips: ['المالك', 'الشيف', 'المالية', 'التسويق'], cls: 'md:col-span-3 majal-bento-lead p-6 sm:p-8 rounded-[28px]' },
          { icon: <Coins className="w-5 h-5" />, title: 'مستحقات شفافة', body: 'كل طرف يتابع حصته، والأدمن يراقب دورة التسوية.', cls: 'md:col-span-2 majal-bento-card border-s-2 border-s-gold-400/70 border border-white/10 bg-white/[0.03] p-5 sm:p-6 rounded-2xl' },
          { icon: <Store className="w-5 h-5" />, title: 'منظومة بلا تداخل', body: 'هوية المبدع مستقلة عن المنشأة والمورد، وكل وظيفة تُراجَع قبل ظهورها.', cls: 'md:col-span-5 md:flex md:items-center md:gap-6 border border-dashed border-gold-300/25 p-5 sm:p-6 rounded-3xl' }
        ].map((item, idx) => (
          <div key={idx} className={`relative overflow-hidden space-y-3 md:space-y-0 ${item.cls}`}>
            {idx === 0 && <svg aria-hidden="true" focusable="false" className="majal-bento-arch" viewBox="0 0 120 150"><path d="M4 150V60a56 56 0 0 1 112 0V150M24 150V62a36 36 0 0 1 72 0V150" fill="none" stroke="currentColor" strokeWidth="2" /></svg>}
            <div className="relative flex items-center gap-3 md:shrink-0 md:min-w-[14rem]">
              <div className={idx === 0 ? 'majal-arch-tile majal-arch-tile--lead' : 'w-11 h-11 shrink-0 rounded-xl bg-gold-500/10 border border-gold-300/20 flex items-center justify-center text-gold-300'}>{item.icon}</div>
              <h3 className={`font-display font-black text-lg ${idx === 0 ? 'majal-bento-title' : 'text-slate-100'}`}>{item.title}</h3>
            </div>
            <p className={`relative text-sm leading-7 ${idx === 0 ? 'majal-bento-body' : 'text-slate-300'} ${idx === 2 ? "" : "md:mt-3"}`}>{item.body}</p>
            {'chips' in item && item.chips && (
              <ul className="relative flex flex-wrap gap-2 mt-3 list-none p-0">
                {item.chips.map(chip => (
                  <li key={chip} className="px-2.5 py-1 rounded-full border border-current/30 majal-bento-body text-xs font-bold">{chip}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
