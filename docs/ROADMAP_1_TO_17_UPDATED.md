# Return4me Roadmap — Consolidated update

**Date:** 16 November 2026  
**Baseline:** Complete consolidated source archive through Batch 49 (16 November 2026).  
**Release state:** `NOT_AUTHORISED`.

## 1. Executive status

The saved source archive contains substantial implementation across all seventeen stage areas, but the requirements are not all complete. The authoritative 166-row `docs/REQUIREMENT_TRACEABILITY.csv` currently records:

| Source status | Requirements |
|---|---:|
| `PARTIAL` | 136 |
| `IMPLEMENTED_UNVERIFIED` | 22 |
| `BLOCKED` | 8 |
| `VERIFIED_COMPLETE` | 0 |
| **Total** | **166** |

This is a source-status count, not a technical acceptance count. `docs/REQUIREMENT_EVIDENCE_MATRIX.csv` keeps specification, implementation, technical verification, independent acceptance and release authorisation as separate dimensions. No requirement has been promoted to `VERIFIED_COMPLETE` in this update.

## 2. Stage roadmap

| Stage | Scope | Current status | Completed/source-present | Remaining work / acceptance |
|---|---|---|---|---|
| 1 | Product mission, Kenya service model, audiences and counties | PARTIAL | Public proposition, 47-county list, separate lost/found entry points, recovery caveat and reporting foundations | Verify actual authorised-agent coverage; complete audience journeys, service-area and content acceptance |
| 2 | Identity, verification, accounts, roles and sessions | PARTIAL | Email OTP and session foundations, role reload, cookie and Origin controls | Complete MFA/recovery, abuse controls and full role/action/object/field/tenant matrix |
| 3 | Reports, reporter/owner distinction, privacy and public notices | PARTIAL | Authenticated and guest reporting, consent-aware public notice controls, tracking tokens and representative attribution | Complete consent, retention, data rights, child safeguarding and field-level leakage acceptance |
| 4 | Matching and candidate review | IMPLEMENTED_UNVERIFIED | Explainable private matching and human review foundation | DB/API, false-positive, permissions, performance and manual review acceptance |
| 5 | Claims, ownership evidence, disputes and appeals | PARTIAL | Claim review, evidence upload/scanning/storage, representation and appeal foundations | Full claim conflict/legal workflows, security, concurrency and reviewer acceptance |
| 6 | Agent onboarding, verification, training, availability and directory | PARTIAL | Manual document review, training/agreement/service-site foundations, directory eligibility and Batch 44 metadata-only Admin/Owner queue with audited restricted Agent detail | Runtime storage/scanner, renewal, training/legal text and Admin/Owner/API acceptance |
| 7 | Assignment, custody, appointments and handover | PARTIAL | Assignment/capacity, custody-chain, transfer confirmation and collection-code foundations | Disposable-DB/concurrency/abuse tests and final handover acceptance; release remains gated |
| 8 | Organisations and tenant isolation | IMPLEMENTED_UNVERIFIED | Organisation membership, invitation and scoped access APIs; Batch 44 metadata-only Admin/Owner queue and audited restricted detail | Cross-tenant negative tests, permission matrix, lifecycle and UI acceptance |
| 9 | Trust & Safety, disputes, support and escalation | PARTIAL | Dispute holds, support and incident triage foundations | Investigation/appeal/legal-hold, safeguarding, SLA and evidence-preservation acceptance |
| 10 | Public website, guidance, notices and pricing transparency | PARTIAL | Responsive public experience, help/pricing guidance and safe notice foundation | Final content/legal review, authentic licensed imagery, coverage feed and user testing |
| 11 | Admin Console and Owner Dashboard | PARTIAL | Admin operations, aggregate overview, audit explorer, capability matrix, maker/checker, step-up, audited approval history and restricted privacy/security/dispute/appeal/Agent/Organisation/Finance workspaces | Complete Owner analytics, remaining object/field/tenant authorization, case ownership, database/API/browser and independent acceptance |
| 12 | Pricing, collections, ledger, settlements, payouts, refunds and reconciliation | PARTIAL; live money movement BLOCKED | Pricing and payment architecture, IntaSend adapter/webhook foundations, immutable ledger/settlement controls, 48-hour eligibility, manual payout model and Batches 45–49 metadata-only Finance queues, audited detail endpoints, account-level ledger reconciliation, historical allocation policy review, aggregated operational control totals and fail-closed period-close preparation; Batch 59 adds third-party payer attestation, versioned allocation provenance, payout verification history, provider statement/reversal evidence registers, aged-liability review and hashed maker/checker period evidence review | Provider contract/sandbox, ledger and historical snapshots, wallet/beneficiary verification, maker-checker, refund lifecycle, reconciliation and independent accounting review |
| 13 | Notifications, email and publishing | PARTIAL; external execution BLOCKED | In-app notifications/outbox, templates, campaign draft and approval foundations | Provider delivery/bounce/complaint lifecycle, Resend acceptance, channel permissions, retries and external publishing approval |
| 14 | Security, privacy, fraud and incident response | PARTIAL | Security middleware, audit events, privacy/security incident workflows, private evidence controls and audited restricted detail access across governance and finance queues | Full auth matrix, secrets rotation, KMS/retention/DPIA, penetration test, privacy professional review and operational exercises |
| 15 | UX, themes, accessibility and role workspaces | PARTIAL | Design system, responsive role workspaces, Admin/Owner restricted case, Agent/Organisation and Finance record navigation | Complete all real API-connected role journeys, browser/device tests, WCAG 2.2 AA review, keyboard/screen-reader/contrast/zoom/reduced-motion acceptance |
| 16 | Technical architecture and operational readiness | PARTIAL | React/TypeScript/Vite/Express/Drizzle/PostgreSQL architecture, 22 ordered migration files as of Batch 63 (migrations 0018–0021 are prepared, not applied), CI/verification scripts; Batches 44–49: restricted Admin/Owner workspaces extended across Agent, Organisation and Finance; Batch 48 adds ledger reconciliation and historical 33/25/42 allocation review; Batch 49 adds consolidated Finance control totals and fail-closed period-close preparation; non-PostgreSQL verify:all passed with 92/92 Node-native tests across 15 suites, 156 TS/TSX syntax files and 166-row traceability/evidence; full semantic typecheck blocked by missing @types/node and vite/client | Full dependency-backed typecheck, Vitest/build; disposable PostgreSQL migration/concurrency tests; API security matrix; backup/restore, RPO/RTO, monitoring and rollback evidence |
| 17 | Governance, evidence, independent acceptance and release authorisation | PARTIAL | Evidence matrix, conflict register, risk register, independent acceptance template, release checklist, 166-row traceability/evidence validators and Batch 49 progress update | Reconcile approval provenance, exact test-name/evidence mapping, assign risk owners/dates, engage independent reviewers and obtain separate Owner release decision |

