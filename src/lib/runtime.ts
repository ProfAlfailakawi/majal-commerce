/**
 * Demo capabilities are opt-in and fail-closed.
 *
 * The original guard was `import.meta.env.DEV && VITE_ENABLE_DEMO_MODE === 'true'`.
 * That was the right instinct and the wrong lever. It was written because every
 * development build used to silently enable the seeded MAJAL universe, so a
 * perfectly real local registration looked like somebody else's account — the
 * browser store already held the demo creator and host. Tying the flag to DEV
 * fixed that, but it also meant a deployed build could never show a demo at
 * all, which is precisely what a walkthrough for a prospective client needs.
 *
 * So the lever moves from build time to the visitor. Demo is never on by
 * default anywhere, is never inferred from an environment variable on a
 * deployed build, and can only be turned on by someone deliberately pressing
 * "enter the demo" in this browser tab. The two properties that mattered are
 * preserved and strengthened:
 *
 *   - No deployment-time typo can enable it. There is no env var that turns it
 *     on; `VITE_DISABLE_DEMO_MODE` only takes it away.
 *   - It cannot contaminate a real account. The flag lives in sessionStorage
 *     (one tab, gone when the tab closes), demo state has always used its own
 *     storage key, and entering or leaving demo reloads the page so the store
 *     is rebuilt from scratch rather than half-converted in place.
 *
 * The flag is read once at module load, before the Store is constructed. That
 * is deliberate: every `IS_DEMO_MODE` branch in the store — and there are
 * dozens, each choosing between a local mutation and a server call — is
 * evaluated against one stable answer for the lifetime of the page.
 */

const DEMO_ACTIVE_KEY = 'majal_demo_active_v1';

/** Whether this build is allowed to offer a demo at all. Opt-out, not opt-in. */
export const DEMO_AVAILABLE = import.meta.env.VITE_DISABLE_DEMO_MODE !== 'true';

function readDemoFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(DEMO_ACTIVE_KEY) === 'true';
  } catch {
    // Private windows and blocked site data both throw here. Failing closed is
    // the only safe answer: no flag, no demo.
    return false;
  }
}

const devOptIn = import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEMO_MODE === 'true';

export const IS_DEMO_MODE = DEMO_AVAILABLE && (devOptIn || readDemoFlag());

export const AI_ASSISTANT_ENABLED =
  IS_DEMO_MODE || import.meta.env.VITE_ENABLE_AI_ASSISTANT === 'true';

export const INTEGRATION_SIMULATORS_ENABLED =
  IS_DEMO_MODE && import.meta.env.VITE_ENABLE_INTEGRATION_SIMULATORS === 'true';

export const DEMO_STORAGE_KEY = 'majal_demo_state_v6';

/**
 * Enter the demo in this tab.
 *
 * The session cookie is HttpOnly, so this function cannot see whether someone is
 * signed in; the caller gates on `store.activeUser` instead and only offers the
 * control to an anonymous visitor. What this function guarantees is that the
 * switch is total: the reload rebuilds the store from scratch rather than
 * leaving it half-converted with a live identity still in hand.
 */
export function enterDemoMode(): boolean {
  if (!DEMO_AVAILABLE || typeof window === 'undefined') return false;
  try {
    window.sessionStorage.setItem(DEMO_ACTIVE_KEY, 'true');
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/** Leave the demo and drop everything it wrote in this tab. */
export function exitDemoMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.sessionStorage.removeItem(DEMO_ACTIVE_KEY);
    window.sessionStorage.removeItem(DEMO_STORAGE_KEY);
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/** Throw the demo's own state away and rebuild it, without leaving the demo. */
export function resetDemoData(): boolean {
  if (!IS_DEMO_MODE || typeof window === 'undefined') return false;
  try {
    window.sessionStorage.removeItem(DEMO_STORAGE_KEY);
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
