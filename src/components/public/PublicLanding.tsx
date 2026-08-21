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

interface PublicLandingProps {
  onSurfaceChange: (surface: SurfaceType) => void;
}

export const PublicLanding: React.FC<PublicLandingProps> = ({ onSurfaceChange }) => {
  const openDemoRole = (role: UserRole, surface: SurfaceType) => {
    if (!IS_DEMO_MODE) return;
    const user = store.users.find(u => u.role === role && u.status !== 'SUSPENDED');
    if (user) store.setUser(user);
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
      <div className="glass-panel rounded-[32px] p-8 sm:p-12 relative overflow-hidden text-center sm:text-right border border-white/10 shadow-2xl">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-[#c7a55b]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-[#4b6aa3]/10 rounded-full blur-3xl pointer-events-none" />

        <aside aria-label="رحلة مجال المختصرة" className="hidden xl:grid absolute left-10 top-1/2 -translate-y-1/2 w-64 grid-cols-2 gap-3">
          {[
            { icon: <Sparkles className="w-6 h-6" />, label: 'ابتكار', tone: 'text-[#e8c880]' },
            { icon: <Lock className="w-6 h-6" />, label: 'حماية', tone: 'text-fuchsia-300' },
            { icon: <Building2 className="w-6 h-6" />, label: 'إنتاج', tone: 'text-sky-300' },
            { icon: <Store className="w-6 h-6" />, label: 'إطلاق', tone: 'text-emerald-300' }
          ].map(item => (
            <div key={item.label} className="aspect-square rounded-3xl bg-slate-950/45 border border-white/10 grid place-items-center text-center shadow-xl">
              <div><span className={`w-12 h-12 mx-auto rounded-2xl bg-white/5 border border-white/10 grid place-items-center ${item.tone}`}>{item.icon}</span><span className="block mt-2 text-xs font-black text-stone-200">{item.label}</span></div>
            </div>
          ))}
        </aside>

        <div className="relative z-10 max-w-4xl xl:mr-auto xl:ml-[19rem] space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full glass-card border border-[#e8c880]/20 text-[#e8c880] text-xs font-semibold">
            <LayoutPanelTop className="w-4 h-4" />
            <span>مجال — منصة تشغيل الشراكات التجارية بين المبدعين والمنشآت المرخّصة</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black text-slate-100 leading-tight">
            حوّل الموهبة إلى <span className="bg-gradient-to-r from-[#f4e1b0] via-[#e8c880] to-[#f7e8c6] bg-clip-text text-transparent">منتج تجاري حقيقي</span>{' '}
            <br className="hidden sm:block" />
            داخل منظومة احترافية واضحة الصلاحيات
          </h1>

          <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-3xl">
            مسار واحد بصري وواضح: ابتكار، حماية، مطابقة، اختبار، اتفاق، ثم إطلاق عبر منشأة مرخّصة.
          </p>

          {IS_DEMO_MODE ? <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 pt-4">
            <button
              onClick={() => openDemoRole('CREATOR', 'CREATOR')}
              className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-[#c7a55b] to-[#dfc377] hover:from-[#d4b86b] hover:to-[#e9cf84] text-slate-950 font-black text-sm shadow-xl hover:shadow-[#c7a55b]/20 transition-all flex items-center gap-2"
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
            <button onClick={() => onSurfaceChange('CONSUMER')} className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-[#c7a55b] to-[#dfc377] text-slate-950 font-black text-sm shadow-xl flex items-center gap-2">
              <Store className="w-4 h-4" /> استكشف السوق
            </button>
            <span className="px-4 py-3 rounded-2xl bg-emerald-500/5 border border-emerald-400/15 text-emerald-200 text-xs flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> بوابات التشغيل لا تظهر إلا بعد مصادقة الحساب
            </span>
          </div>}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {stats.map((st, i) => (
          <div key={i} className="glass-card rounded-2xl p-6 border border-white/10 text-center space-y-2 hover:-translate-y-1 transition-transform">
            <div className="text-2xl sm:text-3xl font-black text-[#e8c880]">{st.value}</div>
            <div className="text-xs text-slate-300 font-medium leading-6">{st.label}</div>
          </div>
        ))}
      </div>

      <div className="space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-black text-slate-100">كيف تعمل رحلة «مجال»؟</h2>
            <p className="text-xs text-slate-400">ست محطات مرئية، بلا تعقيد</p>
        </div>

        <div className="grid md:grid-cols-4 gap-6">
          <div className="glass-card rounded-2xl p-6 border border-white/10 space-y-4">
            <div className="w-12 h-12 rounded-xl bg-[#c7a55b]/10 border border-[#e8c880]/20 flex items-center justify-center text-[#e8c880]">
              <Lock className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-100 text-base">١. المبدع</h3>
            <p className="text-xs text-slate-300 leading-relaxed">ابتكار ووصفة محمية</p>
          </div>

          <div className="glass-card rounded-2xl p-6 border border-white/10 space-y-4">
            <div className="w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-400/20 flex items-center justify-center text-sky-300">
              <Building2 className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-100 text-base">٢. المنشأة</h3>
            <p className="text-xs text-slate-300 leading-relaxed">اختبار وإنتاج مرخّص</p>
          </div>

          <div className="glass-card rounded-2xl p-6 border border-white/10 space-y-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-400/20 flex items-center justify-center text-emerald-300">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-100 text-base">٣. الأدمن</h3>
            <p className="text-xs text-slate-300 leading-relaxed">امتثال وعمليات</p>
          </div>

          <div className="glass-card rounded-2xl p-6 border border-white/10 space-y-4">
            <div className="w-12 h-12 rounded-xl bg-fuchsia-500/10 border border-fuchsia-400/20 flex items-center justify-center text-fuchsia-300">
              <Crown className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-100 text-base">٤. السوبر أدمن</h3>
            <p className="text-xs text-slate-300 leading-relaxed">حوكمة بلا كشف الأسرار</p>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {[
          { icon: <Users className="w-5 h-5" />, title: 'فصل الأدوار', body: 'كل طرف يرى ما يخصه فقط، حتى داخل المنشأة نفسها توجد صلاحيات مختلفة للمالك، الشيف، المالية، والتسويق.' },
          { icon: <Coins className="w-5 h-5" />, title: 'مستحقات شفافة', body: 'المبدع يتابع مبيعاته ومستحقاته، والمنشأة تتابع الهوامش والإطلاقات، والأدمن يراقب دورة التسوية.' },
          { icon: <Store className="w-5 h-5" />, title: 'سوق قابل للتوسع', body: 'المنصة تبدأ بالطعام، لكن بنيتها تصلح لاحقًا لقطاعات أخرى مع نفس منطق الحاضن التجاري.' }
        ].map((item, idx) => (
          <div key={idx} className="glass-card rounded-2xl p-6 border border-white/10 space-y-4">
            <div className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-[#e8c880]">{item.icon}</div>
            <h3 className="font-bold text-slate-100 text-base">{item.title}</h3>
            <p className="text-xs text-slate-300 leading-7">{item.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
