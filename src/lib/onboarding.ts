import { SurfaceType } from '../types/majal';

/**
 * First-run state for the introduction flow.
 *
 * Versioned in the key rather than inside the value: when the flow changes enough to be
 * worth showing again, bumping the suffix re-introduces it to everyone without needing a
 * migration, and the stale key falls out of storage on its own.
 */
const STORAGE_KEY = 'majal_onboarding_v1';

export type OnboardingIntent = 'CREATOR' | 'HOST' | 'CONSUMER' | 'ADMIN';

export interface OnboardingRecord {
  completedAt: string;
  /** True when the visitor dismissed it early — worth distinguishing from a full read. */
  skipped: boolean;
}

/**
 * Surface each declared intent ultimately wants to land on. Used at the end of the flow to
 * open the right place once; the choice is deliberately not persisted — see below.
 */
export const intentSurface: Record<OnboardingIntent, SurfaceType> = {
  CREATOR: 'CREATOR',
  HOST: 'HOST',
  CONSUMER: 'CONSUMER',
  ADMIN: 'ADMIN'
};

// Storage is unavailable in private-mode Safari and behind some enterprise policies, and
// throws rather than returning null. The flow must degrade to "show it" instead of
// crashing the app on boot, so every access is wrapped.
function readStorage(): OnboardingRecord | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as OnboardingRecord) : null;
  } catch {
    return null;
  }
}

export function hasSeenOnboarding(): boolean {
  return readStorage() !== null;
}

/**
 * The declared intent is intentionally not stored. It is answered once to open the right
 * surface at the end of the flow, and nothing reads it back afterwards: routing a returning
 * visitor from a months-old answer would send them somewhere they did not ask for, and the
 * app already resolves the surface from their actual role. Keeping an unread declaration in
 * storage buys nothing and is one more thing to reason about.
 */
export function markOnboardingSeen(skipped: boolean): void {
  try {
    const record: OnboardingRecord = { completedAt: new Date().toISOString(), skipped };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // A visitor who cannot persist the flag simply sees the intro again next visit.
    // That is a far better failure than a boot-time exception.
  }
}
