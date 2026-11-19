# Return4me Roadmap — Updated after owner-reported Batch 16 verification

**Date:** 14 November 2026  
**Project:** Clean-room Return4me rebuild  
**Current activity:** Batch 17 — evidence consolidation and governance  
**Important:** Batch 16 technical results below are reported by the owner from Cline execution. They have not been independently reproduced here. Batch 16 security, UX and operational acceptance items are explicitly deferred, not waived.

## 1. Current status summary

| Stage | Scope | Current status | Notes |
|---|---|---|---|
| 1–3 | Product, identity, reports and privacy foundations | Source present; acceptance pending | Full consent, privacy and permission evidence remains incomplete |
| 4–5 | Matching, claims, evidence, disputes and appeals | Source present; acceptance pending | DB/API, ownership, legal and concurrency acceptance remains |
| 6–7 | Agent onboarding, assignment, custody and handover | Source present; acceptance pending | Malware/storage, custody concurrency and final release gates remain |
| 8–9 | Organisations, tenant isolation, Trust & Safety and support | Source present; acceptance pending | Cross-tenant and investigation workflows remain |
| 10–11 | Public website, Admin and Owner surfaces | Source present; acceptance pending | Complete role workspaces, governance and analytics remain |
| 12 | Payments, ledger, refunds, settlements and reconciliation | Source present; live financial execution blocked | Provider, accounting, wallet, payout and independent controls remain |
| 13 | Notifications and publishing | Partial; external execution blocked | Delivery providers, channel permissions and operational acceptance remain |
| 14 | Security, privacy, fraud and incident response | Partial | Professional review, MFA, monitoring and key controls remain |
| 15 | UX, themes, accessibility and role workspaces | Partial | Full role workflows and accessibility/device acceptance remain |
| 16 | Technical verification and runtime setup | Core technical checks owner-reported passed; acceptance remains open | 82/82 tests, typecheck, build, verify:all, 11 local migrations and smoke checks reported passed; deferred items listed below |
| 17 | Evidence consolidation, governance and independent acceptance | IN PROGRESS | Batch 17 workplan established; no independent acceptance or release approval claimed |

## 2. Batch 16 evidence reported by owner

- `npm ci`: exit 0; 307 packages; no lockfile change.
- `npm run typecheck`: exit 0.
- `npm test`: 82/82 tests passed across 17 files.
- `npm run build`: exit 0; Vite output and `dist-server/server.mjs` produced.
- `npm run verify:all`: exit 0; 77 TypeScript/TSX files, 165 requirement IDs, 11 ordered migrations.
- PostgreSQL 16 local cluster: all 11 migrations applied; SQL file hashes match migration records.
- Health/readiness, Vite proxy, development OTP sign-in and Admin overview smoke checks reported successful.
- One unauthenticated claim-evidence endpoint request reportedly returned 401.

Evidence provenance: owner-provided Cline report dated 14 November 2026. Preserve original logs, source snapshot/commit and environment details in the working project. Do not treat this summary as independently reproduced proof.

## 3. Deferred Batch 16 work — still open

1. Review one high and four moderate npm audit advisories; no forced upgrade.
2. Rotate the local database credential that was pasted into conversation text; do not expose its replacement.
3. Test all four claim-evidence routes across unauthenticated, wrong-role, wrong-owner, cross-tenant and authorised cases.
4. Complete role/action/object/field/tenant authorization matrix.
5. Complete browser journeys, mobile/Android, keyboard, screen-reader, contrast, zoom, reduced-motion and slow-network acceptance.
6. Execute backup/restore and rollback proof with RPO/RTO evidence.

The Owner has chosen to defer these items while continuing Batch 17 documentation and governance. They remain open and must not be silently waived. This deferral does not authorise production release or external/live operations.

## 4. Batch 17 work plan

| Workstream | Requirement IDs | Deliverable | Status |
|---|---|---|---|
| Consolidated contract | GOV-001 | Canonical product/technical contract; decision provenance and conflict register | In progress |
| Evidence traceability | GOV-002 | 165-ID matrix with source, test, run evidence, reviewer and gaps | Pending completion |
| Status semantics | GOV-003 | Separate specification, implementation, technical verification, independent acceptance and release states | In progress |
| Risk/dependency governance | GOV-004 | Owned risk, dependency and deferral register with review dates | Pending completion |
| Release authorisation | GOV-005 | Fail-closed release checklist; production remains NOT_AUTHORISED | In progress |

## 5. Explicit restrictions

- No production deployment or customer data.
- No live IntaSend calls, STK collections, refunds, payouts or wallet transfers.
- No production email/SMS or social publishing.
- No public evidence downloads.
- No destructive database reset, truncation or migration rollback.
- No lockfile rewrite or forced dependency upgrade without a reviewed plan and approval.
- No commit/push unless separately authorised.

## 6. Next step

Complete Batch 17 evidence consolidation in the working project while preserving the existing local environment. Independent acceptance must remain pending until appropriately independent reviewers examine the evidence. Batch 16 deferred security, browser and operational items remain visible in the risk register and must be scheduled for remediation before any relevant release gate can pass.
