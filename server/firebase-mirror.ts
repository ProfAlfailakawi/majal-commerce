/**
 * Server-side Firestore mirror (fail-closed).
 *
 * The application is server-authoritative (Postgres/SQLite via the Express API) and NEVER
 * reads Firestore from the client. Firestore is a read-optimized MIRROR that the SERVER
 * writes through the Firebase Admin SDK (a service account bypasses the default-deny
 * firestore.rules). Client writes stay denied.
 *
 * This module is READY but inert until BOTH are true:
 *   1. `firebase-admin` is installed (npm i firebase-admin), AND
 *   2. credentials are provided via one of:
 *        - FIREBASE_SERVICE_ACCOUNT_JSON  (the service-account JSON, inline)
 *        - GOOGLE_APPLICATION_CREDENTIALS (path to the JSON; SDK default)
 *      plus FIREBASE_PROJECT_ID.
 *
 * Every mirror write is fire-and-forget: a mirror failure NEVER affects the authoritative
 * transaction or the HTTP response. Call `mirrorDoc(...)` AFTER the DB transaction commits.
 */

type AdminFirestore = {
  collection: (name: string) => {
    doc: (id: string) => { set: (data: unknown, opts?: { merge?: boolean }) => Promise<unknown> };
  };
};

let initialized = false;
let firestore: AdminFirestore | null = null;
type AdminAuth = { setCustomUserClaims: (uid: string, claims: Record<string, unknown> | null) => Promise<void> };
let adminAuth: AdminAuth | null = null;
let disabledReason: string | null = null;

function structuredLog(event: string, extra: Record<string, unknown> = {}) {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ severity: 'INFO', event, service: 'majal-firebase-mirror', ...extra }));
}

/** True only when the mirror is fully configured and the Admin SDK loaded. */
export function isFirebaseMirrorEnabled(): boolean {
  return firestore !== null;
}

async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const inlineCreds = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();

  if (!projectId || (!inlineCreds && !credsPath)) {
    disabledReason = 'FIREBASE_MIRROR_UNCONFIGURED';
    structuredLog('firebase_mirror_disabled', { reason: disabledReason });
    return;
  }

  try {
    // Dynamic import via a non-literal specifier so the type-checker does not require
    // firebase-admin to be installed; the server runs fine without it.
    const moduleName = 'firebase-admin';
    const admin = await import(moduleName).catch(() => null as any);
    if (!admin) {
      disabledReason = 'FIREBASE_ADMIN_NOT_INSTALLED';
      structuredLog('firebase_mirror_disabled', { reason: disabledReason });
      return;
    }
    const credential = inlineCreds
      ? admin.credential.cert(JSON.parse(inlineCreds))
      : admin.credential.applicationDefault();
    const app = admin.apps?.length ? admin.app() : admin.initializeApp({ credential, projectId });
    firestore = admin.firestore(app) as unknown as AdminFirestore;
    adminAuth = typeof admin.auth === 'function' ? admin.auth(app) as AdminAuth : null;
    structuredLog('firebase_mirror_enabled', { projectId });
  } catch (error) {
    disabledReason = 'FIREBASE_MIRROR_INIT_FAILED';
    firestore = null;
    structuredLog('firebase_mirror_init_failed', { message: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * Public collections are world-readable (firestore.rules `allow read: if true`), so the
 * mirror writes ONLY an allow-listed projection there. Vault/recipe, cost, margin, payout,
 * contact and any unknown field is dropped — adding a field requires adding it here.
 */
export const PUBLIC_PROJECTIONS: Record<string, readonly string[]> = {
  creators: ['id', 'displayName', 'creatorType', 'specialty', 'region', 'completionScore', 'badges', 'createdAt'],
  hosts: ['id', 'commercialName', 'businessType', 'verificationStatus', 'capabilities', 'createdAt'],
  products: ['id', 'creatorId', 'title', 'category', 'status', 'priceKwd', 'imageUrl', 'createdAt']
};

export function publicProjection(collection: string, data: Record<string, unknown>): Record<string, unknown> {
  const allowed = PUBLIC_PROJECTIONS[collection];
  if (!allowed) return data;
  const out: Record<string, unknown> = {};
  for (const key of allowed) if (data[key] !== undefined) out[key] = data[key];
  return out;
}

/**
 * Mirror a single document to Firestore (merge). Fire-and-forget: awaiting is optional and a
 * failure is swallowed after logging. NEVER call inside a DB transaction — call after commit.
 */
export async function mirrorDoc(collection: string, id: string, data: Record<string, unknown>): Promise<void> {
  try {
    await ensureInitialized();
    if (!firestore) return; // disabled → no-op
    await firestore.collection(collection).doc(id).set({ ...publicProjection(collection, data), _mirroredAt: new Date().toISOString() }, { merge: PUBLIC_PROJECTIONS[collection] ? false : true });
  } catch (error) {
    structuredLog('firebase_mirror_write_failed', { collection, id, message: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * firestore.rules authorise admin reads through `request.auth.token.role`. That claim only
 * exists if the server sets it, so every server-side role change (moderation, membership
 * repair, bootstrap) calls this after commit. A suspended/non-active account gets its claim
 * cleared. Fail-closed no-op when the mirror is unconfigured; never throws.
 */
export type ClaimSetter = (uid: string, claims: Record<string, unknown> | null) => Promise<void>;
let claimSetterOverride: ClaimSetter | null = null;
export function __setClaimSetterForTests(setter: ClaimSetter | null) { claimSetterOverride = setter; }

export async function syncRoleClaim(userId: string, role: string | null, status = 'ACTIVE'): Promise<boolean> {
  try {
    await ensureInitialized();
    const setter: ClaimSetter | null = claimSetterOverride ?? (adminAuth ? (uid, claims) => adminAuth!.setCustomUserClaims(uid, claims) : null);
    if (!setter) return false;
    await setter(userId, role && status === 'ACTIVE' ? { role } : { role: null });
    structuredLog('firebase_role_claim_synced', { userId, role: status === 'ACTIVE' ? role : null });
    return true;
  } catch (error) {
    structuredLog('firebase_role_claim_failed', { userId, message: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

/** Test/diagnostic helper. */
export function firebaseMirrorStatus(): { enabled: boolean; reason: string | null } {
  return { enabled: isFirebaseMirrorEnabled(), reason: disabledReason };
}
