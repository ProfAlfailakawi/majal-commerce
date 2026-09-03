import React from 'react';
import {
  Sparkles,
  Building2,
  Crown,
  Store,
  ChevronLeft,
  Lock,
  Coins,
  ShieldCheck,
  Users,
  LayoutPanelTop
} from 'lucide-react';
import { SurfaceType, UserRole } from '../../types/majal';
import { store } from '../../lib/store';
import { IS_DEMO_MODE } from '../../lib/runtime';
import { JourneyInfographic } from './JourneyInfographic';
import { MajalMark } from '../brand/MajalMark';

interface PublicLandingProps {
  onSurfaceChange: (surface: SurfaceType) => void;
}

/** The four movements of the model, orbiting the mark in the hero. */
const phases = [
  { icon: <Sparkles className="w-5 h-5" />, label: 'ابتكار', tone: 'text-[#e8c880] border-[#e8c880]/25 bg-[#c7a55b]/10' },
  { icon: <Lock className="w-5 h-5" />, label: 'حماية', tone: 'text-fuchsia-300 border-fuchsia-400/25 bg-fuchsia-500/10' },
  { icon: <Building2 className="w-5 h-5" />, label: 'إنتاج', tone: 'text-sky-300 border-sky-400/25 bg-sky-500/10' },
  { icon: <Store className="w-5 h-5" />, label: 'إطلاق', tone: 'text-emerald-300 border-emerald-400/25 bg-emerald-500/10' }
];

