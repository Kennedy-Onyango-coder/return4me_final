# Return4me Batch 17 — Evidence Consolidation & Governance Workplan

**Date:** 14 November 2026  
**Project:** Return4me clean-room rebuild  
**Scope:** Governance and evidence consolidation only. This document does not certify independent acceptance or authorise production release.

## 1. Entry position

The latest Cline report supplied by the project owner states that the working clean-room project completed:

- `npm ci` successfully, without changing `package.json` or `package-lock.json`;
- `npm run typecheck` successfully;
- `npm test`: 82/82 tests passed across 17 files;
- `npm run build` successfully;
- `npm run verify:all` successfully: 77 TypeScript/TSX files, 165 traceable requirement IDs and 11 ordered migrations;
- all 11 migrations applied to a local PostgreSQL 16 database;
- health/readiness, OTP sign-in, Admin overview and a claim-evidence unauthenticated-request smoke test.

These are **owner-supplied Cline execution results**, not independently reproduced by this document's author. Preserve the logs and exact commit/source snapshot that produced them. Do not copy the earlier packaging-environment Batch 16 blocker text forward as the current result without a superseding dated entry.

## 2. Batch 16 carry-forward — deferred, not waived

The project owner has elected to continue with remaining batches and address the following later. Record these as open risks; do not silently mark them resolved or accepted:

| Ref | Deferred item | Current evidence | Required later action |
|---|---|---|---|
| B16-SEC-01 | Five npm audit advisories (one high in `sharp` dependency chain; four moderate in `drizzle-kit` / `@esbuild-kit/esm-loader`) | Cline reported advisories; no lockfile changes made | Capture full `npm audit --json`, dependency paths, patched versions and non-breaking remediation options; apply only after approval; rerun tests/build |
| B16-SEC-02 | Local PostgreSQL credential appeared in conversation text | Credential was pasted in a command | Rotate local-only DB credential and update local `.env`/password file securely; never include replacement secret in logs or chat |
| B16-SEC-03 | Full claim-evidence route authorization coverage | One unauthenticated evidence request returned 401; Cline reports per-route auth on four endpoints | Test all four endpoints unauthenticated, wrong-role, wrong-owner, cross-tenant and authorised-owner cases |
| B16-SEC-04 | Broader API/object/field/tenant authorization matrix | Not yet independently demonstrated | Complete role/action/object/field/tenant negative and positive test matrix |
| B16-UX-01 | Full browser and accessibility acceptance | Home page screenshot and basic SPA render reported | Test core workflows, mobile/Android viewport, keyboard, screen reader, contrast, zoom, reduced motion and slow network |
| B16-OPS-01 | Backup/restore and rollback operational proof | Runbooks exist; execution not demonstrated in latest report | Restore into disposable environment, record RPO/RTO and rollback proof |

**Deferral rule:** Deferring these tasks permits Batch 17 documentation and evidence-management work to proceed. It does not permit production deployment, live payments, public evidence downloads, external publishing or any capability whose release gate depends on these controls.

## 3. GOV-001 — consolidated product and technical contract

**Existing sources:**
- `docs/MASTER_REQUIREMENTS.md`
- `docs/ROADMAP_1_TO_17.md`
- `docs/IMPLEMENTATION_REGISTER.md`
- `docs/REQUIREMENT_TRACEABILITY.csv`
- `docs/ACCEPTANCE_GATES.md`
- `docs/BATCH7_INTASEND_COLLECTION.md` through `docs/BATCH15_UX_THEMES_ACCESSIBILITY.md`
- `docs/runbooks/`

**Work required:**
1. Reconcile these documents into one canonical requirements contract without deleting detailed batch specifications.
2. Preserve every approved policy and explicit user decision, including payment allocation (Finder 33%, Agent 25%, Platform 42%), 48-hour settlement eligibility, manual Admin-authorised payout initiation, dispute pause, platform-paid disbursement fees, no blind retry for ambiguous provider outcomes, and all live provider operations disabled until separately authorised.
3. Record source provenance for each requirement: approval reference/date if available, otherwise `approval_reference_pending` rather than inventing one.
4. Identify contradictions and unresolved wording; do not resolve policy by assumption.

**Exit evidence:** canonical contract, conflict register, and a mapping from every requirement ID to the canonical section and source evidence.

## 4. GOV-002 — requirement-to-evidence traceability

The current register contains 165 requirement IDs. For every ID, maintain these distinct fields:

