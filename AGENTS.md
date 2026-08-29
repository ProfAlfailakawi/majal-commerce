# Tebyan / MAJAL Absolute Edition — Production Architecture

This repository operates on a hybrid architecture for its production environment, leveraging both modern database solutions and strict server-side enforcements for robust security.

## Current Production Architecture

### 1. Database & Persistence
- **Primary Datastore:** The application currently uses `node:sqlite` as the local source of truth for authentication, sessions, notifications, and payment boundaries/limits (via `server/database.ts`).
- **Target Datastore:** PostgreSQL is the intended multi-instance production target. The current schema, constraints, and indexes in SQLite are designed as migration nodes to facilitate a transition to PostgreSQL for full scalability and redundancy.
- **Object Storage:** Deals with Recipe Vault contents, contracts, compliance documents, and proofs using encrypted-at-rest Object Storage and KMS.

### 2. API & Server Layer
- **Framework:** Express/Node.js based modular monolith.
- **Routing:** Production routing operates predominantly under `/api/**`.
- **Security Boundaries:**
  - Zero implicit trust for the browser/client.
  - Authentication relies on server-side HttpOnly/SameSite cookies and CSRF protections.
  - Multi-Factor Authentication (MFA) via TOTP, with secrets encrypted using AES-256-GCM.
  - Strict Role-Based Access Control (RBAC), context-awareness, and sensitivity tiers (L1/L2/L3).
- **Integrations:**
  - PACI (Kuwait Mobile ID) and Payment gateways are interfaced via adapters that enforce idempotency, precise amounts (KWD minor units), and signature verifications.

### 3. Frontend / Web App
- **Stack:** React (Vite-based) PWA.
- **Role:** Pure presentation layer. Hidden UI elements or `sessionStorage` checks are not used for security controls. All state mutations and permission enforcements are verified purely on the server.
- **Firebase:** Integrated primarily for client-side configuration features or specific applets, hardened with Firebase App Check (ReCaptcha V3).
- **Gemini AI API:** AI endpoints are completely isolated in the server layer (`src/lib/gemini.ts` and `server/ai-intelligence.ts`). No API keys or sensitive retry configurations are exposed to the client.

### 4. Background & Observability
- Event buses and workers manage notification coalescing and delivery (email/push) without blocking critical paths.
- Redis handles sessions, rate limiting, and temporary caching (not financial state).
- Strict audit trails are maintained for all sensitive events, maintaining data lineage without exposing payloads.