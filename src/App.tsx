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
import { SESSION_EXPIRED_EVENT } from './lib/apiFetch';
import { ExperienceGuide } from './components/common/ExperienceGuide';
import { ConnectionSentinel } from './components/common/ConnectionSentinel';
import { OnboardingExperience } from './components/onboarding/OnboardingExperience';
import { OnboardingIntent, hasSeenOnboarding, markOnboardingSeen } from './lib/onboarding';

const PaymentReturnPage = lazy(() => import('./components/consumer/PaymentReturnPage').then(module => ({ default: module.PaymentReturnPage })));
const CreatorPortal = lazy(() => import('./components/creator/CreatorPortal').then(module => ({ default: module.CreatorPortal })));
const HostPortal = lazy(() => import('./components/host/HostPortal').then(module => ({ default: module.HostPortal })));
const SupplierPortal = lazy(() => import('./components/supplier/SupplierPortal').then(module => ({ default: module.SupplierPortal })));
const AdminDashboard = lazy(() => import('./components/admin/AdminDashboard').then(module => ({ default: module.AdminDashboard })));
const SuperAdminDashboard = lazy(() => import('./components/admin/SuperAdminDashboard').then(module => ({ default: module.SuperAdminDashboard })));
const BusinessShowcase = lazy(() => import('./components/showcase/BusinessShowcase').then(module => ({ default: module.BusinessShowcase })));
const InviteAcceptPage = lazy(() => import('./components/common/InviteAcceptPage').then(module => ({ default: module.InviteAcceptPage })));
const SupplierDirectory = lazy(() => import('./components/showcase/SupplierDirectory').then(module => ({ default: module.SupplierDirectory })));
const GateReportPage = lazy(() => import('./components/showcase/GateReportPage').then(module => ({ default: module.GateReportPage })));
const PartnerKitPage = lazy(() => import('./components/showcase/PartnerKitPage').then(module => ({ default: module.PartnerKitPage })));
const AdReportPage = lazy(() => import('./components/showcase/AdReportPage').then(module => ({ default: module.AdReportPage })));
const AiAssistantDrawer = lazy(() => import('./components/common/AiAssistantDrawer').then(module => ({ default: module.AiAssistantDrawer })));
const IntegrationHubModal = lazy(() => import('./components/common/IntegrationHubModal').then(module => ({ default: module.IntegrationHubModal })));
const AuthModal = lazy(() => import('./components/common/AuthModal').then(module => ({ default: module.AuthModal })));
const AccountSecurityModal = lazy(() => import('./components/common/AccountSecurityModal').then(module => ({ default: module.AccountSecurityModal })));

import { SurfaceFallback } from './components/common/SurfaceFallback';
import type { LegalDocumentId } from './components/legal/LegalCenter';
import { legalDocumentFromPath, legalPath } from './lib/legalRoutes';
import { AdSlot } from './components/showcase/AdSlot';
import { audienceOf } from './lib/adAudience';
import { reportPageView } from './lib/audienceClient';

const LegalCenter = lazy(() => import('./components/legal/LegalCenter').then(module => ({ default: module.LegalCenter })));

