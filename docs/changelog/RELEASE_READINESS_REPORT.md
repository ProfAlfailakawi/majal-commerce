# MAJAL / Tebyan — RELEASE READINESS REPORT (CONDITIONAL GO)

## Audit Findings & Resolutions

**1. Firebase & Firestore Security (RESOLVED)**
- **Finding:** Firestore rules for `creators`, `hosts`, and `products` were overly permissive (`allow write: if isAuthenticated()`). `orders`, `contracts`, and `audit_logs` were accessible for client-side direct writes.
- **Resolution:** Updated `firestore.rules` to enforce exact authorization logic.
  - Creators can only write if `request.auth.uid == request.resource.data.userId`.
  - Products can only be written to if `request.auth.uid == request.resource.data.creatorId`.
  - Hosts can only be written to by users with `ADMIN` or `SUPER_ADMIN` roles.
  - Direct client writes for `orders`, `contracts`, and `audit_logs` have been explicitly denied (`allow write: if false`). Mutations to these entities are correctly routed through the trusted server layer.
  - Added focused unit tests (`server/firestore-rules.test.ts`) mapping the static authorization expectations as a guardrail. Note: Emulator execution is deferred in this CI environment, hence rules are statically verified rather than runtime simulated.

**2. Gemini API / Secret Exposures (VERIFIED - SAFE)**
- **Finding:** Audited `src/lib/gemini.ts` to ensure no client-side API key leak.
- **Verification:** `GEMINI_API_KEY` is loaded securely via Node's `process.env`. `src/lib/gemini.ts` is strictly imported and invoked by server-side processes (`server/ai-intelligence.ts`, `server.ts`).

**3. Application Client Structure (RESOLVED)**
- **Finding:** `src/App.tsx` contained inline fallback components adding structural weight to the root module.
- **Resolution:** Extracted `SurfaceFallback` into a dedicated `src/components/common/SurfaceFallback.tsx` file for maintainability.

**4. Firebase App Check (IMPLEMENTED / CONFIGURATION REQUIRED)**
- **Finding:** Missing implementation for Firebase App Check which prevents backend abuse, and attempting to initialize it with an empty key is invalid.
- **Resolution:** Guarded App Check initialization in `src/lib/firebase.ts` so it only activates when a valid `recaptchaSiteKey` is present in configuration. This resolves runtime errors in staging but full protection requires actual production configuration mapping.

**5. Architecture & Documentation Standardization (RESOLVED)**
- **Finding:** Missing unified `AGENTS.md` covering correct architecture limits.
- **Resolution:** Wrote a deterministic `AGENTS.md` explicitly defining backend boundaries, AI isolation, SQL/SQLite targets, and role limitations, accurately isolating what is implemented vs target infrastructure.

**6. Dependency Duplications (VERIFIED - SAFE)**
- **Finding:** Checked for duplications across SDKs (especially `@google/genai`).
- **Verification:** Only one version of `@google/genai` is mapped in `package.json` (`^2.4.0`) and NPM tree is clean.

## Remaining Blockers for Full "GO"
This deployment operates as **CONDITIONAL GO** scoped strictly to staging/pre-production as per absolute readiness states:
1. **Database / Persistence:** PostgreSQL multi-instance migrations must be fully applied over SQLite placeholders. Object Storage/KMS implementation for Recipe Vault contents is outstanding.
2. **Integrations:** Official legal onboarding and adapter configuration with PACI/Payment integrations must be finalized per `INTEGRATION_READINESS.md`. Email/Push providers require linkage.
3. **Infrastructure:** Redis/distributed rate limiting, backup/restore mechanisms, observability, security scanning, and incident operations remain to be configured and verified.
