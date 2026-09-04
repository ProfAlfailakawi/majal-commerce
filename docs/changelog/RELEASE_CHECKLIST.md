# MAJAL — Release Checklist

## قبل أي Production Release

- [x] npm install / lockfile verified (2026-08-20)
- [x] TypeScript lint/typecheck
- [x] Production build
- [x] Current unit + integration suite (68/68)
- [x] Auth/MFA/session/CSRF/suspension tests
- [x] SQLite migration dry-run + schema/index/integrity checks
- [x] Money minor-unit + payment idempotency/mismatch tests
- [x] Million-record scale simulation (3,000,000 total rows)
- [x] Dependency audit (0 vulnerabilities; `qs` pinned to ^6.16.0 via override) + repository security scan + hard-coded credential sweep
- [x] Ten-role desktop browser smoke + full mobile overflow sweep at 320/375 px across every surface, portal tab and legal document
- [x] No client-exposed AI/API secrets
- [x] Public legal surface published (terms, privacy, refund, compliance) and linked from the footer
- [x] Payment adapters implemented for MyFatoorah (KWD) and Lemon Squeezy (non-KWD settlement, signed webhook + amount cross-check)
- [ ] Migrate every sensitive domain mutation from client Store to server API
- [ ] PostgreSQL multi-instance migration + rollback rehearsal
- [ ] Object Storage/KMS Recipe Vault + L1/L2/L3 negative tests
- [ ] Offer/contract/launch full state-machine E2E tests
- [ ] Backup restore test and disaster-recovery drill
- [ ] Full WCAG keyboard/screen-reader/contrast audit
- [ ] Safari/Chrome/Firefox + tablet/mobile matrix
- [ ] Privacy/data-retention and legal/compliance signoff for Kuwait
- [ ] PACI service-provider onboarding, official adapter and conformance signoff
- [ ] Payment/settlement provider credentials, signed-webhook conformance and reconciliation signoff
- [ ] Lemon Squeezy: store approval, pay-what-you-want variant, declared `LEMONSQUEEZY_KWD_RATE` review cadence, and counsel signoff on Merchant-of-Record status
- [ ] Email/Push providers, deliverability and consent/unsubscribe validation
- [ ] Monitoring, alerts, logs, traces, SLOs and on-call readiness
- [ ] Incident-response contacts and runbook drill
- [ ] Production database contains no smoke/demo identities
