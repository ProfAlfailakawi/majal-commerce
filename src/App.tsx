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
import { OnboardingExperience } from './components/onboarding/OnboardingExperience';
import { OnboardingIntent, hasSeenOnboarding, markOnboardingSeen } from './lib/onboarding';

const CreatorPortal = lazy(() => import('./components/creator/CreatorPortal').then(module => ({ default: module.CreatorPortal })));
const HostPortal = lazy(() => import('./components/host/HostPortal').then(module => ({ default: module.HostPortal })));
const AdminDashboard = lazy(() => import('./components/admin/AdminDashboard').then(module => ({ default: module.AdminDashboard })));
const SuperAdminDashboard = lazy(() => import('./components/admin/SuperAdminDashboard').then(module => ({ default: module.SuperAdminDashboard })));
const AiAssistantDrawer = lazy(() => import('./components/common/AiAssistantDrawer').then(module => ({ default: module.AiAssistantDrawer })));
const IntegrationHubModal = lazy(() => import('./components/common/IntegrationHubModal').then(module => ({ default: module.IntegrationHubModal })));
const AuthModal = lazy(() => import('./components/common/AuthModal').then(module => ({ default: module.AuthModal })));
const AccountSecurityModal = lazy(() => import('./components/common/AccountSecurityModal').then(module => ({ default: module.AccountSecurityModal })));

import { SurfaceFallback } from './components/common/SurfaceFallback';
import type { LegalDocumentId } from './components/legal/LegalCenter';

const LegalCenter = lazy(() => import('./components/legal/LegalCenter').then(module => ({ default: module.LegalCenter })));

export default function App() {
  const [, setTick] = useState(0);
  useEffect(() => store.subscribe(() => setTick(t => t + 1)), []);

  const [activeSurface, setActiveSurface] = useState<SurfaceType>(store.activeSurface || 'PUBLIC');
  const [showAiDrawer, setShowAiDrawer] = useState(false);
  const [showIntegrations, setShowIntegrations] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const [authStatus, setAuthStatus] = useState<'LOADING' | 'AUTHENTICATED' | 'ANONYMOUS'>(IS_DEMO_MODE ? 'AUTHENTICATED' : 'LOADING');
  // The legal surface sits outside the role/permission surfaces on purpose: it is public,
  // has no permission model, and must stay reachable from every state of the app.
  const [legalDocument, setLegalDocument] = useState<LegalDocumentId | null>(null);

  // The first-run introduction. It is held back until the session question is settled:
  // opening it over a still-resolving auth state would show a returning operator the
  // "who are you" screen for a moment before their own portal appears.
  const [showOnboarding, setShowOnboarding] = useState(false);
  useEffect(() => {
    if (authStatus === 'LOADING') return;
    if (hasSeenOnboarding()) return;
    setShowOnboarding(true);
  }, [authStatus]);

  const closeOnboarding = (intent: OnboardingIntent | null, skipped: boolean) => {
    markOnboardingSeen(intent, skipped);
    setShowOnboarding(false);
  };

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
      setLegalDocument(null);
    }
  };

  const handleOpenLegal = (document: LegalDocumentId) => {
    setLegalDocument(document);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSurfaceChange = (surface: SurfaceType) => {
    setLegalDocument(null);
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
    <div dir="rtl" className="min-h-screen text-slate-100 font-sans selection:bg-gold-500 selection:text-slate-950 flex flex-col justify-between relative overflow-x-hidden">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:right-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-xl focus:bg-gold-500 focus:text-slate-950 focus:font-black">
        انتقل إلى المحتوى الرئيسي
      </a>
      {/* The ambient field is drawn entirely by .ambient-bg's own background gradients —
          see src/index.css. It has no children on purpose: the nested opacity wrapper and
          blurred circles this replaced were what every glass panel had to sample as its
          backdrop on each scroll. */}
      <div className="ambient-bg" aria-hidden="true" />

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
            {legalDocument ? <LegalCenter initialDocument={legalDocument} onBack={() => setLegalDocument(null)} /> : <>
              {activeSurface === 'PUBLIC' && <PublicLanding onSurfaceChange={handleSurfaceChange} />}
              {activeSurface === 'CONSUMER' && <ConsumerDashboard onSurfaceChange={handleSurfaceChange} />}
              {activeSurface === 'CREATOR' && <CreatorPortal />}
              {activeSurface === 'HOST' && <HostPortal />}
              {activeSurface === 'ADMIN' && <AdminDashboard />}
              {activeSurface === 'SUPER_ADMIN' && <SuperAdminDashboard />}
            </>}
          </Suspense>
        </main>
      </div>

      {AI_ASSISTANT_ENABLED && <div className="fixed bottom-6 left-6 z-40">
        <button
          onClick={() => setShowAiDrawer(true)}
          className="px-4 py-3 bg-gradient-to-l from-gold-500 to-gold-300 hover:from-gold-400 hover:to-gold-200 text-slate-950 font-black rounded-full shadow-2xl transition-[filter] hover:brightness-110 flex items-center gap-2 text-xs border border-gold-200/30"
          aria-label="فتح مساعد مجال الذكي"
        >
          <Bot className="w-5 h-5 text-slate-950" />
          <span className="hidden sm:inline">مساعد مجال الذكي</span>
          <Sparkles className="w-3.5 h-3.5 text-slate-950" />
        </button>
      </div>}

      <Suspense fallback={null}>
        {AI_ASSISTANT_ENABLED && showAiDrawer && <AiAssistantDrawer isOpen onClose={() => setShowAiDrawer(false)} />}
        {INTEGRATION_SIMULATORS_ENABLED && showIntegrations && <IntegrationHubModal isOpen onClose={() => setShowIntegrations(false)} />}
        {!IS_DEMO_MODE && showAuth && <AuthModal isOpen onClose={() => setShowAuth(false)} onAuthenticated={handleAuthenticated} />}
        {!IS_DEMO_MODE && authStatus === 'AUTHENTICATED' && showSecurity && <AccountSecurityModal isOpen onClose={() => setShowSecurity(false)} />}
      </Suspense>

      <OnboardingExperience
        open={showOnboarding}
        activeUser={store.activeUser}
        onDismiss={closeOnboarding}
        onSurfaceChange={handleSurfaceChange}
        onRequestAuth={IS_DEMO_MODE ? undefined : () => setShowAuth(true)}
      />

      <Footer
        onSurfaceChange={handleSurfaceChange}
        onOpenLegal={handleOpenLegal}
        onReplayOnboarding={() => setShowOnboarding(true)}
      />
      <ConnectionSentinel />
    </div>
    </AppErrorBoundary>
  );
}
