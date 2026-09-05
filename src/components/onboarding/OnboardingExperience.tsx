import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Command,
  Compass,
  Eye,
  FileLock2,
  KeyRound,
  LogIn,
  ShieldCheck,
  Sparkles,
  Store,
  X
} from 'lucide-react';
import { MajalMark } from '../brand/MajalMark';
import { journeyStages } from '../../data/journey';
import { OnboardingIntent, intentSurface } from '../../lib/onboarding';
import { SurfaceType, User } from '../../types/majal';
import { canAccessSurface } from '../../lib/permissions';
import { useDialogBehavior } from '../../hooks/useDialogBehavior';

/**
 * MAJAL — first-run introduction.
 *
 * The product's whole proposition is an ORDER of operations (idea → protection →
 * matching → lab → contract → launch) plus a disclosure model that decides who may see
 * a recipe and when. Neither is inferable from a dashboard, which is why a visitor who
 * lands straight on a portal reads it as "a lot of panels". This flow spends four
 * screens establishing that model before handing over the keys.
 *
 * Design rules it holds to:
 *  - It asks exactly one question (why are you here) and uses the answer, rather than
 *    collecting a profile the app then ignores.
 *  - It is skippable from the first frame and never re-appears once dismissed.
 *  - Nothing here mutates business state. The last step navigates via the app's own
 *    permission-checked surface change, so an anonymous visitor who picks «مبدع» is
 *    routed to sign in rather than bounced off a portal they cannot open.
 */

interface OnboardingExperienceProps {
  open: boolean;
  activeUser: User;
  /** Dismiss without navigating. Receives the intent chosen so far, if any. */
  onDismiss: (intent: OnboardingIntent | null, skipped: boolean) => void;
  onSurfaceChange: (surface: SurfaceType) => void;
  /** Present only when a real sign-in is possible (i.e. not the local demo build). */
  onRequestAuth?: () => void;
}

type StepId = 'WELCOME' | 'INTENT' | 'JOURNEY' | 'PROTECTION' | 'READY';

const STEPS: StepId[] = ['WELCOME', 'INTENT', 'JOURNEY', 'PROTECTION', 'READY'];

const intents: {
  id: OnboardingIntent;
  title: string;
  body: string;
  icon: React.ReactNode;
  accent: { text: string; ring: string; fill: string };
}[] = [
  {
    id: 'CREATOR',
    title: 'عندي فكرة أو وصفة',
    body: 'أبي أوصلها للسوق عبر منشأة مرخّصة، بدون ما أسلّم سرّي لأحد قبل الاتفاق.',
    icon: <Sparkles className="w-6 h-6" />,
    accent: { text: 'text-gold-300', ring: 'border-gold-300/35', fill: 'bg-gold-500/10' }
  },
  {
    id: 'HOST',
    title: 'عندي منشأة مرخّصة',
    body: 'عندي مطبخ أو خط إنتاج، وأدوّر منتجات جاهزة تناسب قدرتي وهامشي.',
    icon: <Building2 className="w-6 h-6" />,
    accent: { text: 'text-sky-300', ring: 'border-sky-400/35', fill: 'bg-sky-500/10' }
  },
  {
    id: 'CONSUMER',
    title: 'أتابع السوق',
    body: 'يهمني أشوف الإطلاقات الحيّة والمنتجات الجديدة أول ما تنزل.',
    icon: <Store className="w-6 h-6" />,
    accent: { text: 'text-emerald-300', ring: 'border-emerald-400/35', fill: 'bg-emerald-500/10' }
  },
  {
    id: 'ADMIN',
    title: 'أدير التشغيل',
    body: 'أتابع الامتثال والنزاعات والتسويات وسياسة المنصة من مكان واحد.',
    icon: <ShieldCheck className="w-6 h-6" />,
    accent: { text: 'text-violet-300', ring: 'border-violet-400/35', fill: 'bg-violet-500/10' }
  }
];

