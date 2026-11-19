# Return4me Roadmap — Consolidated update

**Date:** 14 November 2026  
**Baseline:** `Return4me_Batches_1-16_Batch16-Retry_2026-11-14.zip` plus Batch 17 governance artifacts added in this package.  
**Release state:** `NOT_AUTHORISED`.

## 1. Executive status

The saved source archive contains substantial implementation across all seventeen stage areas, but the requirements are not all complete. The authoritative 165-row `docs/REQUIREMENT_TRACEABILITY.csv` currently records:

| Source status | Requirements |
|---|---:|
| `PARTIAL` | 135 |
| `IMPLEMENTED_UNVERIFIED` | 22 |
| `BLOCKED` | 8 |
| `VERIFIED_COMPLETE` | 0 |
| **Total** | **165** |

This is a source-status count, not a technical acceptance count. `docs/REQUIREMENT_EVIDENCE_MATRIX.csv` keeps specification, implementation, technical verification, independent acceptance and release authorisation as separate dimensions. No requirement has been promoted to `VERIFIED_COMPLETE` in this update.

## 2. Stage roadmap

| Stage | Scope | Current status | Completed/source-present | Remaining work / acceptance |
|---|---|---|---|---|
| 1 | Product mission, Kenya service model, audiences and counties | PARTIAL | Public proposition, 47-county list, separate lost/found entry points, recovery caveat and reporting foundations | Verify actual authorised-agent coverage; complete audience journeys, service-area and content acceptance |
| 2 | Identity, verification, accounts, roles and sessions | PARTIAL | Email OTP and session foundations, role reload, cookie and Origin controls | Complete MFA/recovery, abuse controls and full role/action/object/field/tenant matrix |
| 3 | Reports, reporter/owner distinction, privacy and public notices | PARTIAL | Authenticated and guest reporting, consent-aware public notice controls, tracking tokens and representative attribution | Complete consent, retention, data rights, child safeguarding and field-level leakage acceptance |
| 4 | Matching and candidate review | IMPLEMENTED_UNVERIFIED | Explainable private matching and human review foundation | DB/API, false-positive, permissions, performance and manual review acceptance |
| 5 | Claims, ownership evidence, disputes and appeals | PARTIAL | Claim review, evidence upload/scanning/storage, representation and appeal foundations | Full claim conflict/legal workflows, security, concurrency and reviewer acceptance |
| 6 | Agent onboarding, verification, training, availability and directory | PARTIAL | Manual document review, training/agreement/service-site foundations and directory eligibility | Runtime storage/scanner, renewal, training/legal text and Admin/Owner acceptance |
| 7 | Assignment, custody, appointments and handover | PARTIAL | Assignment/capacity, custody-chain, transfer confirmation and collection-code foundations | Disposable-DB/concurrency/abuse tests and final handover acceptance; release remains gated |
| 8 | Organisations and tenant isolation | IMPLEMENTED_UNVERIFIED | Organisation membership, invitation and scoped access APIs | Cross-tenant negative tests, permission matrix, lifecycle and UI acceptance |
| 9 | Trust & Safety, disputes, support and escalation | PARTIAL | Dispute holds, support and incident triage foundations | Investigation/appeal/legal-hold, safeguarding, SLA and evidence-preservation acceptance |
| 10 | Public website, guidance, notices and pricing transparency | PARTIAL | Responsive public experience, help/pricing guidance and safe notice foundation | Final content/legal review, authentic licensed imagery, coverage feed and user testing |
| 11 | Admin Console and Owner Dashboard | PARTIAL | Admin operations endpoints and basic overview; some Owner/Admin aggregate visibility | Complete Owner governance, financial/operational analytics, audit explorer, separation-of-duties controls, queues, filters and permission tests |
| 12 | Pricing, collections, ledger, settlements, payouts, refunds and reconciliation | PARTIAL; live money movement BLOCKED | Pricing and payment architecture, IntaSend adapter/webhook foundations, immutable ledger/settlement controls, 48-hour eligibility and manual payout model | Provider contract/sandbox, ledger and historical snapshots, wallet/beneficiary verification, maker-checker, refund lifecycle, reconciliation and independent accounting review |
| 13 | Notifications, email and publishing | PARTIAL; external execution BLOCKED | In-app notifications/outbox, templates, campaign draft and approval foundations | Provider delivery/bounce/complaint lifecycle, Resend acceptance, channel permissions, retries and external publishing approval |
| 14 | Security, privacy, fraud and incident response | PARTIAL | Security middleware, audit events, privacy requests, incident and backup/restore runbook foundations | Full auth matrix, secrets rotation, security review/penetration test, privacy professional review and operational exercises |
| 15 | UX, themes, accessibility and role workspaces | PARTIAL | Design system and role workspace foundations | Complete all real API-connected role journeys, browser/device tests, WCAG 2.2 AA review, keyboard/screen-reader/contrast/zoom/reduced-motion acceptance |
| 16 | Technical architecture and operational readiness | PARTIAL | React/TypeScript/Vite/Express/Drizzle/PostgreSQL architecture, 11 migration files, CI and verification scripts | Reproduce clean install/typecheck/test/build; disposable PostgreSQL migration/concurrency tests; API security matrix; backup/restore, RPO/RTO, monitoring and rollback evidence |
| 17 | Governance, evidence, independent acceptance and release authorisation | IMPLEMENTED_UNVERIFIED | Added evidence matrix, conflict register, risk register, independent acceptance template, release checklist and governance validator | Reconcile approval provenance, exact test-name/evidence mapping, assign risk owners/dates, engage independent reviewers and obtain separate Owner release decision |

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

- `docs/REQUIREMENT_EVIDENCE_MATRIX.csv` — 165 requirement rows with distinct status dimensions. Exact test names and execution evidence remain blank until verified.
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
