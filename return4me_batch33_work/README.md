# Return4me — clean-room implementation archive

A new implementation of Return4me, operated by Elligrace Technologies Limited. This replacement is independent of the legacy repository and preserves the approved product, privacy, custody and financial decisions recovered from the source and prior planning work.

## Technology

- React 19, TypeScript, Vite and Tailwind CSS v4
- Express API and Zod validation
- PostgreSQL and Drizzle ORM
- Resend email OTP foundation
- Private evidence storage using local development storage or S3-compatible private storage
- ClamAV `clamd` malware scanning, file signature detection and image processing
- Vitest test suite and ordered SQL migrations

## Prerequisites

- Node.js 22 recommended
- npm 10 or newer
- PostgreSQL 16 recommended for connected API/database acceptance
- Docker Compose optional for local PostgreSQL only

## Browser-only demo preview (no PostgreSQL or Docker)

1. Extract the ZIP and open the `return4me-new` directory in VS Code.
2. Install frontend dependencies: `npm install`.
3. Run `npm run dev:preview`.
4. Open `http://localhost:5173`.

This starts Vite only. `.env.demo` enables the explicit demonstration experience. It does not start Express, access PostgreSQL, send email, call IntaSend, publish to Facebook/Telegram or write real records. Demo changes remain in page memory. Every demo screen carries a visible warning. Do not enter real personal information in demo mode.

## Local connected setup

1. Extract the ZIP and open the project directory.
2. Copy `.env.example` to `.env`; replace every secret placeholder with independently generated secrets.
3. Set `DATABASE_URL` to a new disposable PostgreSQL database. The supplied `compose.yaml` starts only a local development database; its password is local-only and must never be reused in production.
4. Install packages with `npm ci`.
5. Review all SQL files and the ordered migration journal. This archive includes migrations `0000` through `0014`; review every migration before applying any of them.
6. Apply migrations only to a newly created disposable database using `npm run db:migrate`. Never apply them to the legacy Return4me database or a database containing user data.
7. Set `VITE_DEMO_MODE=false` for connected API mode and configure private evidence storage and ClamAV for upload workflows.
8. Start the app with `npm run dev` and open `http://localhost:5173`.

For local development without Resend, OTP codes are printed to the API terminal with a `[DEV ONLY]` prefix. This fallback is disabled in production. Do not expose development logs publicly.

## Current implementation and acceptance status

The archive contains source implementation for Batches 1–29, including the two-role Admin/Super Admin (Owner) governance model and report maker/checker workflow. It includes a requirement traceability register and 15 ordered SQL migrations. No Stage 1–17 requirement is represented as independently accepted merely because its source exists. Read `docs/FINAL_HANDOFF.md`, `docs/IMPLEMENTATION_PROGRESS_2026-11-14.md`, `docs/ROADMAP_1_TO_17.md`, `docs/BATCH15_UX_THEMES_ACCESSIBILITY.md` and `docs/REQUIREMENT_TRACEABILITY.csv` before enabling any workflow.

- IntaSend claimant STK collection, authenticated webhook reconciliation, receipt, original-payer refund and M-Pesa B2C payout adapters are sandbox-only and disabled by default. Live provider mode is not supported in this replacement source.
- Claimant recovery-service charges are not Finder/Agent reward funding. A separate evidenced and independently verified reward pool uses the approved 33% Finder / 25% Agent / 42% Platform split.
- Eligible settlements are auto-approved after 48 hours from final release if no settlement hold exists. Payout creation, approval and execution remain separate manual actions; unknown outcomes are not automatically retried.
- Final physical release requires provider-confirmed claimant payment, claimant confirmation, identity/authority, active appointment and dispute-hold checks.
- In-app notification outbox/retries and claimant, Agent, Finder and Finance/Admin workspaces are source-added. External email/SMS/social notification and publishing remain disabled.
- Payment PII encryption is key-versioned with a feature-flagged Admin batch-rotation route. Personal data export and rights-request workflows exist; no data is automatically erased.
- CI/Docker/health/readiness/backup/restore/release-gate tooling and runbooks are source-added. No CI run, Docker build, database migration, encrypted backup or restore rehearsal has been executed in this environment.