- requirement ID and exact requirement text;
- approval provenance (or explicitly pending provenance);
- implementation status: `NOT_STARTED`, `PARTIAL`, `IMPLEMENTED_UNVERIFIED`, `BLOCKED`;
- source paths and relevant API/schema/migration identifiers;
- automated test paths and exact test names;
- execution evidence (command, date, environment, exit code, result summary, log path/hash);
- manual acceptance evidence and reviewer;
- unresolved risks/dependencies;
- acceptance status: `PENDING`, `ACCEPTED`, `REJECTED`, `DEFERRED`;
- acceptance date and reviewer evidence.

Do not mark a requirement `VERIFIED_COMPLETE` merely because source exists or a broad test suite passes. Do not invent per-requirement test coverage from a suite-level pass.

**Exit evidence:** all 165 IDs accounted for, missing fields explicitly identified, no orphan requirements, no fabricated test mappings.

## 5. GOV-003 — status and evidence semantics

Use separate status dimensions rather than one overloaded status:

| Dimension | Allowed values |
|---|---|
| Specification | `APPROVED`, `DRAFT`, `CONFLICTED`, `PROVENANCE_PENDING` |
| Implementation | `NOT_STARTED`, `PARTIAL`, `IMPLEMENTED` |
| Technical verification | `NOT_RUN`, `PASSED`, `FAILED`, `BLOCKED` |
| Independent acceptance | `PENDING`, `ACCEPTED`, `REJECTED`, `DEFERRED` |
| Release authorisation | `NOT_AUTHORISED`, `CONDITIONALLY_AUTHORISED`, `AUTHORISED` |

A successful `npm test` is suite-level evidence, not automatic acceptance of every requirement. Local smoke tests are not production acceptance. A migration applied locally is not a production migration approval.

**Exit evidence:** status glossary adopted in roadmap, implementation register and traceability report; no requirement conflates implementation with acceptance.

## 6. GOV-004 — unresolved risk, dependency and decision register

Maintain a register with: unique ID, description, affected requirements, severity, likelihood, owner, mitigation, due date, evidence, decision, and status. Initial entries must include:

- the six deferred items in Section 2;
- IntaSend provider credentials, webhook verification, idempotency and authoritative status reconciliation;
- wallet/beneficiary verification and payout permissions;
- ledger/reconciliation/accounting review;
- S3/private-storage and ClamAV runtime acceptance;
- Resend/domain verification and notification delivery/bounce/complaint handling;
- Kenya privacy, consumer, payments, tax and accounting professional review, including ODPC/DPIA applicability;
- backup/restore, monitoring, RPO/RTO and incident exercises;
- external social publishing permissions and channel acceptance;
- final Owner release decision.

Do not set an item to `CLOSED` without evidence. A management decision to defer must be recorded as `DEFERRED`, with owner and review date; it is not a technical fix or risk acceptance unless explicitly documented as such.

## 7. GOV-005 — separate release authorisation

The existing fail-closed release gate and release runbook must remain authoritative. Batch 17 must confirm:

1. A product specification approval is not production deployment approval.
2. Production release requires independent technical/security acceptance, professional/legal review, finance/accounting controls, operational/DR proof, and explicit Owner authorisation.
3. Collection, payouts, refunds, notifications and publishing remain disabled until their own prerequisites and explicit approvals are met.
4. No live IntaSend calls, real money movement, production customer data, public evidence access or production deployment occur as part of Batch 17.

**Exit evidence:** signed-off release checklist template and an explicit `NOT_AUTHORISED` release state until the Owner separately authorises it.

## 8. Batch 17 deliverables

1. Canonical consolidated product/technical contract and conflict register.
2. 165-ID evidence traceability matrix with per-requirement evidence gaps.
3. Updated implementation and acceptance registers with separate status dimensions.
4. Risk/dependency/deferral register with owners and review dates.
5. Independent review checklist and reviewer evidence template.
6. Fail-closed release authorisation checklist.
7. Updated roadmap with Batch 16 reported checks and deferred acceptance items accurately represented.

## 9. Independence and limitations

The implementation author must not mark their own work independently accepted. Independent reviewers must be named and their scope/evidence recorded. Legal, privacy, payment, accounting, penetration-testing and accessibility sign-offs require appropriately qualified reviewers. Where those reviewers are not yet engaged, the relevant acceptance remains `PENDING` or `BLOCKED`.

**Batch 17 status at entry: PARTIAL / IN PROGRESS.** Existing governance documents are present, but consolidation, provenance reconciliation, per-requirement evidence completeness, risk ownership and independent review are outstanding.
