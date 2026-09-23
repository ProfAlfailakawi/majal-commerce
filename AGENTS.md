# Tebyan / MAJAL Absolute Edition — Production Architecture

This repository operates on a phased architecture for its production environment, leveraging both modern database solutions and strict server-side enforcements for robust security.

## Architecture States

### Implemented Now
- **Primary Datastore:** `node:sqlite` is the local/development source of truth for authentication, sessions, notifications, and payment boundaries/limits. In production (`NODE_ENV=production`) the server refuses to start without `DATABASE_URL` (PostgreSQL).
- **API & Server Layer:** Express 5/Node.js based modular monolith routing under `/api/**`.
- **Security Boundaries:** Zero implicit trust. Authentication relies on server-side HttpOnly/SameSite cookies, CSRF protections, MFA via TOTP (AES-256-GCM encrypted), and strict RBAC.
- **Frontend / Web App:** React (Vite-based) PWA serving as a pure presentation layer.
- **AI Integration:** Gemini AI endpoints isolated entirely within the server layer (`src/lib/gemini.ts` and `server/ai-intelligence.ts`). No API keys or configurations exposed to clients.
- **Audit Trails:** Maintained for all sensitive events locally.
- **Rate Limiting:** `express-rate-limit` on every route (app-wide ceiling plus per-route limits); counters are shared across instances through Redis when `REDIS_URL` is set (`server/rate-limit-store.ts`), with automatic per-instance fallback if Redis is unavailable.
- **Error Reporting:** 5xx and process-level faults are logged in the Cloud Error Reporting format (`reportError` in `server/observability.ts`).

### Adapter/Code Ready but External Configuration Required
- **Integrations:** PACI (Kuwait Mobile ID) and Payment gateways are interfaced via adapters that enforce idempotency, amounts, and signature verifications, but require official onboarding and external credentials to activate.
- **Firebase:** Integrated for client-side configuration features/applets. App Check (ReCaptcha V3) is implemented but requires a valid production configuration key.
- **Notifications:** Inbox/outbox infrastructure exists, but email/push providers require linkage and consent validation.
- **Operations (scripts ready, run once per project):** `scripts/setup-backups.sh` (Cloud SQL daily backups, PITR, daily SQL export), `scripts/setup-monitoring.sh` (uptime check and alert policies), `scripts/setup-redis.sh` (Memorystore). Portable `scripts/backup-db.sh` / `scripts/restore-db.sh`. Runbook: `docs/operations.md`.

### Target / Not Yet Production-Verified
- **Target Datastore:** PostgreSQL is the intended multi-instance production target. Current SQLite schema serves as a migration node.
- **Object Storage / KMS:** Intended for Recipe Vault contents, contracts, compliance documents, and proofs.
- **Redis / Distributed Systems:** Distributed rate limiting is implemented (see above). Sessions stay in the database, which is already shared across instances; caching is not implemented.
- **Event / Worker Infrastructure:** A dedicated event/worker platform remains outstanding. Backups, monitoring/alerting and the incident runbook are covered under Operations above but must be activated per project.