## Verification and release status

The latest package-preparation checks are recorded in `docs/BUILD_STATUS.md` and `docs/BATCH29_TWO_ROLE_ADMIN_LIFECYCLE.md`. Batch 29 validation passed 66/66 Node-native policy tests, Stage 11 static guards, traceability for 166 requirement IDs, evidence-matrix validation for 166 rows, and migration metadata validation for 15 ordered migrations. Global TypeScript parsing reported no syntax diagnostics in the changed TypeScript/TSX files; this is not a semantic typecheck. Full dependency installation timed out, so full TypeScript, Vitest, build, PostgreSQL/API/browser/accessibility acceptance and independent reviews remain pending. Historical owner-reported Batch 16 results have not been independently reproduced against this saved ZIP; see `docs/CONFLICT_REGISTER.md` and `docs/OWNER_REPORTED_BATCH16_VERIFICATION_2026-11-14.md`.

The requirement register is the authoritative source for current status; source validators do not prove runtime acceptance. Batch 17 governance artifacts are included. The release state remains `NOT_AUTHORISED`; release gates must be rerun against the final package and independently approved before any deployment. Passing `npm run verify:all` does not authorise production deployment.


## Private evidence upload prerequisites

Claim evidence uploads accept actual PDF, JPEG, PNG and WebP content up to 10 MB. The API inspects file signatures, scans the bytes using ClamAV's `clamd` TCP INSTREAM protocol, preserves the original in private storage and creates a metadata-stripped WebP preview for images. If ClamAV or private storage is unavailable, uploads are rejected; they are never silently accepted without a scan.

For local development, install and run a private ClamAV daemon reachable only from the API machine/network, then configure `CLAMAV_HOST` and `CLAMAV_PORT` in `.env`. The TCP protocol is not encrypted or authenticated by ClamAV; do not expose the scanner port to the public internet. Set `FILE_STORAGE_DRIVER=local` for development and keep `.private-uploads` outside the static web root. For production, `FILE_STORAGE_DRIVER=s3`, `S3_BUCKET`, and `S3_REGION` are mandatory. Configure the bucket with Block Public Access, encryption, no public ACLs, least-privilege IAM access, access logging and backup/retention controls. The sample app does not automatically verify those bucket policies.

A file upload implementation is present, but ClamAV, S3, malware, retention and access-control integration tests have not yet been completed. Do not upload real identity documents or sensitive personal evidence until those gates are independently accepted.

## Create the first administrator/owner

1. Create and verify the intended Owner account.
2. Stop the app and use a protected operator shell connected only to a new, reviewed database.
3. Set `OWNER_BOOTSTRAP_EMAIL` in the protected local `.env` file to the exact verified Owner email. The script refuses if another active Owner exists. Do not pass this value on the command line or commit `.env`.
4. Run `npm run grant-role -- verified-owner@example.com owner` for the one-time bootstrap. Routine Admin grants and revocations are available only in the authenticated Super Admin workspace, require matching step-up verification and a reason, and are audit logged. The Owner workspace invalidates the target account's sessions on either change. The bootstrap command is a local operator utility, not a public API. Keep control of database credentials.

## Included in expanded implementation batches 1–5 and financial foundations

- Public landing page and navigation aligned with the approved public information architecture.
- Email OTP sign-in foundation.
- User and role data model; backend reloads active roles on each authenticated request.
- Server-side authentication and role middleware.
- Private-by-default lost/found report submission.
- County selection for all 47 Kenyan counties.
- Public found-notice feed constrained by consent, publication status and custody evidence.
- Claim submission and administrative claim-review foundations, including representative claimant authority verification and independent appeals.
- No-account lost/found reporting after email verification, secure private tracking links, guest consent management and email-OTP tracking-link recovery (the replacement-link flow has source implementation but still awaits local database and email-provider acceptance).
- Parent/guardian/family-representative attribution with separate authority checks before claim approval.
- Admin category proposal review and explicit permanent category creation.
- Agent application, approval, assignment and controlled custody-event foundations, including system-assessed training, legal-approved agreement versions, site inspection, appointment availability, collection checks, two-party transfer confirmation and custody-chain v2 source controls.
- Admin overview and report-review API.
- In-app notification listing and read-state endpoint.
- Initial relational schema for organisations, memberships, claims, agents, assignments, custody events, payment transactions, legacy ledger entries, immutable double-entry financial journals, settlements, documents, webhook events, notifications and audit events.
- Security headers, CORS allowlist, API rate limiting, request size limit and production secret validation.
- Initial private claim-evidence service with signature detection, ClamAV scanning, private storage, image previews and restricted reviewer access (runtime acceptance pending).
- Shared design colours, responsive layout, accessible focus states and reduced-motion handling.
- Implementation register, 166-row requirement traceability export, acceptance gates and operational runbooks.