/** The disclosure ladder — the single mechanic that makes the rest of the model safe. */
const disclosureLevels = [
  {
    level: 'المستوى الأول',
    title: 'البطاقة العامة',
    body: 'الاسم والفئة والقصة وصورة المنتج. مفتوحة للاستكشاف، ولا تكشف أي سر.',
    icon: <Eye className="w-5 h-5" />,
    accent: { text: 'text-emerald-300', ring: 'border-emerald-400/30', fill: 'bg-emerald-500/10' }
  },
  {
    level: 'المستوى الثاني',
    title: 'الملف التشغيلي',
    body: 'المكوّنات العامة والحساسيات ومتطلبات الإنتاج. تُفتح بمنحة زمنية محدودة للمنشأة المرشّحة.',
    icon: <KeyRound className="w-5 h-5" />,
    accent: { text: 'text-sky-300', ring: 'border-sky-400/30', fill: 'bg-sky-500/10' }
  },
  {
    level: 'المستوى الثالث',
    title: 'الوصفة الكاملة',
    body: 'النسب وطريقة التنفيذ. لا تُفتح إلا بعد عقد موقّع وبموافقة صريحة من المبدع.',
    icon: <FileLock2 className="w-5 h-5" />,
    accent: { text: 'text-fuchsia-300', ring: 'border-fuchsia-400/30', fill: 'bg-fuchsia-500/10' }
  }
];

/** Staggered entrance for a step's children — index in, delay out. */
const rise = (order: number): React.CSSProperties => ({
  animation: 'majal-onboard-rise 560ms cubic-bezier(0.16, 1, 0.3, 1) both',
  animationDelay: `${60 + order * 70}ms`
});

