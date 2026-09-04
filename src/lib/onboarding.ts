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
  intent: OnboardingIntent | null;
  /** True when the visitor dismissed it early — worth distinguishing from a full read. */
  skipped: boolean;
}

/** Surface each declared intent ultimately wants to land on. */
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

export function markOnboardingSeen(intent: OnboardingIntent | null, skipped: boolean): void {
  try {
    const record: OnboardingRecord = { completedAt: new Date().toISOString(), intent, skipped };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // A visitor who cannot persist the flag simply sees the intro again next visit.
    // That is a far better failure than a boot-time exception.
  }
}