## Historical batch upgrade notes

`docs/BATCH4_UPGRADE.md` is retained as historical context only. This ZIP is a consolidated clean-room source archive with an ordered migration history. Do not copy files from the legacy project, do not delete or replace the supplied migration history, and do not run `npm run db:generate` as a substitute for reviewing the supplied SQL migrations. Use a disposable database for all migration acceptance.

## Build and production packaging

`npm run build` typechecks the full project, builds the Vite frontend into `dist/`, and bundles the Express server into `dist-server/server.mjs`. `npm start` runs that server; in production it serves the static frontend from `dist/`. Install production dependencies for the runtime and provide the separately generated/applied database migrations. This packaging is not, by itself, production readiness.

## Important limitations: not production complete

This is an incremental implementation release, not the full Return4me system. The schema includes several future domains, but schema presence does not mean the workflow has been implemented.

Not yet implemented or verified:

- Full matching evaluation and candidate-review API foundation now exists; DB/runtime acceptance and broader manual matching remain outstanding.
- Full claimant/Agent document lifecycle, runtime-verified claim-evidence upload, retention/deletion and malware-evasion testing. Initial claim evidence upload/review source exists but is not acceptance-tested.
- Agent onboarding, manual verification, three-module training, versioned agreement acceptance, site inspection, availability/appointments, capacity review and custody operations now have source workflows. Their document lifecycle, expiry/renewal, API/DB/browser/concurrency acceptance and full Admin/Owner operating queues remain outstanding.
- Custody code, claimant identity/authority check, appointment, claimant confirmation and final-release source workflows exist. Disposable-PostgreSQL, email, race and browser acceptance remain outstanding; final release is server-gated by payment, identity, appointment and dispute checks.
- Organisation registration, hashed staff invitations and tenant-scoped report APIs now exist; cross-tenant acceptance tests and complete UI remain outstanding.
- Approved category administration, standard-category seeding and effective-dated KES schedules exist. Finance/Admin can prepare an assessment only after claim approval; the claimant can confirm the displayed amount and request a sandbox-gated M-Pesa prompt within the active payment window.
- IntaSend STK collection, authenticated webhook verification, payment idempotency and provider reconciliation.
- Itemised assessment and claimant confirmation are implemented in source; immutable balanced-journal foundation is added. Provider-integrated ledger posting, settlement calculation and payout execution remain unimplemented/blocked.
- 48-hour settlement approval automation; manual payout initiation and dual-control authorisation.
- Refund, reversal, chargeback, underpayment, overpayment and unknown-outcome workflows.
- Production-tested private object storage, malware scanner operations, evidence retention/deletion, and Agent KYC document workflows. Initial claim upload code exists but awaits independent tests.
- Communications templates/drafts/independent approval and a retryable in-app notification outbox exist; external email/SMS delivery, bounce/complaint processing and Facebook/Telegram integrations remain disabled.
- Full role-specific Admin and Owner dashboards, analytics, reports, bulk actions and configuration management.
- Support-ticket and dispute/hold API foundations now exist; appeal submission/review foundations are added, but complaint SLAs, investigations, multiple-claimant handling and complete Trust & Safety workflows remain unfinished.
- Production session hardening, privileged MFA, full CSRF strategy, password/account lifecycle (where required), comprehensive IP/device abuse controls and independent penetration testing.
- Monitoring, alerting, backup encryption, restore drills, disaster recovery and production deployment automation.
- Legal/privacy/tax/payment regulatory review and operating procedures.