export const OnboardingExperience: React.FC<OnboardingExperienceProps> = ({
  open,
  activeUser,
  onDismiss,
  onSurfaceChange,
  onRequestAuth
}) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [intent, setIntent] = useState<OnboardingIntent | null>(null);
  const intentRef = useRef<OnboardingIntent | null>(null);
  intentRef.current = intent;

  // Escape closes via the shared dialog behaviour, which also traps focus, locks body
  // scroll, and restores focus to whatever opened the flow.
  const dialogRef = useDialogBehavior<HTMLDivElement>(open, () => onDismiss(intentRef.current, true));

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;
  const headingId = `onboarding-heading-${step}`;

  const chosen = useMemo(() => intents.find(item => item.id === intent) ?? null, [intent]);
  const destination = intent ? intentSurface[intent] : 'CONSUMER';
  const canEnterDestination = canAccessSurface(activeUser, destination);
  // An anonymous visitor picking «مبدع» must be sent to sign in, not to a portal that
  // would silently bounce them back to the public page and read as a broken button.
  const needsAuth = !canEnterDestination && Boolean(onRequestAuth);

  useEffect(() => {
    if (!open) return;
    setStepIndex(0);
    setIntent(null);
  }, [open]);

  // The heading is re-focused on every step so a screen reader announces the new screen;
  // without it the flow is silent after the first slide.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!open) return;
    headingRef.current?.focus();
  }, [step, open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      // RTL: the left arrow points the way the content advances.
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setStepIndex(current => Math.min(STEPS.length - 1, current + 1));
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setStepIndex(current => Math.max(0, current - 1));
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  if (!open) return null;

  const finish = () => {
    onDismiss(intent, false);
    if (needsAuth) {
      onRequestAuth?.();
      return;
    }
    onSurfaceChange(destination);
  };

  return (
    <div
      className="fixed inset-0 z-[120] overflow-y-auto majal-grain"
      style={{
        background:
          'radial-gradient(circle at 50% -10%, rgba(199,165,91,0.16) 0, transparent 45%), linear-gradient(180deg, #0a101b 0%, #0b1220 55%, #070d18 100%)'
      }}
    >
      {/* Two slow, very low-contrast fields. They give the screen depth without ever
          competing with the type, and they are the only ambient motion in the flow. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="majal-glow -top-[30rem] right-[8%] w-[54rem] h-[54rem] majal-drift"
          style={{ '--glow': 'rgba(199,165,91,0.07)' } as React.CSSProperties}
        />
        <div
          className="majal-glow -bottom-[34rem] left-[4%] w-[50rem] h-[50rem] majal-drift-slow"
          style={{ '--glow': 'rgba(75,106,163,0.08)' } as React.CSSProperties}
        />
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff07_1px,transparent_1px)] [background-size:34px_34px]" />
      </div>

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="relative min-h-full flex flex-col max-w-5xl mx-auto px-4 sm:px-8 py-6 sm:py-8"
      >
        <header className="flex items-center justify-between gap-4 shrink-0">
          <span className="flex items-center gap-3">
            <MajalMark size={34} />
            <span className="text-lg font-black majal-wordmark leading-none">مجال</span>
          </span>

          <button
            onClick={() => onDismiss(intent, true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-bold text-slate-400 hover:text-slate-100 hover:bg-white/5 border border-white/10 transition-colors"
          >
            <span>تخطّي التعريف</span>
            <X className="w-3.5 h-3.5" />
          </button>
        </header>

        <main className="flex-1 flex flex-col justify-center py-10 sm:py-14">
          {step === 'WELCOME' && (
            <div className="text-center space-y-8">
              <div style={rise(0)} className="flex justify-center">
                <span className="relative grid place-items-center w-44 h-44">
                  <span aria-hidden="true" className="absolute inset-0 rounded-full border border-gold-500/15" />
                  <span aria-hidden="true" className="absolute inset-[14%] rounded-full border border-gold-500/10" />
                  <span
                    aria-hidden="true"
                    className="absolute inset-[-10%] rounded-full majal-orbit"
                    style={{
                      background:
                        'conic-gradient(from 0deg, transparent 0deg, rgba(199,165,91,0.28) 80deg, transparent 190deg)',
                      filter: 'blur(20px)'
                    }}
                  />
                  <MajalMark size={104} withGround animated />
                </span>
              </div>

              <div className="space-y-4">
                <h2
                  id={headingId}
                  ref={headingRef}
                  tabIndex={-1}
                  data-focus-silent
                  style={rise(2)}
                  className="text-3xl sm:text-5xl font-black text-slate-100 leading-tight outline-none"
                >
                  الفكرة ما تحتاج مصنعًا.
                  <br />
                  <span className="majal-wordmark">تحتاج مجالًا.</span>
                </h2>
                <p style={rise(3)} className="text-sm sm:text-base text-slate-400 leading-8 max-w-xl mx-auto">
                  مجال منصة كويتية تنقل ابتكار المبدع إلى منتج تجاري حقيقي عبر منشأة مرخّصة — بمسار
                  واحد واضح، وصلاحيات محدّدة لكل طرف، وسر محفوظ حتى لحظة الاتفاق.
                </p>
              </div>

              <ul style={rise(4)} className="flex flex-wrap items-center justify-center gap-2.5 text-[11px]">
                {['سرّك يفتح بإذنك فقط', 'إنتاج عبر منشأة مرخّصة', 'مستحقات تتابعها بنفسك'].map(item => (
                  <li
                    key={item}
                    className="px-3 py-1.5 rounded-full glass-card border border-white/10 text-slate-300 flex items-center gap-2"
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {step === 'INTENT' && (
            <div className="space-y-8">
              <div className="text-center space-y-3">
                <span style={rise(0)} className="block text-[10px] font-black tracking-[0.3em] text-gold-300">
                  سؤال واحد فقط
                </span>
                <h2
                  id={headingId}
                  ref={headingRef}
                  tabIndex={-1}
                  data-focus-silent
                  style={rise(1)}
                  className="text-2xl sm:text-4xl font-black text-slate-100 outline-none"
                >
                  ما الذي أتى بك إلى مجال؟
                </h2>
                <p style={rise(2)} className="text-xs sm:text-sm text-slate-400 leading-7 max-w-lg mx-auto">
                  نستخدم إجابتك لنبدأ من المكان الصحيح. تقدر تغيّرها في أي وقت من شريط التنقل.
                </p>
              </div>

              <div role="radiogroup" aria-label="سبب زيارتك" className="grid sm:grid-cols-2 gap-4">
                {intents.map((item, index) => {
                  const selected = intent === item.id;
                  return (
                    <button
                      key={item.id}
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setIntent(item.id)}
                      style={rise(3 + index)}
                      className={`text-right p-5 rounded-3xl border transition-all duration-200 ${
                        selected
                          ? `${item.accent.fill} ${item.accent.ring} shadow-[0_12px_36px_rgba(199,165,91,0.16)] -translate-y-0.5`
                          : 'glass-card border-white/10 hover:border-white/20 hover:-translate-y-0.5'
                      }`}
                    >
                      <span className="flex items-start gap-4">
                        <span
                          className={`w-12 h-12 shrink-0 rounded-2xl grid place-items-center border ${item.accent.fill} ${item.accent.ring} ${item.accent.text}`}
                        >
                          {item.icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="block text-sm font-black text-slate-100">{item.title}</span>
                            {selected && <Check className={`w-4 h-4 shrink-0 ${item.accent.text}`} />}
                          </span>
                          <span className="block mt-2 text-[11px] text-slate-400 leading-6">{item.body}</span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 'JOURNEY' && (
            <div className="space-y-8">
              <div className="text-center space-y-3">
                <span style={rise(0)} className="block text-[10px] font-black tracking-[0.3em] text-gold-300">
                  MAJAL JOURNEY
                </span>
                <h2
                  id={headingId}
                  ref={headingRef}
                  tabIndex={-1}
                  data-focus-silent
                  style={rise(1)}
                  className="text-2xl sm:text-4xl font-black text-slate-100 outline-none"
                >
                  ست محطات، بالترتيب
                </h2>
                <p style={rise(2)} className="text-xs sm:text-sm text-slate-400 leading-7 max-w-xl mx-auto">
                  ما تُفتح محطة قبل اكتمال اللي قبلها. لذلك ما فيه «إطلاق سريع» يتخطى الحماية أو العقد.
                </p>
              </div>

              <ol className="relative space-y-3 pr-7 sm:pr-9 max-w-2xl mx-auto">
                {/* The rail is the point of this screen — it is what makes the six items
                    read as one sequence instead of six features. Decorative, so hidden. */}
                <span
                  aria-hidden="true"
                  className="absolute top-3 bottom-3 right-[0.9rem] sm:right-[1.15rem] w-px bg-gradient-to-b from-gold-500/50 via-sky-400/30 to-emerald-400/40"
                />
                {journeyStages.map((stage, index) => (
                  <li key={stage.index} style={rise(3 + index)} className="relative">
                    <span
                      aria-hidden="true"
                      className={`absolute -right-7 sm:-right-9 top-4 w-[0.55rem] h-[0.55rem] rounded-full ring-4 ring-ink-800 ${stage.accent.dot}`}
                    />
                    <div
                      className={`glass-card rounded-2xl border ${stage.accent.ring} px-4 py-3.5 flex items-center gap-4`}
                    >
                      <span
                        className={`w-10 h-10 shrink-0 rounded-xl ${stage.accent.fill} border ${stage.accent.ring} grid place-items-center ${stage.accent.text}`}
                      >
                        {stage.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className={`text-xs font-black ${stage.accent.text}`} aria-hidden="true">
                            {stage.index}.
                          </span>
                          <span className="text-sm font-black text-slate-100">{stage.title}</span>
                          <span className="text-[10px] text-slate-500 font-bold">— {stage.actor}</span>
                        </span>
                        <span className="block mt-1 text-[11px] text-slate-400 leading-6">{stage.brief}</span>
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {step === 'PROTECTION' && (
            <div className="space-y-8">
              <div className="text-center space-y-3">
                <span style={rise(0)} className="block text-[10px] font-black tracking-[0.3em] text-gold-300">
                  خزنة الوصفات
                </span>
                <h2
                  id={headingId}
                  ref={headingRef}
                  tabIndex={-1}
                  data-focus-silent
                  style={rise(1)}
                  className="text-2xl sm:text-4xl font-black text-slate-100 outline-none"
                >
                  سرّك ينفتح على درجات، لا مرّة وحدة
                </h2>
                <p style={rise(2)} className="text-xs sm:text-sm text-slate-400 leading-7 max-w-xl mx-auto">
                  المنشأة ما تحتاج وصفتك كاملة عشان تقيّم إذا تقدر تنتجها. لذلك الإفصاح مقسوم ثلاث
                  درجات، وكل فتح يدخل سجل التدقيق باسم ووقت.
                </p>
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                {disclosureLevels.map((item, index) => (
                  <div
                    key={item.level}
                    style={rise(3 + index)}
                    className={`glass-card rounded-3xl border p-5 space-y-3.5 ${item.accent.ring}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`w-11 h-11 rounded-2xl grid place-items-center border ${item.accent.ring} ${item.accent.fill} ${item.accent.text}`}>
                        {item.icon}
                      </span>
                      <span className="text-[9px] font-black tracking-wider text-slate-500">{item.level}</span>
                    </div>
                    <h3 className="text-sm font-black text-slate-100">{item.title}</h3>
                    <p className="text-[11px] text-slate-400 leading-6">{item.body}</p>
                  </div>
                ))}
              </div>

              <p
                style={rise(6)}
                className="flex items-center justify-center gap-2 text-[11px] text-emerald-200/80 text-center"
              >
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>المنح زمنية وتنتهي وحدها — الوصول ما يصير دائم بمجرد ما يُمنح مرة.</span>
              </p>
            </div>
          )}

          {step === 'READY' && (
            <div className="space-y-8 text-center">
              <div style={rise(0)} className="flex justify-center">
                <MajalMark size={76} withGround animated />
              </div>

              <div className="space-y-3">
                <h2
                  id={headingId}
                  ref={headingRef}
                  tabIndex={-1}
                  data-focus-silent
                  style={rise(1)}
                  className="text-2xl sm:text-4xl font-black text-slate-100 outline-none"
                >
                  {chosen ? 'جاهز نبدأ' : 'ابدأ من وين ما تحب'}
                </h2>
                <p style={rise(2)} className="text-xs sm:text-sm text-slate-400 leading-7 max-w-lg mx-auto">
                  {chosen
                    ? needsAuth
                      ? `اخترت «${chosen.title}». هذي المساحة تحتاج حساب موثّق، فنوديك لتسجيل الدخول أول.`
                      : `اخترت «${chosen.title}». نوديك مباشرة للمساحة اللي تخصك.`
                    : 'ما اخترت مسارًا، فنبدأ من السوق — أوضح مكان تشوف فيه مجال وهي تشتغل.'}
                </p>
              </div>

              <div style={rise(3)} className="grid sm:grid-cols-2 gap-3 max-w-2xl mx-auto text-right">
                <div className="glass-card rounded-2xl border border-white/10 p-4 flex items-start gap-3">
                  <span className="w-10 h-10 shrink-0 rounded-xl bg-white/5 border border-white/10 grid place-items-center text-gold-300">
                    <Command className="w-4 h-4" />
                  </span>
                  <span>
                    <span className="block text-xs font-black text-slate-100">لوحة الأوامر</span>
                    <span className="block mt-1 text-[11px] text-slate-400 leading-6">
                      اضغط <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-bold">⌘K</kbd> في أي
                      وقت للتنقل بين المساحات بالبحث.
                    </span>
                  </span>
                </div>

                <div className="glass-card rounded-2xl border border-white/10 p-4 flex items-start gap-3">
                  <span className="w-10 h-10 shrink-0 rounded-xl bg-white/5 border border-white/10 grid place-items-center text-gold-300">
                    <Compass className="w-4 h-4" />
                  </span>
                  <span>
                    <span className="block text-xs font-black text-slate-100">شريط الخطوة التالية</span>
                    <span className="block mt-1 text-[11px] text-slate-400 leading-6">
                      أعلى كل صفحة، يقترح عليك أهم إجراء الآن ويشرح سببه.
                    </span>
                  </span>
                </div>
              </div>
            </div>
          )}
        </main>

        <footer className="sticky bottom-0 shrink-0 space-y-4 -mx-4 sm:-mx-8 px-4 sm:px-8 pt-8 pb-3 bg-gradient-to-t from-ink-900 via-ink-900 via-65% to-transparent">
          {/* A segmented rail, not dots: it shows how much is left, which is the only
              honest way to ask someone to keep going. */}
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {STEPS.map((id, index) => (
              <span
                key={id}
                className={`h-1 flex-1 rounded-full transition-all duration-500 ${
                  index < stepIndex ? 'bg-gold-500/45' : index === stepIndex ? 'bg-gold-300' : 'bg-white/8'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-500 font-bold tabular-nums">
              {stepIndex + 1} / {STEPS.length}
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setStepIndex(current => Math.max(0, current - 1))}
                disabled={stepIndex === 0}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-300 border border-white/10 hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition-colors flex items-center gap-2"
              >
                <ArrowRight className="w-4 h-4" />
                <span>السابق</span>
              </button>

              {isLast ? (
                <button
                  onClick={finish}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-l from-gold-500 to-gold-300 text-slate-950 text-xs font-black flex items-center gap-2 hover:brightness-110 transition-all shadow-[0_12px_36px_rgba(199,165,91,0.22)]"
                >
                  {needsAuth ? <LogIn className="w-4 h-4" /> : null}
                  <span>{needsAuth ? 'سجّل الدخول وابدأ' : 'ادخل المنصة'}</span>
                  {!needsAuth && <ArrowLeft className="w-4 h-4" />}
                </button>
              ) : (
                <button
                  onClick={() => setStepIndex(current => Math.min(STEPS.length - 1, current + 1))}
                  className="px-6 py-2.5 rounded-xl bg-gold-500 hover:bg-gold-400 text-slate-950 text-xs font-black flex items-center gap-2 transition-colors"
                >
                  <span>{step === 'INTENT' && !intent ? 'تخطّ السؤال' : 'التالي'}</span>
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};
