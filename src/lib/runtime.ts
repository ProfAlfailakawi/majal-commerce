/**
 * Demo mode is permanently OFF. The application runs against the real server (auth,
 * sessions, domain API, Postgres/SQLite) in every environment — there is no local/mock
 * identity or seeded state path. Firestore is written server-side (Admin SDK mirror);
 * the browser never syncs directly.
 */
export const IS_DEMO_MODE = false as const;

export const FIREBASE_SYNC_ENABLED = false as const;

export const AI_ASSISTANT_ENABLED =
  import.meta.env.VITE_ENABLE_AI_ASSISTANT === 'true';

export const INTEGRATION_SIMULATORS_ENABLED = false as const;

export const DEMO_STORAGE_KEY = 'majal_demo_state_v6';
