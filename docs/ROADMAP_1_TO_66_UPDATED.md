# Return4me master roadmap — Stages 1–23 and implementation batches through 67

**Updated:** 17 November 2026  
**Current source baseline:** Cumulative Batches 59–67 (Batch 67 source additions; unverified).  
**Policy:** Source implementation is frozen for consolidated testing; acceptance remains separate.

## Stage roadmap

| Stage | Status | Main remaining work | Acceptance |
|---|---|---|---|
| Stages 1–10 | PARTIAL | Complete role/account, report, matching, claim, dispute, Agent, custody, organisation and trust journeys | Deferred to Batch 67 |
| Stage 11 — Admin/Owner | PARTIAL | Route-level object/field permissions, complete queue coverage, Owner oversight and audit coupling | Deferred |
| Stage 12 — Finance | PARTIAL | Provider statement ingestion/matching, correcting journals, treasury/fees, historical allocation review and accounting acceptance | Deferred; live movement disabled |
| Stage 13 — Communications | PARTIAL | Durable outbox/retries, deliverability, suppression, provider setup and moderation | Deferred; external publishing disabled |
| Stage 14 — Security/Privacy | PARTIAL | Retention/hold enforcement, document access coverage, tenant authorization, incident exercises and legal review | Deferred |
| Stage 15 — UX/Accessibility | PARTIAL | Remaining role journeys, shared components and WCAG 2.2 AA device/assistive-technology acceptance | Deferred |
| Stage 16 — Technical Architecture | PARTIAL | Telemetry/alerts, migration-version readiness, backup/restore, approved RPO/RTO, SBOM and rollback rehearsal | Deferred |
| Stage 17 — Governance/Evidence | PARTIAL | Canonical approval provenance, immutable execution evidence, independent signatures and release authorisation | Deferred |
| Stages 18–23 | Existing historical scope | Preserve prior requirements and verify evidence against current source | Deferred |

## Batch tracker

| Batch | Scope | Status |
|---|---|---|
| 59 | Stage 12 Finance reconstruction | Source additions included; PARTIAL/unverified |
| 60 | Stage 13 Communications | Source additions included; PARTIAL/unverified |
| 61 | Stage 14 Security/Privacy/Fraud | Source additions included; PARTIAL/unverified |
| 62 | Stage 15 UX/Accessibility | Source additions included; PARTIAL/unverified |
| 63 | Stage 16 Technical Architecture | Source additions included; PARTIAL/unverified |
| 64 | Stage 17 Governance/Evidence | Traceability reconciled to 173 IDs; PARTIAL/unverified |
| 65 | Stages 1–10 coverage and Agent directory | Source additions included; PARTIAL/unverified |
| 66 | Cross-stage integration review and source baseline snapshot | Documentation/registers/manifest completed; runtime checks intentionally not run |
| 67 | Remaining source implementation gap closure; Batch 67A adds cross-instance worker locking | IN PROGRESS — implementation only; no testing |
| 68 | Final cross-stage integration and implementation freeze | Pending source completion |
| 69 | Consolidated testing and independent acceptance | Pending; only after Batch 68 and all implementation gaps are closed |

## Batch 66 findings

- 173 requirement rows in each register; 1,206 traceability path references and 1,220 evidence path references; zero missing referenced paths.
- 22 migration journal entries, contiguous indices 0–21, with 22 matching SQL files; migrations 0018–0021 remain unapplied.
- 16 cross-stage integration seams recorded; all NOT_VERIFIED.
- Readiness checks selected tables but not exact migration journal version; worker multi-instance coordination and shared rate limiting require acceptance.
- Source freeze hashes are recorded in `docs/SOURCE_FREEZE_MANIFEST.csv`.
- No tests, typecheck, build, lint, database, API, browser, security, performance, accessibility or provider sandbox checks were run in Batch 66.

## Batch 69 verification plan (after Batch 67 source closure and Batch 68 freeze)

1. Preserve Batch 66 archive/hash as immutable input; perform all testing on a disposable working copy.
2. Install dependencies from the lockfile and record tool/runtime versions; do not mutate production or owner data.
3. Run source/traceability/migration/evidence/governance checks, typecheck, lint if configured, frontend/server builds and full unit/contract suites.
4. Apply every migration to a clean disposable PostgreSQL instance, verify migration journal and schema, then run DB integration, concurrency, rollback and worker coordination suites.
5. Run API authorization, role/object/field/tenant denial, replay, abuse, callback, privacy, financial and custody tests.
6. Use provider sandbox only after credentials and exact provider contract are verified; never use live wallets or real funds.
7. Run browser journeys for every role and mobile/tablet/desktop, keyboard/screen-reader and WCAG 2.2 AA checks.
8. Record exact command outputs, commit/source hashes, database version, screenshots, provider sandbox evidence, failures and remediation in the evidence registers.
9. Independent reviewers decide acceptance per requirement. Do not change a requirement to VERIFIED_COMPLETE based solely on a passing unit suite or source path.
10. Keep all live provider operations, external publishing, production migrations, item release and deployment disabled until separate explicit approvals and all professional/operational gates pass.

## Global status

All 173 independent acceptance decisions remain PENDING; release remains NOT_AUTHORISED. Batch 66 is a documented source baseline snapshot, not a final implementation freeze and not a claim of full functionality, security, legal compliance or production readiness. Stages 1–17 still have source and/or professional acceptance gaps; Batch 67 must close remaining source work before any consolidated testing.


## Batch 67A update — Stage 16 distributed workers

- Added a dedicated PostgreSQL advisory-lock pool and per-worker session advisory lock in `runObservedWorker`; same-named workers are skipped when another API instance holds the lock.
- Added lock release/session-destruction handling and graceful shutdown of the dedicated lock pool.
- Updated OPS-003 and INT-015 traceability. No verification or acceptance status was upgraded.
- Remaining Batch 67 work includes migration-version readiness, shared Agent directory rate limiting and other source gaps across Stages 1–15 and 17.
- No tests/typecheck/build/lint/database/API/browser/concurrency/security/performance/accessibility/provider checks run.
