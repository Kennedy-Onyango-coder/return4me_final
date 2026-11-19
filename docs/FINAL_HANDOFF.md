# Return4me clean-room implementation — final source handoff

**Archive date:** 14 November 2026  
**Source batches:** 1–12 implemented in source; Batch 13 partial; Batch 14 release tooling/runbooks source-added; Batch 15 UX/theme/accessibility foundations source-added  
**Release status:** BLOCKED — not production-ready  
**Database migrations applied:** none  
**Provider calls / real-money activity:** none  
**Git commit/push/deployment:** none

## Batch-by-batch roadmap

| Batch | What is source-implemented | Current status | What remains |
|---|---|---|---|
| 1–3 | Kenya product model, identity/auth foundation, reports, privacy, matching and claims | PARTIAL / UNVERIFIED | Full workflow and security/DB/browser acceptance |
| 4 | Guest reporting/tracking, representative authority, category proposal review and claims/appeals | IMPLEMENTED_UNVERIFIED | DB/API/browser and notification acceptance |
| 5 | Agent onboarding, manual KYC review, training, agreement versions, service-site inspection, appointments and assignment | IMPLEMENTED_UNVERIFIED | KYC file/renewal, browser and concurrency acceptance |
| 6 | Custody-chain v2, DB-owned sequence/hash and immutable double-entry journal foundation | IMPLEMENTED_UNVERIFIED | PostgreSQL, integrity and accounting acceptance |
| 7 | IntaSend sandbox-only STK collection sessions, webhook authentication, authoritative status reconciliation and unknown-outcome protection | IMPLEMENTED_UNVERIFIED; disabled by default | Sandbox contract, callback delivery/replay, amount/idempotency and DB acceptance |
| 8 | Claimant payment-gated collection and final handover, claimant confirmation, identity/appointment/dispute gates | IMPLEMENTED_UNVERIFIED | Disposable DB, race, API and browser acceptance |
| 9 | Collection accounting, immutable postings, receipts and reconciliation exceptions | IMPLEMENTED_UNVERIFIED | PostgreSQL and accounting acceptance |
| 10 | Original-payer refund request, independent approval, sandbox-only B2C submission and manual evidence reconciliation | PARTIAL; disabled by default | Provider status/fee acceptance, post-handover reversals and chargebacks |
| 11 | Separate verified reward funding, immutable 33/25/42 allocation, 48-hour settlement auto-approval, encrypted beneficiary destinations, cooling, three-person payout controls and sandbox-only B2C with TS100 confirmation | IMPLEMENTED_UNVERIFIED; payout disabled by default | Wallet identity/capability/liquidity, provider contract, DB/concurrency and accounting acceptance |
| 12 | Durable in-app notification outbox/retries/read controls; claimant payment/receipt UX; Agent final-release UI; Finder/Agent payout destination panel; Finance/Admin panel | IMPLEMENTED_UNVERIFIED | DB/API/browser/accessibility acceptance; external email/SMS/social remains disabled |
| 13 | Versioned payment-PII encryption and Admin batch rotation; scoped personal-data export; data-rights requests; PII minimisation and accessibility refinements | PARTIAL | Retention schedule, DPIA, distributed rate limiting, MFA policy decision, KMS, independent security/privacy/accessibility review |
| 14 | CI workflow, Dockerfile, health/readiness, graceful shutdown, encrypted backup/restore scripts, release evidence gate and runbooks | IMPLEMENTED_UNVERIFIED / RELEASE BLOCKED | CI/Docker/DB/restore execution, monitoring, RPO/RTO, DR, professional sign-offs, pilot and owner release authorisation |

## Financial structure preserved

