/**
 * Demo capabilities are deliberately compile-time gated. A production build is
 * fail-closed unless the operator explicitly enables a narrowly scoped service.
 */
// Demo data must be an explicit opt-in.  Previously every Vite development build
// silently enabled the seeded MAJAL universe unless the flag was set to the exact
// string "false".  That made a perfectly real local registration look like another
// person's account because the browser store already contained the demo creator/host.
//
// Keeping the guard tied to DEV means a production bundle can never be switched into
// demo mode by a deployment-time environment typo, while requiring === "true" means a
// developer has to make the choice deliberately.
export const IS_DEMO_MODE = import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEMO_MODE === 'true';

export const AI_ASSISTANT_ENABLED =
  IS_DEMO_MODE || import.meta.env.VITE_ENABLE_AI_ASSISTANT === 'true';

export const INTEGRATION_SIMULATORS_ENABLED =
  IS_DEMO_MODE && import.meta.env.VITE_ENABLE_INTEGRATION_SIMULATORS === 'true';

export const DEMO_STORAGE_KEY = 'majal_demo_state_v6';