There are explicitly locked collection, payout and refund endpoints. Finance provides readiness blockers, read-only journal/settlement views and itemised assessment preparation/confirmation. The journal foundation is not connected to IntaSend and is not an enabled payment system. No real money can be moved by this release.

## Security warning

Browser authentication now uses a random, database-backed, revocable session token in a short-lived HttpOnly, SameSite=Lax cookie; JavaScript does not receive or store the token. Individual sessions can be listed and revoked. Unsafe cookie-authenticated requests require an Origin matching `WEB_ORIGIN`, and production cookies add the Secure attribute. This is a stronger baseline, not a completed production security review: privileged MFA, device fingerprinting, CSRF penetration tests, key rotation, rate-limit tuning, security monitoring and independent penetration testing remain outstanding. Do not deploy this foundation as a public production service.

Also required before production: real Resend domain authentication; private object storage and malware scanning; strict webhook authentication; rate limits across IP, account and risk signals; privileged MFA; immutable/externally protected audit retention; independent security review; Kenyan privacy, tax, consumer and payments legal review.

## Financial invariants carried forward

- Target sharing policy: Finder 33%, Agent 25%, Return4me 42%.
- Historical allocations must be preserved as snapshots and migrated only through a separately authorised plan.
- 48-hour settlement eligibility is distinct from payout execution.
- Eligible settlement approval may be automatic after the approved 48-hour period, but payout initiation remains manual and admin-authorised.
- A dispute or legal hold pauses the affected settlement.
- IntaSend disbursement fees are a platform expense.
- A browser redirect or unverified callback must never confirm payment.
- Unknown payment outcomes must remain unknown/pending; never ask the payer to repeat payment merely because a request timed out.
- Do not expose customer-facing "escrow" wording.

## Documents

- `docs/IMPLEMENTATION_REGISTER.md` — requirement-to-batch status register.
- `docs/ARCHITECTURE.md` — security boundaries and domain rules.
- `docs/PHASES.md` — implementation order and gates.
- `docs/TESTING.md` — required test strategy.
- `docs/ROADMAP_1_TO_17.md` — stage-by-stage approved roadmap and current status.
- `docs/BUILD_STATUS.md` — current verification evidence and limitations.
- `docs/BATCH29_TWO_ROLE_ADMIN_LIFECYCLE.md` — two-role governance, Owner-controlled Admin access lifecycle and acceptance gaps.
- `docs/REQUIREMENT_TRACEABILITY.csv` — individual traceability for all 166 requirement IDs.
- `docs/REQUIREMENT_EVIDENCE_MATRIX.csv` — separate implementation, verification, independent acceptance and release evidence.
- `docs/RISK_REGISTER.csv`, `docs/CONFLICT_REGISTER.md`, `docs/INDEPENDENT_ACCEPTANCE_TEMPLATE.md` and `docs/RELEASE_AUTHORIZATION_CHECKLIST.md` — Batch 17 governance artifacts and Batch 29 two-role Admin lifecycle report.
- `docs/IMPLEMENTATION_PROGRESS_2026-11-14.md` — latest roadmap and delivery evidence.
- `docs/ACCEPTANCE_GATES.md` and `docs/OPERATIONS_RUNBOOK.md` — acceptance and safe operations controls.
- `docs/FILE_UPLOADS.md` — private evidence upload, ClamAV and storage configuration.

The project must continue in controlled batches. A requirement can be marked verified only when working functionality and acceptance evidence exist.


## Latest implementation checkpoint

Batch 22 hardens the Admin/Owner audit query parser and adds boundary tests. See `docs/BATCH22_AUDIT_QUERY_STRICTNESS.md` and `docs/ROADMAP_1_TO_22_UPDATED.md`. The 16 dependency-free audit query tests pass; this does not represent full project acceptance or production readiness.


## Latest update — Batch 30 (15 November 2026)
Additional high-risk step-up controls now cover Owner-only Agent agreement legal approval, Admin/Owner communications campaign approval, and Admin/Owner organisation status decisions. Organisation status updates are row-locked and audited transactionally with a correlation ID and required reason. See `docs/BATCH30_HIGH_RISK_STEP_UP.md`. Stage 11 remains partial pending runtime, browser, accessibility and independent security acceptance.
