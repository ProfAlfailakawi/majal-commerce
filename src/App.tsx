import React, { lazy, Suspense, useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { PublicLanding } from './components/public/PublicLanding';
import { ConsumerDashboard } from './components/consumer/ConsumerDashboard';
import { store } from './lib/store';
import { SurfaceType } from './types/majal';
import { canAccessSurface } from './lib/permissions';
import { Bot, Sparkles } from 'lucide-react';
import { AppErrorBoundary } from './components/common/AppErrorBoundary';
import { AI_ASSISTANT_ENABLED, INTEGRATION_SIMULATORS_ENABLED, IS_DEMO_MODE } from './lib/runtime';
import { AuthSession, logout, restoreAuthSession } from './lib/authClient';
import { ExperienceGuide } from './components/common/ExperienceGuide';
import { ConnectionSentinel } from './components/common/ConnectionSentinel';

const CreatorPortal = lazy(() => import('./components/creator/CreatorPortal').then(module => ({ default: module.CreatorPortal })));
const HostPortal = lazy(() => import('./components/host/HostPortal').then(module => ({ default: module.HostPortal })));
const AdminDashboard = lazy(() => import('./components/admin/AdminDashboard').then(module => ({ default: module.AdminDashboard })));
const SuperAdminDashboard = lazy(() => import('./components/admin/SuperAdminDashboard').then(module => ({ default: module.SuperAdminDashboard })));
const AiAssistantDrawer = lazy(() => import('./components/common/AiAssistantDrawer').then(module => ({ default: module.AiAssistantDrawer })));
const IntegrationHubModal = lazy(() => import('./components/common/IntegrationHubModal').then(module => ({ default: module.IntegrationHubModal })));
const AuthModal = lazy(() => import('./components/common/AuthModal').then(module => ({ default: module.AuthModal })));
const AccountSecurityModal = lazy(() => import('./components/common/AccountSecurityModal').then(module => ({ default: module.AccountSecurityModal })));

const SurfaceFallback = () => <div role="status" className="max-w-7xl mx-auto px-4 py-16 text-center text-xs text-stone-400">جاري تحميل مساحة العمل…</div>;

export default function App() {
  const [, setTick] = useState(0);
  useEffect(() => store.subscribe(() => setTick(t => t + 1)), []);

  const [activeSurface, setActiveSurface] = useState<SurfaceType>(store.activeSurface || 'PUBLIC');
  const [showAiDrawer, setShowAiDrawer] = useState(false);
  const [showIntegrations, setShowIntegrations] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const [authStatus, setAuthStatus] = useState<'LOADING' | 'AUTHENTICATED' | 'ANONYMOUS'>(IS_DEMO_MODE ? 'AUTHENTICATED' : 'LOADING');

  useEffect(() => {
    if (IS_DEMO_MODE) return;
    let active = true;
    restoreAuthSession()
      .then(session => {
        if (!active) return;
        if (session && store.setAuthenticatedUser(session.user)) {
          const surface = surfaceForRole(session.user.role);
          setAuthStatus('AUTHENTICATED');
          setActiveSurface(surface);
          store.setSurface(surface);
        } else {
          setAuthStatus('ANONYMOUS');
        }
      })
      .catch(() => active && setAuthStatus('ANONYMOUS'));
    return () => { active = false; };
  }, []);

  const surfaceForRole = (role: string): SurfaceType => {
    if (role === 'SUPER_ADMIN') return 'SUPER_ADMIN';
    if (role === 'ADMIN') return 'ADMIN';
    if (role === 'CREATOR') return 'CREATOR';
    if (role.startsWith('HOST_')) return 'HOST';
    return 'CONSUMER';
  };

  const handleAuthenticated = (session: AuthSession) => {
    if (!store.setAuthenticatedUser(session.user)) return;
    const surface = surfaceForRole(session.user.role);
    setAuthStatus('AUTHENTICATED');
    setActiveSurface(surface);
    store.setSurface(surface);
  };

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      store.clearAuthenticatedUser();
      setAuthStatus('ANONYMOUS');
      setActiveSurface('PUBLIC');
    }
  };

  const handleSurfaceChange = (surface: SurfaceType) => {
    if (!canAccessSurface(store.activeUser, surface)) {
      setActiveSurface('PUBLIC');
      store.setSurface('PUBLIC');
      return;
    }
    setActiveSurface(surface);
    store.setSurface(surface);
  };

  return (
    <AppErrorBoundary>
    <div dir="rtl" className="min-h-screen text-slate-100 font-sans selection:bg-[#c7a55b] selection:text-slate-950 flex flex-col justify-between relative overflow-x-hidden">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:right-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-xl focus:bg-[#c7a55b] focus:text-stone-950 focus:font-black">
        انتقل إلى المحتوى الرئيسي
      </a>
      <div className="fixed inset-0 pointer-events-none opacity-60">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:48px_48px]" />
        <div className="absolute -top-40 right-0 w-[34rem] h-[34rem] bg-[#c7a55b]/12 rounded-full blur-[140px]" />
        <div className="absolute top-1/3 -left-20 w-[28rem] h-[28rem] bg-[#4b6aa3]/12 rounded-full blur-[140px]" />
        <div className="absolute -bottom-24 right-1/3 w-[30rem] h-[30rem] bg-[#7a4d7f]/10 rounded-full blur-[140px]" />
      </div>

      <div className="relative z-10 flex-1 flex flex-col">
        <Navbar
          activeSurface={activeSurface}
          onSurfaceChange={handleSurfaceChange}
          activeUser={store.activeUser}
          onUserChange={(user) => store.setUser(user)}
          onOpenAiDrawer={() => setShowAiDrawer(true)}
          onOpenIntegrations={() => setShowIntegrations(true)}
          authStatus={authStatus}
          onOpenAuth={() => setShowAuth(true)}
          onLogout={handleLogout}
          onOpenSecurity={() => setShowSecurity(true)}
        />

        <ExperienceGuide activeSurface={activeSurface} onSurfaceChange={handleSurfaceChange} />

        <main id="main-content" tabIndex={-1} className="animate-in fade-in duration-300 flex-1 pb-10 outline-none">
          <Suspense fallback={<SurfaceFallback />}>
            {activeSurface === 'PUBLIC' && <PublicLanding onSurfaceChange={handleSurfaceChange} />}
            {activeSurface === 'CONSUMER' && <ConsumerDashboard onSurfaceChange={handleSurfaceChange} />}
            {activeSurface === 'CREATOR' && <CreatorPortal />}
            {activeSurface === 'HOST' && <HostPortal />}
            {activeSurface === 'ADMIN' && <AdminDashboard />}
            {activeSurface === 'SUPER_ADMIN' && <SuperAdminDashboard />}
          </Suspense>
        </main>
      </div>

      {AI_ASSISTANT_ENABLED && <div className="fixed bottom-6 left-6 z-40">
        <button
          onClick={() => setShowAiDrawer(true)}
          className="px-4 py-3 bg-gradient-to-r from-[#c7a55b] to-[#e0c57d] hover:from-[#d9b86b] hover:to-[#ecd48b] text-stone-950 font-black rounded-full shadow-2xl transition-transform hover:scale-105 flex items-center gap-2 text-xs border border-[#f3dfaf]/30"
          aria-label="فتح مساعد مجال الذكي"
        >
          <Bot className="w-5 h-5 text-stone-950" />
          <span className="hidden sm:inline">مساعد مجال الذكي</span>
          <Sparkles className="w-3.5 h-3.5 text-stone-950" />
        </button>
      </div>}

      <Suspense fallback={null}>
        {AI_ASSISTANT_ENABLED && showAiDrawer && <AiAssistantDrawer isOpen onClose={() => setShowAiDrawer(false)} />}
        {INTEGRATION_SIMULATORS_ENABLED && showIntegrations && <IntegrationHubModal isOpen onClose={() => setShowIntegrations(false)} />}
        {!IS_DEMO_MODE && showAuth && <AuthModal isOpen onClose={() => setShowAuth(false)} onAuthenticated={handleAuthenticated} />}
        {!IS_DEMO_MODE && authStatus === 'AUTHENTICATED' && showSecurity && <AccountSecurityModal isOpen onClose={() => setShowSecurity(false)} />}
      </Suspense>

      <Footer onSurfaceChange={handleSurfaceChange} />
      <ConnectionSentinel />
    </div>
    </AppErrorBoundary>
  );
}