export default function App() {
  const [, setTick] = useState(0);
  useEffect(() => store.subscribe(() => setTick(t => t + 1)), []);
  // Presentation only: lets CSS fade the floating assistant button while the page is scrolling.
  useEffect(() => {
    let timer: number | undefined;
    const onScroll = () => {
      document.body.classList.add('is-scrolling');
      window.clearTimeout(timer);
      timer = window.setTimeout(() => document.body.classList.remove('is-scrolling'), 220);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); window.clearTimeout(timer); document.body.classList.remove('is-scrolling'); };
  }, []);

  const [activeSurface, setActiveSurface] = useState<SurfaceType>(store.activeSurface || 'PUBLIC');
  const [showAiDrawer, setShowAiDrawer] = useState(false);
  const [showIntegrations, setShowIntegrations] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const [authStatus, setAuthStatus] = useState<'LOADING' | 'AUTHENTICATED' | 'ANONYMOUS'>(IS_DEMO_MODE ? 'AUTHENTICATED' : 'LOADING');
  // The legal surface sits outside the role/permission surfaces on purpose: it is public,
  // has no permission model, and must stay reachable from every state of the app.
  // A company opens its private campaign report from `/?ad-report=<token>`. Like the legal
  // pages it sits outside the role surfaces: the link itself is the credential.
  const [adReportToken, setAdReportToken] = useState<string | null>(() => new URLSearchParams(window.location.search).get('ad-report'));
  const [inviteToken, setInviteToken] = useState<string | null>(() => new URLSearchParams(window.location.search).get('invite'));
  const [partnerToken, setPartnerToken] = useState<string | null>(() => new URLSearchParams(window.location.search).get('partners'));
  const [gateToken, setGateToken] = useState<string | null>(() => new URLSearchParams(window.location.search).get('my-report'));
  const [paymentReturn, setPaymentReturn] = useState<{ orderId: string | null } | null>(() => window.location.pathname.replace(/\/+$/, '') === '/payment/return' ? { orderId: new URLSearchParams(window.location.search).get('order') } : null);
  const closePaymentReturn = () => { window.history.replaceState(null, '', '/'); setPaymentReturn(null); };
  const closeGateReport = () => { window.history.replaceState(null, '', '/'); setGateToken(null); };
  const closePartners = () => { window.history.replaceState(null, '', '/'); setPartnerToken(null); };
  const closeInvite = () => { window.history.replaceState(null, '', '/'); setInviteToken(null); };
  // House cards and other in-page promos ask the app to change surface without owning its state.
  useEffect(() => {
    const go = (event: Event) => { const target = (event as CustomEvent<SurfaceType>).detail; if (target) handleSurfaceChange(target); };
    window.addEventListener('majal:navigate', go);
    return () => window.removeEventListener('majal:navigate', go);
  });
  const closeAdReport = () => { window.history.replaceState(null, '', '/'); setAdReportToken(null); };
  const [legalDocument, setLegalDocument] = useState<LegalDocumentId | null>(() => legalDocumentFromPath(window.location.pathname));

  useEffect(() => {
    const onPopState = () => setLegalDocument(legalDocumentFromPath(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) canonical.href = `${window.location.origin}${legalDocument ? legalPath(legalDocument) : '/'}`;
    document.title = legalDocument
      ? `${legalDocument === 'TERMS' ? 'الشروط والأحكام' : legalDocument === 'PRIVACY' ? 'سياسة الخصوصية' : legalDocument === 'REFUND' ? 'سياسة الاسترجاع' : 'الامتثال والتتبع'} | مجال`
      : 'مجال | من الفكرة إلى منتج تجاري';
  }, [legalDocument]);

  // Anonymous audience measurement: one report per browser per page per day, role only (see lib/audienceClient).
  useEffect(() => {
    if (authStatus === 'LOADING' || paymentReturn || adReportToken || inviteToken || partnerToken || gateToken || legalDocument) return;
    const user = store.activeUser;
    reportPageView(activeSurface, audienceOf(user), user.role === 'ADMIN' || user.role === 'SUPER_ADMIN');
  }, [activeSurface, authStatus, paymentReturn, adReportToken, inviteToken, partnerToken, gateToken, legalDocument]);

  // The first-run introduction. It is held back until the session question is settled:
  // opening it over a still-resolving auth state would show a returning operator the
  // "who are you" screen for a moment before their own portal appears.
  const [showOnboarding, setShowOnboarding] = useState(false);
  useEffect(() => {
    // Visitors land on the offer itself; the tour opens for signed-in users on first
    // run and stays one click away in the footer for everyone else.
    if (authStatus !== 'AUTHENTICATED') return;
    if (hasSeenOnboarding()) return;
    setShowOnboarding(true);
  }, [authStatus]);

  const closeOnboarding = (_intent: OnboardingIntent | null, skipped: boolean) => {
    markOnboardingSeen(skipped);
    setShowOnboarding(false);
  };

  useEffect(() => {
    if (IS_DEMO_MODE) return;
    let active = true;
    restoreAuthSession()
      .then(async session => {
        if (!active) return;
        if (session && store.setAuthenticatedUser(session.user)) {
          const surface = surfaceForUser(session.user);
          await store.hydrateFromServer();
          if (!active) return;
          setAuthStatus('AUTHENTICATED');
          setActiveSurface(surface);
          store.setSurface(surface);
        } else {
          store.clearAuthenticatedUser();
          setAuthStatus('ANONYMOUS');
        }
      })
      .catch(() => { if (active) { store.clearAuthenticatedUser(); setAuthStatus('ANONYMOUS'); } });
    return () => { active = false; };
  }, []);

  // A shared launch link (`/?drop=<launchId>&src=HOST`) lands on the market, where the order
  // dialog for that launch opens. It used to be `/drop/<id>`, which the SPA shell answered with
  // the generic landing page, so every link a host copied from the war room went nowhere.
  useEffect(() => {
    if (authStatus === 'LOADING') return;
    if (new URLSearchParams(window.location.search).get('drop')) { setActiveSurface('CONSUMER'); store.setSurface('CONSUMER'); }
  }, [authStatus]);

  // Any authenticated API call that answers 401 ends the signed-in state here.
  const [sessionNotice, setSessionNotice] = useState('');
  const authStatusRef = React.useRef(authStatus);
  authStatusRef.current = authStatus;
  useEffect(() => {
    const onExpired = () => {
      if (authStatusRef.current !== 'AUTHENTICATED') return;
      store.clearAuthenticatedUser();
      setAuthStatus('ANONYMOUS');
      setActiveSurface('PUBLIC');
      store.setSurface('PUBLIC');
      setSessionNotice('انتهت جلستك أو أُنهيت من جهاز آخر. سجّل الدخول من جديد للمتابعة.');
      setShowAuth(true);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const surfaceForUser = (user: { role: string; accountType?: string }): SurfaceType => {
    if (user.role === 'SUPER_ADMIN') return 'SUPER_ADMIN';
    if (user.role === 'ADMIN') return 'ADMIN';
    if (user.role === 'CREATOR') return 'CREATOR';
    if (user.role.startsWith('HOST_')) return 'HOST';
    if (user.accountType === 'SUPPLIER') return 'SUPPLIER';
    return 'CONSUMER';
  };

  const handleAuthenticated = async (session: AuthSession) => {
    setSessionNotice('');
    if (!store.setAuthenticatedUser(session.user)) return;
    const surface = surfaceForUser(session.user);
    await store.hydrateFromServer();
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

  // Private-link pages (invite, reports, partner kit, payment return) render ahead of every
  // surface, so navigating away must close them; otherwise the nav pill moves and the page stays.
  const leavePrivatePages = () => {
    if (!(paymentReturn || gateToken || partnerToken || inviteToken || adReportToken)) return false;
    setPaymentReturn(null); setGateToken(null); setPartnerToken(null); setInviteToken(null); setAdReportToken(null);
    return true;
  };

  const handleOpenLegal = (document: LegalDocumentId) => {
    leavePrivatePages();
    window.history.pushState({ legalDocument: document }, '', legalPath(document));
    setLegalDocument(document);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Switching tabs inside the legal centre: same document state as a footer link, without a
  // history entry per tab or a scroll jump. Before, the tab changed only local state, so the
  // URL/title stayed on the old document and a later footer link to it did nothing.
  const selectLegalTab = (document: LegalDocumentId) => {
    window.history.replaceState({ legalDocument: document }, '', legalPath(document));
    setLegalDocument(document);
  };

  const closeLegal = () => {
    window.history.pushState({}, '', '/');
    setLegalDocument(null);
  };

  const handleSurfaceChange = (surface: SurfaceType) => {
    if (leavePrivatePages()) window.history.replaceState(null, '', '/');
    else if (legalDocument) window.history.pushState({}, '', '/');
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
    <div dir="rtl" className="min-h-screen text-slate-100 font-sans selection:bg-gold-500 selection:text-slate-950 flex flex-col justify-between relative overflow-x-clip">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:start-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-xl focus:bg-gold-500 focus:text-slate-950 focus:font-black">
        انتقل إلى المحتوى الرئيسي
      </a>
      {/* The ambient field is drawn entirely by .ambient-bg's own background gradients —
          see src/index.css. It has no children on purpose: the nested opacity wrapper and
          blurred circles this replaced were what every glass panel had to sample as its
          backdrop on each scroll. */}
      <div className="ambient-bg" aria-hidden="true" />

      <div className="relative z-10 flex-1 flex flex-col">
        {sessionNotice && <div role="alert" className="bg-amber-500/15 border-b border-amber-400/30 text-amber-200 text-xs font-bold px-4 py-2.5 text-center">{sessionNotice}</div>}
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

        {!gateToken && !partnerToken && !adReportToken && !inviteToken && <ExperienceGuide activeSurface={activeSurface} onSurfaceChange={handleSurfaceChange} />}

        {!adReportToken && !inviteToken && !partnerToken && !gateToken && !legalDocument && !['DIRECTORY', 'CREATOR', 'HOST', 'SUPPLIER'].includes(activeSurface) && <AdSlot slot="SPONSOR" />}

        <main id="main-content" data-surface={paymentReturn ? 'PAYMENT' : (gateToken || partnerToken || inviteToken || adReportToken || legalDocument) ? 'OTHER' : activeSurface} tabIndex={-1} className="animate-in fade-in duration-300 flex-1 pb-[4.5rem] sm:pb-10 outline-none focus-visible:ring-2 focus-visible:ring-gold-300">
          <Suspense fallback={<SurfaceFallback />}>
            {paymentReturn ? <PaymentReturnPage orderId={paymentReturn.orderId} onDone={closePaymentReturn} /> : gateToken ? <GateReportPage token={gateToken} onClose={closeGateReport} /> : partnerToken ? <PartnerKitPage token={partnerToken} onClose={closePartners} /> : inviteToken ? <InviteAcceptPage token={inviteToken} onDone={closeInvite} /> : adReportToken ? <AdReportPage token={adReportToken} onClose={closeAdReport} /> : legalDocument ? <LegalCenter initialDocument={legalDocument} onBack={closeLegal} onSelect={selectLegalTab} /> : <>
              {activeSurface === 'PUBLIC' && <PublicLanding onSurfaceChange={handleSurfaceChange} />}
              {activeSurface === 'DIRECTORY' && <SupplierDirectory onSurfaceChange={handleSurfaceChange} />}
              {activeSurface === 'SHOWCASE' && <BusinessShowcase onSurfaceChange={handleSurfaceChange} />}
              {activeSurface === 'CONSUMER' && <ConsumerDashboard onSurfaceChange={handleSurfaceChange} />}
              {activeSurface === 'CREATOR' && <CreatorPortal />}
              {activeSurface === 'HOST' && <HostPortal />}
              {activeSurface === 'SUPPLIER' && <SupplierPortal />}
              {activeSurface === 'ADMIN' && <AdminDashboard />}
              {activeSurface === 'SUPER_ADMIN' && <SuperAdminDashboard />}
            </>}
          </Suspense>
        </main>
      </div>

      {AI_ASSISTANT_ENABLED && <div className="majal-ai-fab fixed bottom-[max(1rem,env(safe-area-inset-bottom))] end-4 sm:bottom-6 sm:end-6 z-40">
        <button
          onClick={() => setShowAiDrawer(true)}
          className="max-sm:min-h-12 max-sm:min-w-12 max-sm:justify-center max-sm:px-3 px-4 py-3 bg-gold-400 hover:bg-gold-300 text-slate-950 font-black rounded-full shadow-lg shadow-black/30 transition-colors flex items-center gap-2 text-xs border border-gold-200/30"
          aria-label="فتح مساعد مجال الذكي"
        >
          <Bot className="w-5 h-5 text-slate-950" />
          <span className="hidden sm:inline">مساعد مجال الذكي</span>
          <Sparkles className="hidden sm:block w-3.5 h-3.5 text-slate-950" />
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
