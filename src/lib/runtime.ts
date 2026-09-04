/**
 * Demo capabilities are deliberately compile-time gated. A production build is
 * fail-closed unless the operator explicitly enables a narrowly scoped service.
 */
export const IS_DEMO_MODE = import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEMO_MODE !== 'false';

export const AI_ASSISTANT_ENABLED =
  IS_DEMO_MODE || import.meta.env.VITE_ENABLE_AI_ASSISTANT === 'true';

export const INTEGRATION_SIMULATORS_ENABLED =
  IS_DEMO_MODE && import.meta.env.VITE_ENABLE_INTEGRATION_SIMULATORS === 'true';

export const DEMO_STORAGE_KEY = 'majal_demo_state_v6';

