import React, { useEffect, useMemo, useState } from 'react';
import {
  Sparkles,
  Building2,
  Store,
  ShieldCheck,
  Globe,
  UserCheck,
  ChevronDown,
  Bell,
  Bot,
  Crown,
  Shield,
  Factory,
  Users,
  LayoutGrid,
  Zap,
  LogIn,
  LogOut,
  LoaderCircle
} from 'lucide-react';
import { SurfaceType, User, UserRole } from '../types/majal';
import { store } from '../lib/store';
import { AI_ASSISTANT_ENABLED, INTEGRATION_SIMULATORS_ENABLED, IS_DEMO_MODE } from '../lib/runtime';
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, NotificationItem } from '../lib/notificationClient';
import { usePopoverDismiss } from '../hooks/usePopoverDismiss';

interface NavbarProps {
  activeSurface: SurfaceType;
  onSurfaceChange: (surface: SurfaceType) => void;
  activeUser: User;
  onUserChange: (user: User) => void;
  onOpenAiDrawer: () => void;
  onOpenIntegrations: () => void;
  authStatus: 'LOADING' | 'AUTHENTICATED' | 'ANONYMOUS';
  onOpenAuth: () => void;
  onLogout: () => void;
  onOpenSecurity: () => void;
}

const roleLabels: Record<UserRole, string> = {
  SUPER_ADMIN: 'سوبر أدمن المنصة',
  ADMIN: 'أدمن تشغيلي وامتثال',
  HOST_OWNER: 'مالك منشأة',
  HOST_OPERATIONS: 'إدارة التشغيل',
  HOST_CHEF: 'الشيف / تطوير المنتج',
  HOST_FINANCE: 'المالية',
  HOST_MARKETING: 'التسويق',
  HOST_SUPPORT: 'الدعم',
  CREATOR: 'مبدع',
  CONSUMER: 'عميل / جمهور'
};

const roleToSurface = (role: UserRole): SurfaceType => {
  if (role === 'SUPER_ADMIN') return 'SUPER_ADMIN';
  if (role === 'ADMIN') return 'ADMIN';
  if (role === 'CREATOR') return 'CREATOR';
  if (role.startsWith('HOST_')) return 'HOST';
  if (role === 'CONSUMER') return 'CONSUMER';
  return 'PUBLIC';
};

