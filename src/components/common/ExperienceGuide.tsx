import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  Command,
  Compass,
  Crown,
  Gauge,
  Globe,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Store as StoreIcon,
  X
} from 'lucide-react';
import { store } from '../../lib/store';
import { canAccessSurface, roleLabel } from '../../lib/permissions';
import { SurfaceType } from '../../types/majal';
import { useDialogBehavior } from '../../hooks/useDialogBehavior';

type ExperienceMode = 'SIMPLE' | 'GUIDED' | 'EXPERT';

interface ExperienceGuideProps {
  activeSurface: SurfaceType;
  onSurfaceChange: (surface: SurfaceType) => void;
}

const surfaceMeta: Record<SurfaceType, { label: string; icon: React.ReactNode; keywords: string }> = {
  PUBLIC: { label: 'عن مجال', icon: <Globe className="w-4 h-4" />, keywords: 'الرئيسية معلومات home public' },
  CONSUMER: { label: 'السوق والإطلاقات', icon: <StoreIcon className="w-4 h-4" />, keywords: 'سوق شراء منتجات consumer market' },
  CREATOR: { label: 'مساحة المبدع', icon: <Sparkles className="w-4 h-4" />, keywords: 'مبدع منتج وصفة creator product recipe' },
  HOST: { label: 'مساحة المنشأة', icon: <Building2 className="w-4 h-4" />, keywords: 'منشأة مصنع مطعم host factory' },
  ADMIN: { label: 'مركز العمليات', icon: <ShieldCheck className="w-4 h-4" />, keywords: 'ادمن امتثال نزاعات admin compliance' },
  SUPER_ADMIN: { label: 'مركز القيادة', icon: <Crown className="w-4 h-4" />, keywords: 'سوبر سياسة مستخدمين super admin policy' }
};

const preferredModeKey = 'majal_experience_mode_v1';