export const PublicLanding: React.FC<PublicLandingProps> = ({ onSurfaceChange }) => {
  const openDemoRole = (role: UserRole, surface: SurfaceType) => {
    if (!IS_DEMO_MODE) return;
    const user = store.users.find(u => u.role === role && u.status !== 'SUSPENDED');
    // Navigate only once the identity actually changed. Calling onSurfaceChange after a
    // failed switch evaluates the permission check against the OLD user, which silently
    // bounces back to PUBLIC and reads to the visitor as a dead button.
    if (!user || !store.setUser(user)) return;
    onSurfaceChange(surface);
  };

  const stats = [
    { value: '٤', label: IS_DEMO_MODE ? 'تجارب أدوار' : 'أطراف تشغيل' },
    { value: '٣', label: 'مستويات إفصاح' },
    { value: 'مرخّص', label: 'إنتاج تجاري' },
    { value: 'واضح', label: 'من الفكرة للإطلاق' }
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-16">
      <div className="glass-panel majal-grain rounded-[32px] p-8 sm:p-12 relative overflow-hidden text-center sm:text-right border border-white/10 elev-3">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-[#c7a55b]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-[#4b6aa3]/10 rounded-full blur-3xl pointer-events-none" />

        {/*
          The brand monument. The previous version put four flat tiles here, which said
          the same thing as the journey section further down the page and said it worse.
          This instead seats the mark itself at the centre of the four movements, so the
          logo's own metaphor — a licensed gate holding a protected idea — is the first
          explanation of the model a visitor gets, before a single paragraph.
        */}
        <aside aria-label="رحلة مجال المختصرة" className="hidden xl:block absolute left-12 top-1/2 -translate-y-1/2">
          <div className="relative w-[17rem] h-[17rem] grid place-items-center">
            <span aria-hidden="true" className="absolute inset-0 rounded-full border border-[#c7a55b]/12" />
            <span aria-hidden="true" className="absolute inset-[13%] rounded-full border border-[#c7a55b]/[0.08]" />
            <span
              aria-hidden="true"
              className="absolute inset-[-6%] rounded-full majal-orbit"
              style={{
                background: 'conic-gradient(from 0deg, transparent 0deg, rgba(199,165,91,0.22) 75deg, transparent 185deg)',
                filter: 'blur(24px)'
              }}
            />

            <MajalMark size={92} withGround />

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
              return (
                <span
                  key={phase.label}
                  className="absolute flex flex-col items-center gap-1.5"
                  style={{ transform: `translate(${x}rem, ${y}rem)` }}
                >
                  <span className={`w-11 h-11 rounded-2xl border grid place-items-center backdrop-blur-sm ${phase.tone}`}>
                    {phase.icon}
                  </span>
                  <span className="text-[10px] font-black text-stone-300">{phase.label}</span>
                </span>
              );
            })}
          </div>
        </aside>

        <div className="relative z-10 max-w-4xl xl:mr-auto xl:ml-[21rem] space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full glass-card border border-[#e8c880]/20 text-[#e8c880] text-xs font-semibold">
            <LayoutPanelTop className="w-4 h-4" />
            <span>مجال — منصة تشغيل الشراكات التجارية بين المبدعين والمنشآت المرخّصة</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black text-slate-100 leading-tight">
            حوّل الموهبة إلى <span className="majal-wordmark">منتج تجاري حقيقي</span>{' '}
            <br className="hidden sm:block" />
            داخل منظومة احترافية واضحة الصلاحيات
          </h1>

          <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-3xl">
            مسار واحد بصري وواضح: ابتكار، حماية، مطابقة، اختبار، اتفاق، ثم إطلاق عبر منشأة مرخّصة.
          </p>

          {IS_DEMO_MODE ? <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 pt-4">
            <button
              onClick={() => openDemoRole('CREATOR', 'CREATOR')}
              className="px-6 py-3.5 rounded-2xl bg-gradient-to-l from-[#c7a55b] to-[#dfc377] hover:brightness-110 text-slate-950 font-black text-sm shadow-[0_14px_40px_rgba(199,165,91,0.24)] transition-all flex items-center gap-2"
            >
              <span>استعرض تجربة المبدع</span>
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              onClick={() => openDemoRole('HOST_OWNER', 'HOST')}
              className="px-6 py-3.5 rounded-2xl glass-card hover:bg-slate-800/80 text-slate-200 border border-slate-700/60 font-semibold text-sm transition-all flex items-center gap-2"
            >
              <Building2 className="w-4 h-4 text-[#e8c880]" />
              <span>استعرض تجربة المنشأة</span>
            </button>

            <button
              onClick={() => openDemoRole('ADMIN', 'ADMIN')}
              className="px-6 py-3.5 rounded-2xl glass-card hover:bg-slate-800/80 text-slate-200 border border-slate-700/60 font-semibold text-sm transition-all flex items-center gap-2"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-300" />
              <span>استكشف طبقة الأدمن</span>
            </button>

            <button
              onClick={() => openDemoRole('SUPER_ADMIN', 'SUPER_ADMIN')}
              className="px-6 py-3.5 rounded-2xl glass-card hover:bg-slate-800/80 text-[#e8c880] border border-[#e8c880]/20 font-semibold text-sm transition-all flex items-center gap-2"
            >
              <Crown className="w-4 h-4" />
              <span>استكشف السوبر أدمن</span>
            </button>
          </div> : <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 pt-4">
            <button onClick={() => onSurfaceChange('CONSUMER')} className="px-6 py-3.5 rounded-2xl bg-gradient-to-l from-[#c7a55b] to-[#dfc377] hover:brightness-110 text-slate-950 font-black text-sm shadow-[0_14px_40px_rgba(199,165,91,0.24)] transition-all flex items-center gap-2">
              <Store className="w-4 h-4" /> استكشف السوق
            </button>
            <span className="px-4 py-3 rounded-2xl bg-emerald-500/5 border border-emerald-400/15 text-emerald-200 text-xs flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> بوابات التشغيل لا تظهر إلا بعد مصادقة الحساب
            </span>
          </div>}
        </div>
      </div>

      {/* One panel rather than four floating cards: these are facets of a single claim,
          and a hairline between them reads as a spec plate instead of four unrelated
          numbers competing for the same attention. */}
      <div className="glass-card rounded-3xl border border-white/10 grid grid-cols-2 lg:grid-cols-4 divide-x divide-x-reverse divide-white/[0.07] overflow-hidden">
        {stats.map((st, i) => (
          <div key={i} className="p-6 sm:p-7 text-center space-y-2">
            <div className="text-2xl sm:text-3xl font-black majal-wordmark">{st.value}</div>
            <div className="text-xs text-slate-400 font-medium leading-6">{st.label}</div>
          </div>
        ))}
      </div>

      <JourneyInfographic />

      <div className="grid md:grid-cols-3 gap-6">
        {[
          { icon: <Users className="w-5 h-5" />, title: 'فصل الأدوار', body: 'كل طرف يرى ما يخصه فقط، حتى داخل المنشأة نفسها توجد صلاحيات مختلفة للمالك، الشيف، المالية، والتسويق.' },
          { icon: <Coins className="w-5 h-5" />, title: 'مستحقات شفافة', body: 'المبدع يتابع مبيعاته ومستحقاته، والمنشأة تتابع الهوامش والإطلاقات، والأدمن يراقب دورة التسوية.' },
          { icon: <Store className="w-5 h-5" />, title: 'سوق قابل للتوسع', body: 'المنصة تبدأ بالطعام، لكن بنيتها تصلح لاحقًا لقطاعات أخرى مع نفس منطق الحاضن التجاري.' }
        ].map((item, idx) => (
          <div key={idx} className="glass-card glass-card-hover rounded-2xl p-6 border border-white/10 space-y-4">
            <div className="w-11 h-11 rounded-xl bg-[#c7a55b]/10 border border-[#e8c880]/20 flex items-center justify-center text-[#e8c880]">{item.icon}</div>
            <h3 className="font-bold text-slate-100 text-base">{item.title}</h3>
            <p className="text-xs text-slate-300 leading-7">{item.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