export const Navbar: React.FC<NavbarProps> = ({
  activeSurface,
  onSurfaceChange,
  activeUser,
  onUserChange,
  onOpenAiDrawer,
  onOpenIntegrations,
  authStatus,
  onOpenAuth,
  onLogout,
  onOpenSecurity
}) => {
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationsRef = usePopoverDismiss<HTMLDivElement>(showNotifications, () => setShowNotifications(false));
  const roleMenuRef = usePopoverDismiss<HTMLDivElement>(showRoleDropdown, () => setShowRoleDropdown(false));
  const [serverNotifications, setServerNotifications] = useState<NotificationItem[]>([]);
  const [serverUnreadCount, setServerUnreadCount] = useState(0);

  const surfaces = useMemo<{ id: SurfaceType; labelAr: string; icon: React.ReactNode }[]>(() => {
    const all: { id: SurfaceType; labelAr: string; icon: React.ReactNode }[] = [
      { id: 'PUBLIC', labelAr: 'عن مجال', icon: <Globe className="w-4 h-4" /> },
      { id: 'CONSUMER', labelAr: 'السوق', icon: <Store className="w-4 h-4" /> },
      { id: 'CREATOR', labelAr: 'المبدعون', icon: <Sparkles className="w-4 h-4" /> },
      { id: 'HOST', labelAr: 'المنشآت', icon: <Factory className="w-4 h-4" /> },
      { id: 'ADMIN', labelAr: 'الأدمن', icon: <ShieldCheck className="w-4 h-4" /> },
      { id: 'SUPER_ADMIN', labelAr: 'السوبر أدمن', icon: <Crown className="w-4 h-4" /> }
    ];

    if (activeUser.role === 'SUPER_ADMIN') return all.filter(s => ['PUBLIC', 'CONSUMER', 'ADMIN', 'SUPER_ADMIN'].includes(s.id));
    if (activeUser.role === 'ADMIN') return all.filter(s => ['PUBLIC', 'CONSUMER', 'ADMIN'].includes(s.id));
    if (activeUser.role === 'CREATOR') return all.filter(s => ['PUBLIC', 'CONSUMER', 'CREATOR'].includes(s.id));
    if (activeUser.role.startsWith('HOST_')) return all.filter(s => ['PUBLIC', 'CONSUMER', 'HOST'].includes(s.id));
    return all.filter(s => ['PUBLIC', 'CONSUMER'].includes(s.id));
  }, [activeUser.role]);

  const demoNotifications = useMemo(() => {
    const items: string[] = [];
    if (activeUser.role === 'CREATOR' && activeUser.creatorId) {
      const accessRequests = store.recipeGrants.filter(g => g.creatorId === activeUser.creatorId && g.status === 'REQUESTED').length;
      const pendingOffers = store.collaborations.filter(c => c.creatorId === activeUser.creatorId && c.currentOffer?.status === 'PENDING' && c.currentOffer.senderRole === 'HOST').length;
      const eligible = store.accruals.filter(a => a.creatorId === activeUser.creatorId && a.settlementStatus === 'SETTLEMENT_ELIGIBLE').length;
      if (accessRequests) items.push(`${accessRequests} طلب وصول للوصفة ينتظر قرارك.`);
      if (pendingOffers) items.push(`${pendingOffers} عرض تجاري جديد يحتاج مراجعتك.`);
      if (eligible) items.push(`${eligible} سجل مستحقات مؤهل لدورة التسوية القادمة.`);
    }
    if (activeUser.role.startsWith('HOST_') && activeUser.hostBusinessId) {
      const cols = store.collaborations.filter(c => c.hostBusinessId === activeUser.hostBusinessId);
      const prelaunch = cols.filter(c => c.stage === 'PRE_LAUNCH' || c.stage === 'SIGNED').length;
      const creatorOffers = cols.filter(c => c.currentOffer?.status === 'PENDING' && c.currentOffer.senderRole === 'CREATOR').length;
      if (prelaunch) items.push(`${prelaunch} تعاون قريب من الإطلاق ويحتاج إكمال Launch Gate.`);
      if (creatorOffers) items.push(`${creatorOffers} عرض مقابل من مبدع ينتظر قرار المنشأة.`);
    }
    if (activeUser.role === 'ADMIN' || activeUser.role === 'SUPER_ADMIN') {
      const disputes = store.disputes.filter(d => ['OPEN', 'UNDER_INVESTIGATION'].includes(d.status)).length;
      const expiring = store.compliance.filter(c => c.status === 'EXPIRING_SOON' || c.status === 'EXPIRED').length;
      const approvedPayments = store.settlements.filter(s => s.status === 'APPROVED').length;
      if (disputes) items.push(`${disputes} حالة نزاع أو تحقيق تحتاج متابعة.`);
      if (expiring) items.push(`${expiring} مستند امتثال يحتاج تجديدًا أو مراجعة.`);
      if (approvedPayments) items.push(`${approvedPayments} دفعة معتمدة بانتظار تأكيد الدفع الخارجي.`);
    }
    if (!items.length) items.push('لا توجد إجراءات حرجة معلقة لحسابك الآن.');
    return items.slice(0, 6);
  }, [activeUser.id, activeUser.role, store.auditLogs.length, store.recipeGrants.length, store.settlements.length]);

  const refreshServerNotifications = () => {
    if (IS_DEMO_MODE || authStatus !== 'AUTHENTICATED') return;
    fetchNotifications()
      .then(page => {
        setServerNotifications(page.items);
        setServerUnreadCount(page.unreadCount);
      })
      .catch(() => {
        setServerNotifications([]);
        setServerUnreadCount(0);
      });
  };

  useEffect(() => {
    refreshServerNotifications();
  }, [authStatus, activeUser.id]);

  const notificationCards = IS_DEMO_MODE
    ? demoNotifications.map((body, index) => ({
        id: `demo-${index}`,
        title: index === 0 ? 'الخطوة التالية' : 'للمتابعة',
        body,
        priority: index === 0 ? 'NOW' : 'WATCH',
        occurrence_count: 1,
        status: 'UNREAD'
      } as const))
    : serverNotifications;
  const unreadCount = IS_DEMO_MODE ? notificationCards.length : serverUnreadCount;

  const openNotification = async (item: typeof notificationCards[number]) => {
    if (!IS_DEMO_MODE && item.status === 'UNREAD') {
      await markNotificationRead(item.id).catch(() => undefined);
      setServerNotifications(current => current.map(entry => entry.id === item.id ? { ...entry, status: 'READ' } : entry));
      setServerUnreadCount(current => Math.max(0, current - 1));
    }
    if ('action_surface' in item && item.action_surface) {
      onSurfaceChange(item.action_surface);
      setShowNotifications(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 glass-nav text-slate-100 shadow-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20 gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => onSurfaceChange('PUBLIC')} className="flex items-center gap-3 text-right group focus:outline-none min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#c7a55b] to-[#ecd28c] flex items-center justify-center font-black text-lg text-slate-950 shadow-lg group-hover:scale-105 transition-transform">
                م
              </div>
              <div className="min-w-0">
                <span className="text-2xl font-black tracking-wide bg-gradient-to-r from-[#f4e1b0] via-[#e8c880] to-[#f7e8c6] bg-clip-text text-transparent block truncate">
                  مجال
                </span>
                <span className="block text-[11px] text-slate-400 font-medium truncate">
                  منصة الحاضن التجاري المرخّص
                </span>
              </div>
            </button>

            <span className="hidden md:inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold bg-[#c7a55b]/10 text-[#e8c880] border border-[#e8c880]/15">
              <LayoutGrid className="w-3.5 h-3.5" />
              {IS_DEMO_MODE ? 'عرض محلي آمن' : 'منصة مجال'}
            </span>
          </div>

          <nav aria-label="التنقل الرئيسي" className="hidden xl:flex items-center gap-1 glass-card p-1 rounded-2xl border border-white/10">
            {surfaces.map(s => {
              const isActive = activeSurface === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => onSurfaceChange(s.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition-all ${
                    isActive ? 'bg-[#c7a55b] text-stone-950 font-black shadow-sm' : 'text-stone-300 hover:text-stone-100 hover:bg-white/5'
                  }`}
                >
                  {s.icon}
                  <span>{s.labelAr}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2.5">
            {!IS_DEMO_MODE && authStatus === 'LOADING' && <span role="status" aria-label="جاري التحقق من الجلسة" className="p-2.5 text-slate-400"><LoaderCircle className="w-4 h-4 animate-spin" /></span>}

            {!IS_DEMO_MODE && authStatus === 'ANONYMOUS' && <button
              onClick={onOpenAuth}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#c7a55b] text-slate-950 font-black text-xs hover:bg-[#d5b76e] transition-colors"
            >
              <LogIn className="w-4 h-4" />
              <span>دخول</span>
            </button>}

            {!IS_DEMO_MODE && authStatus === 'AUTHENTICATED' && <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10">
              <span className="w-7 h-7 rounded-full bg-[#c7a55b]/20 text-[#e8c880] grid place-items-center font-black text-xs" aria-hidden="true">{activeUser.name.slice(0, 1)}</span>
              <div className="flex flex-col text-right">
                <span className="max-w-28 truncate text-[11px] font-bold text-slate-100">{activeUser.name}</span>
                <span className="text-[9px] text-[#e8c880] font-semibold">{roleLabels[activeUser.role]}</span>
              </div>
              {['SUPER_ADMIN', 'ADMIN'].includes(activeUser.role) && (
                <button
                  onClick={() => onSurfaceChange(activeUser.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'ADMIN')}
                  className="px-2 py-1 rounded-lg bg-[#c7a55b]/20 hover:bg-[#c7a55b]/30 text-[#e8c880] text-[10px] font-bold border border-[#e8c880]/30 transition cursor-pointer"
                  title="الانتقال المباشر للوحة التحكم"
                >
                  لوحة الإدارة
                </button>
              )}
              <button onClick={onOpenSecurity} className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/10 cursor-pointer" aria-label="أمان الحساب والمصادقة الثنائية"><Shield className="w-4 h-4" /></button>
              <button onClick={onLogout} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer" aria-label="تسجيل الخروج"><LogOut className="w-4 h-4" /></button>
            </div>}

            {INTEGRATION_SIMULATORS_ENABLED && <button
              onClick={onOpenIntegrations}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border border-amber-500/30 text-xs font-bold transition-colors cursor-pointer"
              title="مختبر محاكاة التكاملات المحلية"
            >
              <Zap className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">مختبر الربط</span>
            </button>}

            {AI_ASSISTANT_ENABLED && <button
              onClick={onOpenAiDrawer}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#c7a55b]/10 text-[#f4e1b0] hover:bg-[#c7a55b]/15 border border-[#e8c880]/20 text-xs font-medium transition-colors cursor-pointer"
              title="مساعد مجال الذكي"
            >
              <Bot className="w-4 h-4 text-[#e8c880]" />
              <span className="hidden sm:inline">مساعد مجال</span>
            </button>}

            {(IS_DEMO_MODE || authStatus === 'AUTHENTICATED') && <div className="relative" ref={notificationsRef}>
              <button
                onClick={() => {
                  const next = !showNotifications;
                  setShowNotifications(next);
                  if (next) {
                    setShowRoleDropdown(false);
                    refreshServerNotifications();
                  }
                }}
                className="p-2.5 rounded-xl text-stone-300 hover:text-stone-100 hover:bg-white/5 transition-colors relative"
                aria-label="فتح التنبيهات"
                aria-expanded={showNotifications}
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && <><span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#e8c880] animate-ping" /><span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#e8c880]" /></>}
              </button>

              {showNotifications && (
                <div className="absolute left-0 mt-2 w-96 max-w-[90vw] bg-[#0f172a]/95 border border-white/10 rounded-2xl shadow-2xl p-4 text-xs text-stone-200 z-50 animate-in fade-in slide-in-from-top-2">
                  <div className="font-bold pb-3 mb-3 flex justify-between items-center text-[#e8c880] border-b border-white/10">
                    <div><span className="block">مركز القرار</span><span className="text-[9px] text-stone-500 font-medium">الأهم أولاً، والمتكرر يُدمج</span></div>
                    <div className="flex items-center gap-2">
                      {!IS_DEMO_MODE && unreadCount > 0 && <button onClick={() => markAllNotificationsRead().then(() => { setServerNotifications(current => current.map(item => ({ ...item, status: 'READ' }))); setServerUnreadCount(0); }).catch(() => undefined)} className="text-[9px] text-stone-300 hover:text-white">قرأت الكل</button>}
                      <span className="text-[10px] text-stone-400">{unreadCount} غير مقروء</span>
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    {notificationCards.length ? notificationCards.map(item => (
                      <button key={item.id} onClick={() => openNotification(item)} className={`w-full p-3 rounded-xl border text-right transition-colors ${item.status === 'UNREAD' ? 'bg-white/7 border-[#e8c880]/20' : 'bg-white/[0.03] border-white/5 opacity-75'}`}>
                        <span className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-bold text-stone-100">{item.title}</span>
                          <span className={`text-[9px] px-2 py-0.5 rounded-full ${item.priority === 'URGENT' ? 'bg-rose-500/15 text-rose-200' : item.priority === 'NOW' ? 'bg-[#c7a55b]/15 text-[#f4e1b0]' : 'bg-white/5 text-stone-400'}`}>{item.priority === 'URGENT' ? 'عاجل' : item.priority === 'NOW' ? 'الآن' : item.priority === 'SOON' ? 'قريباً' : 'راقب'}</span>
                        </span>
                        <span className="block text-stone-300 leading-6">{item.body}</span>
                        {item.occurrence_count > 1 && <span className="block mt-1 text-[9px] text-stone-500">تكرر {item.occurrence_count} مرات وتم دمجه هنا</span>}
                        {'action_label' in item && item.action_label && <span className="block mt-2 text-[10px] font-bold text-[#e8c880]">{item.action_label} ←</span>}
                      </button>
                    )) : <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5 text-center text-stone-500">لا توجد قرارات معلقة الآن.</div>}
                  </div>
                </div>
              )}
            </div>}

            {IS_DEMO_MODE && <div className="relative" ref={roleMenuRef}>
              <button
                onClick={() => {
                  const next = !showRoleDropdown;
                  setShowRoleDropdown(next);
                  if (next) setShowNotifications(false);
                }}
                className="flex items-center gap-2 p-1.5 pr-2.5 rounded-2xl bg-[#0f172a]/80 hover:bg-[#162031] border border-white/10 text-xs font-medium transition-colors"
                aria-label="تبديل هوية العرض المحلية"
                aria-expanded={showRoleDropdown}
              >
                {activeUser.avatar ? <img src={activeUser.avatar} alt="" className="w-8 h-8 rounded-full object-cover ring-1 ring-[#e8c880]/50" /> : <span className="w-8 h-8 rounded-full bg-[#c7a55b]/15 text-[#e8c880] grid place-items-center font-black" aria-hidden="true">{activeUser.name.slice(0, 1)}</span>}
                <div className="text-right hidden md:block max-w-[180px]">
                  <span className="block font-bold text-stone-200 text-[11px] leading-tight truncate">{activeUser.name}</span>
                  <span className="block text-[10px] text-[#e8c880] truncate">{roleLabels[activeUser.role]}</span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-stone-400" />
              </button>

              {showRoleDropdown && (
                <div role="menu" aria-label="تبديل هوية العرض المحلية" className="absolute left-0 mt-2 w-80 max-w-[90vw] bg-[#0f172a]/96 border border-white/10 rounded-2xl shadow-2xl p-2 z-50 text-xs text-stone-200 max-h-[70vh] overflow-y-auto">
                  <div className="px-2 py-2 text-[10px] text-stone-400 font-bold uppercase tracking-wider border-b border-white/10 mb-1">
                    تبديل أدوار العرض — Creator / Host / Admin / Super Admin
                  </div>
                  {store.users.map(u => (
                    <button
                      key={u.id}
                      disabled={u.status === 'SUSPENDED'}
                      onClick={() => {
                        onUserChange(u);
                        onSurfaceChange(roleToSurface(u.role));
                        setShowRoleDropdown(false);
                      }}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl text-right transition-colors ${u.status === 'SUSPENDED' ? 'opacity-40 cursor-not-allowed' : ''} ${
                        activeUser.id === u.id ? 'bg-[#c7a55b]/15 text-[#f4e1b0] font-bold border border-[#e8c880]/15' : 'hover:bg-white/5 text-stone-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {u.avatar ? <img src={u.avatar} alt="" className="w-8 h-8 rounded-full object-cover" /> : <span className="w-8 h-8 rounded-full bg-white/5 grid place-items-center font-black" aria-hidden="true">{u.name.slice(0, 1)}</span>}
                        <div className="min-w-0 text-right">
                          <span className="block text-[11px] font-medium truncate">{u.name}</span>
                          <span className="block text-[10px] text-stone-400 truncate">{roleLabels[u.role]}{u.status === 'SUSPENDED' ? ' — موقوف' : ''}</span>
                        </div>
                      </div>
                      {activeUser.id === u.id ? <UserCheck className="w-4 h-4 text-[#e8c880]" /> : <Users className="w-4 h-4 text-stone-500" />}
                    </button>
                  ))}
                </div>
              )}
            </div>}
          </div>
        </div>

        <div className="xl:hidden flex items-center gap-2 overflow-x-auto py-3 border-t border-white/10 text-xs no-scrollbar">
          {surfaces.map(s => {
            const isActive = activeSurface === s.id;
            return (
              <button
                key={s.id}
                onClick={() => onSurfaceChange(s.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl whitespace-nowrap text-[11px] font-medium ${
                  isActive ? 'bg-[#c7a55b] text-stone-950 font-black' : 'bg-white/5 text-stone-300'
                }`}
              >
                {s.icon}
                <span>{s.labelAr}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