## 3. Batch 16 reported technical evidence — provenance limitation

The later owner-supplied Cline report states that `npm ci`, `npm run typecheck`, `npm test` (82/82 tests), `npm run build`, `npm run verify:all`, 11 PostgreSQL 16 local migrations and selected smoke checks passed. These are retained as **owner-reported results** and have not been independently reproduced against this saved archive in the current preparation environment.

The saved archive also contains earlier Batch 16 documents recording dependency-registry failure and no local database migration. Those historical records are not deleted; see `docs/CONFLICT_REGISTER.md`. The exact current working-tree snapshot, command logs and source hash must be captured before treating the later results as proof for this ZIP.

## 4. Batch 16 deferred items — open, not waived

1. Review five reported npm audit advisories without forced upgrades.
2. Rotate the local database credential previously exposed in conversation; never disclose the replacement.
3. Test all four claim-evidence routes for unauthenticated, wrong-role, wrong-owner, cross-tenant and authorised cases.
4. Complete the role/action/object/field/tenant authorization matrix.
5. Complete browser and accessibility acceptance across mobile/Android, keyboard, screen reader, contrast, zoom, reduced motion and slow network.
6. Execute backup/restore and rollback rehearsal and record RPO/RTO evidence.

These items are tracked in `docs/RISK_REGISTER.csv` and remain release blockers where applicable.

## 5. Stage 17 governance deliverables

- `docs/REQUIREMENT_EVIDENCE_MATRIX.csv` — 166 requirement rows with distinct status dimensions. Exact test names and execution evidence remain blank until verified.
- `docs/CONFLICT_REGISTER.md` — historical and source/evidence inconsistencies.
- `docs/RISK_REGISTER.csv` — deferred risks, external dependencies and professional review requirements.
- `docs/INDEPENDENT_ACCEPTANCE_TEMPLATE.md` — reviewer record template.
- `docs/RELEASE_AUTHORIZATION_CHECKLIST.md` — fail-closed release checklist.
- `scripts/verify-evidence-matrix.mjs` — prevents false `VERIFIED_COMPLETE` promotion without technical and independent evidence.

## 6. Release constraints

No production deployment, production database mutation, real customer data, live IntaSend collection/refund/payout, wallet transfer, production email/SMS, social publishing or public evidence access is authorised. No migration is applied by this package-generation task. The release state remains `NOT_AUTHORISED` until all applicable technical, security, legal/privacy, financial, accessibility, operational and independent review gates pass and the Owner separately authorises release.

## 7. Next implementation sequence