function deriveNextMove(activeSurface: SurfaceType) {
  const user = store.activeUser;
  if (user.role === 'CREATOR' && user.creatorId) {
    const profile = store.creators.find(item => item.id === user.creatorId);
    const accessRequests = store.recipeGrants.filter(item => item.creatorId === user.creatorId && item.status === 'REQUESTED').length;
    const pendingOffers = store.collaborations.filter(item => item.creatorId === user.creatorId && item.currentOffer?.status === 'PENDING' && item.currentOffer.senderRole === 'HOST').length;
    if (accessRequests) return { eyebrow: 'قرار يحمي أصولك', title: `راجع ${accessRequests} طلب وصول`, reason: 'الطلب ينتظر قرارك قبل أن يرى الطرف الآخر تفاصيل إضافية.', action: 'راجع الآن', surface: 'CREATOR' as SurfaceType, signal: accessRequests };
    if (pendingOffers) return { eyebrow: 'فرصة تجارية', title: `لديك ${pendingOffers} عرض ينتظر الرد`, reason: 'فتح العرض الآن أقصر طريق لنقل المنتج إلى الاتفاق.', action: 'افتح الصفقة', surface: 'CREATOR' as SurfaceType, signal: pendingOffers };
    if (profile && profile.completionScore < 90) return { eyebrow: 'ارفع فرص المطابقة', title: 'أكمل جواز المبدع', reason: `اكتماله الحالي ${profile.completionScore}%؛ البيانات الناقصة تقلل جودة المطابقة.`, action: 'أكمل الجواز', surface: 'CREATOR' as SurfaceType, signal: profile.completionScore };
    if (!store.products.some(item => item.creatorId === user.creatorId)) return { eyebrow: 'ابدأ من هنا', title: 'حوّل فكرتك إلى منتج', reason: 'مسار قصير يحفظ الوصفة ويجهزها للمطابقة دون كشف السر.', action: 'أنشئ منتجاً', surface: 'CREATOR' as SurfaceType, signal: 0 };
    return { eyebrow: 'أفضل خطوة الآن', title: 'افحص فرص المطابقة الجديدة', reason: 'رتّب الفرص حسب ملاءمة القدرة والهامش قبل بدء أي تفاوض.', action: 'افتح الفرص', surface: 'CREATOR' as SurfaceType, signal: store.matches.length };
  }

  if (user.role.startsWith('HOST_') && user.hostBusinessId) {
    const complianceIssues = store.compliance.filter(item => item.hostBusinessId === user.hostBusinessId && ['EXPIRED', 'EXPIRING_SOON'].includes(item.status)).length;
    const pendingLaunches = store.collaborations.filter(item => item.hostBusinessId === user.hostBusinessId && ['SIGNED', 'PRE_LAUNCH'].includes(item.stage)).length;
    const creatorOffers = store.collaborations.filter(item => item.hostBusinessId === user.hostBusinessId && item.currentOffer?.status === 'PENDING' && item.currentOffer.senderRole === 'CREATOR').length;
    if (complianceIssues) return { eyebrow: 'يحمي الإطلاق', title: `عالج ${complianceIssues} مستند امتثال`, reason: 'المستند الناقص قد يوقف بوابة الإطلاق حتى لو كان المنتج جاهزاً.', action: 'راجع الجاهزية', surface: 'HOST' as SurfaceType, signal: complianceIssues };
    if (pendingLaunches) return { eyebrow: 'أقرب قيمة للإيراد', title: `أكمل ${pendingLaunches} بوابة إطلاق`, reason: 'هذه التعاونات تجاوزت التفاوض؛ إغلاق المتطلبات ينقلها إلى السوق.', action: 'أكمل الإطلاق', surface: 'HOST' as SurfaceType, signal: pendingLaunches };
    if (creatorOffers) return { eyebrow: 'قرار ينتظرك', title: `راجع ${creatorOffers} عرض مقابل`, reason: 'الرد السريع يحافظ على زخم الصفقة ويقلل دورة التفاوض.', action: 'راجع العرض', surface: 'HOST' as SurfaceType, signal: creatorOffers };
    return { eyebrow: 'أفضل خطوة الآن', title: 'اكتشف منتجاً مناسباً لقدراتك', reason: 'ابدأ من القدرة التشغيلية والهامش، ثم افتح الوصفة بالمستوى اللازم فقط.', action: 'افتح الاكتشاف', surface: 'HOST' as SurfaceType, signal: store.matches.length };
  }

  if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
    const openDisputes = store.disputes.filter(item => ['OPEN', 'UNDER_INVESTIGATION'].includes(item.status)).length;
    const complianceIssues = store.compliance.filter(item => ['EXPIRED', 'EXPIRING_SOON'].includes(item.status)).length;
    if (openDisputes) return { eyebrow: 'أعلى مخاطرة الآن', title: `احسم ${openDisputes} حالة نزاع`, reason: 'رتّبتها مجال حسب أثرها على المستخدم والإطلاق، لا حسب وقت وصولها فقط.', action: 'افتح الحالات', surface: 'ADMIN' as SurfaceType, signal: openDisputes };
    if (complianceIssues) return { eyebrow: 'منع استباقي', title: `تابع ${complianceIssues} وثيقة امتثال`, reason: 'المعالجة المبكرة تمنع توقف الإطلاقات في آخر لحظة.', action: 'راجع الامتثال', surface: 'ADMIN' as SurfaceType, signal: complianceIssues };
    if (user.role === 'SUPER_ADMIN') return { eyebrow: 'نبض المنصة', title: 'راجع الجاهزية والسياسة', reason: 'ابدأ بالاختناق الذي يؤثر في أكبر عدد من الصفقات قبل تعديل أي سياسة.', action: 'افتح القيادة', surface: 'SUPER_ADMIN' as SurfaceType, signal: store.users.length };
    return { eyebrow: 'المنصة مستقرة', title: 'راجع سجل التدقيق الاستثنائي', reason: 'لا توجد حالة حرجة؛ ركز على الأنماط غير المعتادة بدلاً من كل الأحداث.', action: 'افتح العمليات', surface: 'ADMIN' as SurfaceType, signal: store.auditLogs.length };
  }

  const liveLaunches = store.launches.filter(item => item.status === 'LIVE' || item.status === 'PERMANENT').length;
  return activeSurface === 'CONSUMER'
    ? { eyebrow: 'اكتشاف بدون ضجيج', title: liveLaunches ? `استكشف ${liveLaunches} إطلاق متاح` : 'كن أول من يعرف الإطلاق القادم', reason: liveLaunches ? 'المنتجات الحية فقط؛ لا بطاقات وهمية ولا وعود غير متاحة.' : 'لا يوجد إطلاق حي الآن، لذلك لن نطلب منك البحث في سوق فارغ.', action: 'استكشف السوق', surface: 'CONSUMER' as SurfaceType, signal: liveLaunches }
    : { eyebrow: 'أقصر طريق للفهم', title: 'شاهد الرحلة من الابتكار إلى السوق', reason: 'ابدأ بصرياً، ثم انتقل للمساحة التي تخصك عندما تكون جاهزاً.', action: 'ابدأ من السوق', surface: 'CONSUMER' as SurfaceType, signal: 6 };
}

