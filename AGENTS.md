# Tebyan / MAJAL Absolute Edition — Production Architecture

This repository operates on a phased architecture for its production environment, leveraging both modern database solutions and strict server-side enforcements for robust security.

## Architecture States

### Implemented Now
- **Primary Datastore:** The application currently uses `node:sqlite` as the local source of truth for authentication, sessions, notifications, and payment boundaries/limits.
- **API & Server Layer:** Express/Node.js based modular monolith routing under `/api/**`.
- **Security Boundaries:** Zero implicit trust. Authentication relies on server-side HttpOnly/SameSite cookies, CSRF protections, MFA via TOTP (AES-256-GCM encrypted), and strict RBAC.
- **Frontend / Web App:** React (Vite-based) PWA serving as a pure presentation layer.
- **AI Integration:** Gemini AI endpoints isolated entirely within the server layer (`src/lib/gemini.ts` and `server/ai-intelligence.ts`). No API keys or configurations exposed to clients.
- **Audit Trails:** Maintained for all sensitive events locally.

### Adapter/Code Ready but External Configuration Required
- **Integrations:** PACI (Kuwait Mobile ID) and Payment gateways are interfaced via adapters that enforce idempotency, amounts, and signature verifications, but require official onboarding and external credentials to activate.
- **Firebase:** Integrated for client-side configuration features/applets. App Check (ReCaptcha V3) is implemented but requires a valid production configuration key.
- **Notifications:** Inbox/outbox infrastructure exists, but email/push providers require linkage and consent validation.

### Target / Not Yet Production-Verified
- **Target Datastore:** PostgreSQL is the intended multi-instance production target. Current SQLite schema serves as a migration node.
- **Object Storage / KMS:** Intended for Recipe Vault contents, contracts, compliance documents, and proofs.
- **Redis / Distributed Systems:** Intended to handle sessions, distributed rate limiting, and caching.
- **Event / Worker Infrastructure:** Full production observability, backup/restore mechanisms, security scanning, and incident operations remain outstanding.