1. Reconcile the exact latest Windows working-tree source and the owner-reported Batch 16 logs against this archive.
2. Close the security/API authorization matrix and claim-evidence route coverage.
3. Complete the Admin/Owner operational workspaces and missing role journeys.
4. Complete finance integration acceptance in sandbox only, while keeping live money movement disabled.
5. Complete notification provider and private-storage runtime acceptance in non-production.
6. Complete accessibility/browser acceptance and backup/restore/RPO/RTO proof.
7. Obtain independent professional and technical acceptance; only then prepare a separate release decision.


## Batch 44 — Restricted Agent and Organisation Governance Workspaces (16 November 2026)

- Admin/Owner Agent queue now returns metadata only; service address, service phone, account email and application capacity notes are fetched only through a separate audited detail endpoint.
- Admin/Owner Organisation queue now omits registration identifiers; a separate audited detail endpoint returns restricted registration information and active member count.
- Added an Admin/Owner Agent and Organisation governance workspace; detail is fetched only after explicit record selection.
- No new privileged role and no schema migration were introduced.
- Stage 6 remains PARTIAL, Stage 8 remains IMPLEMENTED_UNVERIFIED, Stage 11 remains PARTIAL, and Stages 14–17 remain PARTIAL. No stage is promoted to VERIFIED_COMPLETE.
- PostgreSQL/API, browser/mobile/accessibility and independent acceptance remain pending. Production release remains NOT_AUTHORISED.


## Batch 45 — Restricted Finance Workspaces (16 November 2026)

Batch 45 converts the sensitive Finance queues to Admin/Owner-only metadata projections and adds separate audited detail endpoints for payments, settlements, refunds, payouts, collection reconciliation, reward funding authorizations and payout destinations. The Finance UI retrieves restricted details only on explicit selection. No ciphertext is returned; masked payer/destination values remain masked. No migration or provider call was made. Stage 12 remains PARTIAL and money movement BLOCKED pending PostgreSQL, accounting, provider, legal and independent acceptance.


## Batch 46 — Restricted Ledger and Provider Operation Details (16 November 2026)

- Converted the Admin/Owner financial journal endpoint to a metadata-only queue. Source IDs, idempotency keys, memo and debit/credit posting legs are available only through a separate Admin/Owner detail route.
- Added audited ledger journal detail access; journal records remain immutable and the route is read-only.
- Tightened the provider-operation attention queue to omit resource identifiers, provider references and idempotency keys. Added a separately audited Admin/Owner detail endpoint that exposes bounded operational evidence but no request payload.
- Added explicit journal and provider-operation detail selection to the Finance workspace. The recovery surface has no retry or dispatch action.
- Added Batch 47 static source guards and Node-native source tests. No schema migration, provider call, money movement or production action was performed.
- Stage 12 remains PARTIAL and money movement BLOCKED. Stages 11, 14, 15, 16 and 17 remain PARTIAL; original Stages 1–17 remain subject to requirement-level acceptance. PostgreSQL/API, full semantic TypeScript, Vitest/build, browser/accessibility, provider and independent accounting/security acceptance remain pending.


## Batch 47 — Combined Finance Oversight and Maker/Checker History (16 November 2026)

- Provider-operation attention now has bounded status filters and pagination, age/stale indicators, and an explicit no-retry policy. Stale means investigate, not failed.
- Immutable journal queues now support bounded pagination and source-type filtering; sensitive source and posting detail remains behind audited detail access.
- Admin/Owner approval history shows maker/reviewer references and decision context without exposing proposal payloads; history reads are audited.
- `npm run verify:all` passed with 82/82 Node-native tests across 13 suites, 156 syntax-transpiled TypeScript/TSX files, 166 traceability/evidence rows and 17 migration metadata entries. Full semantic typecheck is blocked by missing `@types/node` and `vite/client`. PostgreSQL was intentionally not run.
- Stage 11 remains PARTIAL; Stage 12 remains PARTIAL and money movement BLOCKED; no stage is independently accepted complete.


## Batch 48 — Combined Ledger Reconciliation and Settlement Policy Review (16 November 2026)

- Added a read-only Admin/Owner account-level ledger summary and journal-integrity exception report for empty or unbalanced journals.
- Added an audited, paginated comparison of immutable settlement snapshots against the approved Finder 33% / Agent 25% / Platform 42% split and cent-rounding policy. Historical rows are never silently rewritten.
- Extended approval history with explicit expiry-state and remaining-time indicators.
- Added Finance UI panels for account balances, journal exceptions and historical allocation differences.
- Batch 48 source guard 15/15 and focused Node-native tests 5/5 passed. Full non-PostgreSQL verify:all passed with 87/87 Node-native tests across 14 suites, 156 syntax-transpiled TypeScript/TSX files, 166 traceability/evidence rows and 17 migration metadata entries.
- Full semantic TypeScript and production build are blocked by missing `@types/node` and `vite/client`; Vitest is unavailable. PostgreSQL intentionally not run. No migration was added/applied.
- Original Stages 1–17 remain PARTIAL or IMPLEMENTED_UNVERIFIED as listed; no stage is independently accepted or production-ready. Stage 12 money movement remains BLOCKED.