const CommandPalette: React.FC<{ open: boolean; onClose: () => void; onSurfaceChange: (surface: SurfaceType) => void }> = ({ open, onClose, onSurfaceChange }) => {
  const dialogRef = useDialogBehavior<HTMLDivElement>(open, onClose);
  const [query, setQuery] = useState('');
  const actions = useMemo(() => Object.entries(surfaceMeta)
    .filter(([surface]) => canAccessSurface(store.activeUser, surface as SurfaceType))
    .map(([surface, meta]) => ({ surface: surface as SurfaceType, ...meta })), [store.activeUser.id, store.activeUser.role]);
  const normalized = query.trim().toLowerCase();
  const filtered = actions.filter(item => !normalized || `${item.label} ${item.keywords}`.toLowerCase().includes(normalized));
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] bg-slate-950/80 backdrop-blur-md flex items-start justify-center p-4 pt-[12vh]" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="command-title" className="w-full max-w-xl glass-panel rounded-[28px] border border-white/10 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 p-4 border-b border-white/10">
          <Search className="w-5 h-5 text-gold-300" />
          <label htmlFor="majal-command-search" id="command-title" className="sr-only">ابحث عن وجهتك أو المهمة</label>
          <input id="majal-command-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="اكتب: السوق، وصفة، امتثال، قيادة…" className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 outline-none" />
          <button onClick={onClose} aria-label="إغلاق الأوامر" className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-2 max-h-[55vh] overflow-y-auto">
          {filtered.map(item => <button key={item.surface} onClick={() => { onSurfaceChange(item.surface); onClose(); }} className="w-full flex items-center justify-between gap-3 p-3.5 rounded-2xl text-right hover:bg-white/5 transition-colors">
            <span className="flex items-center gap-3"><span className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 grid place-items-center text-gold-300">{item.icon}</span><span><span className="block text-sm font-bold text-slate-100">{item.label}</span><span className="block text-[10px] text-slate-500 mt-1">متاح لدور {roleLabel(store.activeUser.role)}</span></span></span>
            <ArrowLeft className="w-4 h-4 text-slate-500" />
          </button>)}
          {!filtered.length && <div className="p-8 text-center text-sm text-slate-500">لا توجد وجهة متاحة بهذه العبارة.</div>}
        </div>
      </div>
    </div>
  );
};

export const ExperienceGuide: React.FC<ExperienceGuideProps> = ({ activeSurface, onSurfaceChange }) => {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mode, setMode] = useState<ExperienceMode>(() => {
    if (typeof window === 'undefined') return 'GUIDED';
    const saved = sessionStorage.getItem(preferredModeKey);
    return saved === 'SIMPLE' || saved === 'EXPERT' ? saved : 'GUIDED';
  });
  const nextMove = deriveNextMove(activeSurface);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(current => !current);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    if (!store.guardNotice) return;
    const timer = window.setTimeout(() => store.dismissGuardNotice(), 6_000);
    return () => window.clearTimeout(timer);
  }, [store.guardNotice?.occurredAt]);

  const cycleMode = () => {
    const next = mode === 'SIMPLE' ? 'GUIDED' : mode === 'GUIDED' ? 'EXPERT' : 'SIMPLE';
    setMode(next);
    sessionStorage.setItem(preferredModeKey, next);
  };

  return (
    <>
      <section aria-label="التوجيه الذكي" className="relative z-20 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-5">
        <div className="glass-card rounded-2xl border border-white/10 px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xl">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <span className="w-10 h-10 shrink-0 rounded-xl bg-gold-500/15 border border-gold-300/20 grid place-items-center text-gold-300"><Compass className="w-5 h-5" /></span>
            <div className="min-w-0">
              <span className="block text-[9px] font-black tracking-wide text-gold-300 uppercase">{nextMove.eyebrow}</span>
              <span className="block text-sm font-black text-slate-100 truncate">{nextMove.title}</span>
              {mode !== 'SIMPLE' && <span className="block text-[10px] text-slate-400 mt-1 leading-5">{nextMove.reason}</span>}
              {mode === 'EXPERT' && <span className="inline-flex mt-1 text-[9px] text-sky-300">إشارة السياق: {nextMove.signal} · السطح الحالي: {surfaceMeta[activeSurface].label}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={cycleMode} className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-white" aria-label={`تغيير مستوى التفاصيل، الحالي ${mode}`} title="مبسّط / موجّه / خبير"><Gauge className="w-4 h-4" /></button>
            <button onClick={() => setPaletteOpen(true)} className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-white text-[10px] font-bold flex items-center gap-2"><Command className="w-4 h-4" /><span>⌘K</span></button>
            <button onClick={() => onSurfaceChange(nextMove.surface)} className="px-4 py-2.5 rounded-xl bg-gold-500 text-slate-950 text-xs font-black flex items-center gap-2 hover:bg-gold-400"><span>{nextMove.action}</span><ArrowLeft className="w-4 h-4" /></button>
          </div>
        </div>
      </section>

      {store.guardNotice && <div role="alert" aria-live="assertive" className="fixed bottom-5 right-5 z-[95] w-[min(420px,calc(100vw-2.5rem))] rounded-2xl bg-ink-600/98 border border-rose-400/25 shadow-2xl p-4 flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-300 grid place-items-center shrink-0"><ShieldAlert className="w-5 h-5" /></span>
        <div className="flex-1"><span className="block text-xs font-black text-slate-100">منعت مجال هذه الخطوة</span><span className="block mt-1 text-[11px] leading-6 text-slate-300">{store.guardNotice.message}</span></div>
        <button onClick={() => store.dismissGuardNotice()} aria-label="إغلاق سبب المنع" className="p-1.5 text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
      </div>}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onSurfaceChange={onSurfaceChange} />
    </>
  );
};