- Claimant pays only the separately assessed recovery-service charge through the explicit M-Pesa STK session. The client cannot choose the amount.
- Finder/Agent reward funding is separate and must have source/reference/evidence recorded and independently verified.
- The approved reward split is Finder 33%, Agent 25%, Platform 42%.
- Settlement eligibility begins 48 hours after final item release and pauses on a settlement hold. The worker may auto-approve eligible settlement; it does not initiate payout.
- Payout creation, approval and execution are separate manual actions. Creator, approver and executor must be different people.
- Provider acceptance is not completion. Payout completion requires exact per-transaction TS100 or separately documented independent evidence reconciliation.
- Provider fees for disbursement are Platform expense. Missing fee data is not assumed to be zero.
- Unknown collection/refund/payout outcomes are never automatically retried.

## Batch 15 source changes

- Added a persistent user-selectable light/dark theme preference with operating-system preference as the initial default when no saved choice exists.
- Added a keyboard skip-to-main-content link and a focusable main-content target.
- Added explicit accessible name, expanded state and controlled-navigation relationship to the mobile navigation toggle.
- Corrected the global notice region so errors announce assertively and informational updates announce politely.
- Added dark-theme overrides for primary surfaces, text, borders, forms, navigation and controls.
- These are source changes only. No visual browser, contrast, keyboard, screen-reader or device acceptance has yet been performed.

## Verification actually performed

- Historical source-preparation records reported a pass for source syntax, traceability and migration metadata. Those results are not treated as a substitute for current full-project acceptance.
- In the Batch 15 continuation, global TypeScript syntax transpilation passed for 74 `.ts`/`.tsx` files with zero syntax diagnostics; traceability passed for 165 unique IDs; migration metadata passed for 11 ordered migration files (`0000`–`0010`).
- `node --check scripts/check-release-gates.mjs` and `package.json` JSON parsing passed.
- The standard `npm run verify:all` could not complete because the local `typescript` package is absent; the separate syntax transpilation does not typecheck the project.
- Full `npm run typecheck`, production build and Vitest remain blocked by missing local dependencies/type definitions and an absent Vitest installation.
- `npm run release:check` was attempted and correctly failed closed with 27 missing/unsigned production gates.

## Remaining work before production consideration

1. Install dependencies in a network-enabled development environment and run full typecheck, Vitest, production build and dependency audit.
2. Create a new disposable PostgreSQL database, apply migrations 0000–0010, inspect constraints/indexes, run DB integration and concurrency tests, and verify ledger/custody integrity. Do not use the legacy database.
3. Run API/browser/E2E/accessibility testing across all roles and counties, including payment window expiry, webhook replay, amount mismatch, claimant/Agent final release, disputes, refund/payout unknown outcomes, payout maker-checker-executor and privacy rights.
4. Configure and independently verify IntaSend sandbox credentials, webhook challenge, collection/disbursement/settlement wallet IDs, KES currency, `can_disburse`, available funds and exact provider status/fee contract. No live provider mode is implemented.
5. Configure Resend, domain/DKIM, ClamAV and private S3; run delivery, malware, private-access, retention and restore acceptance. External notification/publishing remains disabled.
6. Approve data retention/legal basis, DPIA, ODPC/privacy counsel, controller/processor agreements, cross-border transfers and data-subject response procedures.
7. Complete independent penetration testing, API/IDOR/CSRF/rate-limit tests, key lifecycle/backup encryption verification, WCAG 2.2 AA review, accounting/payments/tax review and Kenyan legal review.
8. Execute encrypted backup and restore rehearsal, choose and approve RPO/RTO, set monitoring/alert ownership, test incident response and rollback, run CI/Docker and complete a controlled pilot.
9. Obtain explicit owner release authorisation. No source implementation authorises production deployment or live money movement.

## Important operational safeguards

- All IntaSend adapters are hard-coded to sandbox and disabled by default.
- No payment, refund, payout, wallet balance check, provider webhook, email, SMS or social publication was called during this work.
- No real user data, production database, credentials or secrets were used.
- No automatic deletion of user data is implemented. Erasure requests are reviewed against legal/financial/safety retention duties.
- Notification outbox retries persisted messages; initial enqueue is post-commit best-effort and is not yet transactionally coupled to every business decision.
- Rate limiting is process-local and must be replaced with a shared store before multi-instance production.
- The release gate intentionally fails until required evidence and sign-offs are supplied.