## Batch 49 — Combined Finance Control Totals and Period-Close Preparation (16 November 2026)

- Added Admin/Owner-only grouped control totals for collection reconciliation, refund, payout, provider-operation and payment streams, without exposing row-level PII or provider references.
- Added an audited read-only period-close preparation report. It surfaces unresolved reconciliation, refund, payout, provider-operation and journal-integrity counts.
- Added Finance UI visibility for close blockers. `readyForClose` remains false and no close operation exists in this report; independent Finance approval and verified provider-to-ledger matching are still required.
- Batch 49 static source guard 14/14 and focused Node-native tests 5/5 passed. Full non-PostgreSQL `npm run verify:all` passed with 92/92 Node-native tests across 15 suites, 156 TS/TSX syntax files, 166 traceability/evidence rows and 17 ordered migration metadata entries.
- No migration was added/applied and no provider call, money movement or production operation occurred. Stage 12 remains PARTIAL; money movement and period-close execution remain blocked.

## Batch 50 — Finance evidence matching and completeness (16 November 2026)

- Added Admin/Owner-only read-only collection reconciliation candidate matching using the exact internal transaction UUID written by the exception writer, provider invoice binding, confirmed transaction, matching KES amount facts and balanced collection journal.
- Candidate states distinguish unlinked, invoice mismatch, unconfirmed payment, amount/currency mismatch, missing/duplicated journal, unbalanced/incomplete journal and evidence-supported candidate. Candidate-supported does not resolve or reconcile an item.
- Added Admin/Owner-only refund/payout evidence completeness indicators for provider references/outcomes, lifecycle timestamps, refund reconciliation evidence and payout journal presence.
- Both routes audit metadata-only reads. No migration, provider call, money movement, journal mutation, reconciliation decision, period close, deployment or publication occurred.
- Stage 12 remains PARTIAL and money movement BLOCKED. Original Stages 1–17 remain as recorded below; no stage is independently accepted complete.

### Original Stages 1–17 status after Batch 50

| Stage | Status |
|---|---|
| 1 Product/service model | PARTIAL |
| 2 Identity/accounts/roles | PARTIAL |
| 3 Reports/privacy/public notices | PARTIAL |
| 4 Matching | IMPLEMENTED_UNVERIFIED |
| 5 Claims/evidence/disputes/appeals | PARTIAL |
| 6 Agent lifecycle | PARTIAL |
| 7 Assignment/custody/handover | PARTIAL |
| 8 Organisations/tenancy | IMPLEMENTED_UNVERIFIED |
| 9 Trust & Safety/support | PARTIAL |
| 10 Public website/content | PARTIAL |
| 11 Admin/Owner governance | PARTIAL |
| 12 Finance/payments | PARTIAL — money movement BLOCKED |
| 13 Communications | PARTIAL — external publishing BLOCKED |
| 14 Security/privacy | PARTIAL |
| 15 UX/accessibility | PARTIAL |
| 16 Architecture/verification | PARTIAL |
| 17 Governance/evidence/release | PARTIAL |

Batch 50 source checks are not independent acceptance. PostgreSQL runtime/API, provider-statement reconciliation, accounting, concurrency, browser/mobile/accessibility, privacy/security and independent review remain pending. Production release remains NOT_AUTHORISED.

### Batch 50 verification and remaining gates

- PASS: 15/15 Batch 50 source assertions; 5/5 focused Node-native tests; full non-PostgreSQL `verify:all` 91/91 Node-native tests across 15 suites; 156 TypeScript/TSX syntax files; 168 traceability IDs; 168 evidence rows; 17 ordered migration metadata entries.
- BLOCKED: semantic typecheck and production build (missing `@types/node`, `vite/client`); Vitest (not installed); release check (approval and environment gates).
- NOT RUN: PostgreSQL integration, migration execution, provider sandbox/live calls, deployment and production operations.


## Batch 59 — Stage 12 Finance lifecycle/evidence reconstruction (17 November 2026)

- Reconstructed missing Batch 59 scope against actual Batch 60 source; added migration 0019, NOT applied.
- Added payer authorisation attestation, immutable historical allocation review, payout destination verification history, provider statement/reversal evidence registers, aged liability review, and hashed maker/checker period evidence review.
- No historical allocation rewrite, provider statement parsing, post-handover journal, period close or money movement. Stage 12 remains PARTIAL and live money movement BLOCKED.
- Application testing is deferred until all stage implementations are complete.
