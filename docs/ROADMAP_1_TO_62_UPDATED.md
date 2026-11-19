# Return4me master roadmap — Stages 1–23 and implementation batches through 62

**Updated:** 17 November 2026  
**Current source baseline:** Combined Batches 59–62, reconstructed against the actual accessible Batch 60 archive  
**Implementation policy:** Complete source implementation across all stages before running application tests and acceptance.

## Important baseline reconciliation

The earlier claimed Batch 59 archive/working copy was not present in the accessible Batch 58 baseline. Batch 60 therefore used migration 0018 for Stage 13 communications. This continuation reconstructed the documented outstanding Stage 12 Finance scope against the actual Batch 60 source tree and added migration 0019. The combined source now includes both migrations in sequence; neither has been applied. This is a reconstruction of the described Finance gaps, not recovery of the unavailable earlier Batch 59 archive. Stage 12 remains PARTIAL and unverified.

## Stage roadmap

| Stage | Current status | Implementation still required | Acceptance status |
|---|---|---|---|
| Stages 1–10 | Existing source; incomplete evidence | Requirement-level source gaps across product, identity, reports, matching, claims, agents, custody, organisations, Trust & Safety and public experience | Deferred until implementation freeze |
| Stage 11 — Admin/Owner governance | PARTIAL | Remaining route-by-route object/field/tenant authorization, uncovered case ownership, complete queue coverage and Owner oversight | Deferred |
| Stage 12 — Finance | PARTIAL | Batch 59 reconstructed: payer attestation, historical allocation review evidence, payout destination verification history, provider statement/reversal evidence registers, aged liabilities and hashed maker/checker period review. Actual statement ingestion/matching, post-handover correcting journals, treasury/fee accounting, historical backfill and professional close remain | Deferred |
| Stage 13 — Communications | PARTIAL | Batch 60 adds consent/preferences, notification governance, approver/publisher separation, campaign lifecycle, privacy screening and Resend event intake. Transactional email outbox/retries, complete deliverability, social provider setup, channel suppression and complete moderation remain | Deferred |
| Stage 14 — Security/privacy | PARTIAL | Batch 61 adds legal-hold records, inactive retention proposals, human risk-review cases, incident impact assessments and claim-document access audit. Still missing end-to-end retention/hold enforcement, fraud appeals/signals, full document-access coverage, tenant-wide authorization audit, DR and legal/independent acceptance | Deferred |
| Stage 15 — UX/accessibility | PARTIAL | Batch 62 adds the API-backed organisation workspace, organisation activity endpoint, responsive workspace patterns, semantic tables/forms, shared design tokens and additional keyboard/accessibility foundations. Remaining role journeys, editable organisation settings, global component extraction, full WCAG 2.2 AA implementation and device acceptance remain | Deferred |
| Stage 16 — Technical architecture | PARTIAL | Dependency-complete typecheck/build, observability, backup/restore, RPO/RTO, operations and recovery tooling | Deferred |
| Stage 17 — Governance | PARTIAL | Evidence provenance, complete requirement-to-test mapping, independent sign-offs and release authorization | Deferred |
| Stages 18–23 | Historical incremental work | Preserve prior source and evidence; reconcile any remaining requirements without treating historical static checks as acceptance | Deferred |

## Batch tracker

| Batch | Combined scope | Status |
|---|---|---|
| 50 | Finance evidence matching | Source in prior archive; acceptance open |
| 51 | Claim privacy and restricted detail | Source in prior archive; acceptance open |
| 52–54 | Maker/checker, step-up and audit integrity | Source in prior archive; migration 0017 prepared, not applied |
| 55–56 | Admin/Owner permission inventory and oversight | Source in prior archive; acceptance open |
| 57 | PostgreSQL/API acceptance harness | Prepared in prior archive; tests deferred |
| 58 | Unresolved collection attention queue | Source in prior archive; tests deferred |
| 59 | Reconstructed Stage 12 Finance lifecycle/evidence safeguards | **Source implemented partially in current combined archive; unverified** |
| 60 | Stage 13 communications and notification governance | **Source implementation included; unverified** |
| 61 | Stage 14 security, privacy, fraud and incident response | **Source implementation added; unverified; Stage 14 PARTIAL** |
| 62 | Stage 15 organisation workspace, responsive UX and accessibility foundations | **Source implementation added; unverified; Stage 15 PARTIAL** |
| 63 | Stage 16 architecture, observability, backup/restore and operational tooling | Pending — next batch |
| 64 | Stage 17 evidence governance, traceability and release controls | Pending |
| 65 | Remaining Stages 1–10 source-gap closure | Pending |
| 66 | Cross-stage reconciliation, integration wiring and implementation freeze | Pending |
| 67 | Consolidated technical tests, PostgreSQL/API/browser/accessibility and independent acceptance | Pending; start only after Batch 66 |

## Batch 60 checkpoint

- Migration `0018_stage13_communications_governance.sql` added to migration journal index 18; NOT applied.
- Source includes notification categories/priorities, idempotency keys, optional community preferences, explicit email consent history, designated Approver and Publisher, template/campaign review, scheduling, withdrawal, found-notice custody/consent gate, privacy screening, signed Resend event intake and grouped notification centre.
- External campaign publishing, Facebook/Telegram posting, SMS and WhatsApp remain disabled.
- Resend webhook secret is not configured.
- `COMM-001`–`COMM-015` remain partial/not-started according to the remaining gaps. No communications requirement is accepted or production-ready.
- The exact technical verification, independent acceptance and release fields remain NOT_RUN/PENDING/NOT_AUTHORISED.

## Testing policy and acceptance freeze

Per user instruction, **do not run application tests, typecheck, build, PostgreSQL integration, API tests, browser tests or accessibility tests during implementation batches**. Track them as deferred. After Batch 66, run the consolidated programme from a dependency-complete environment and disposable PostgreSQL database, fix failures, repeat affected tests, obtain independent acceptance and separately obtain production authorization.

## Safety

No production migration, provider call, message dispatch, external publication, deployment, money movement, refund, payout, wallet action, item release, commit or push was performed in Batch 60. No application test result is claimed.


## Batch 59 — Stage 12 Finance lifecycle/evidence reconstruction (17 November 2026)

- Added migration `0019_stage12_finance_lifecycle_evidence.sql` after Stage 13 migration 0018; prepared, NOT applied.
- Added third-party payer authorisation attestation, versioned settlement allocation provenance, immutable allocation review records, payout destination verification event history, provider statement evidence register, provider reversal/chargeback case register, dormant liability aging/manual review and hashed period-close review requests.
- Added Finance UI/API integration, personal-data export inclusion for payer authorisations, and purpose-specific step-up mappings.
- No live provider operations, ledger mutation, period close, migration or application tests. All application acceptance remains deferred until after all stage implementations.
- Stage 12 remains PARTIAL; statement ingestion, automatic provider-to-ledger matching, post-handover correcting journals, fee/treasury accounting and professional accounting acceptance remain open.


## Batch 61 — Stage 14 security/privacy/fraud implementation (17 November 2026)

- Added migration `0020_stage14_security_privacy_fraud_governance.sql`; journal index 20; NOT applied.
- Added Admin/Owner step-up legal-hold creation/release, inactive retention policy proposals, risk-based human review cases with second-person decision and append-only events, security incident impact assessments, and private claim-document access allow/deny audit events.
- Added purpose-specific step-up mappings and readiness checks for new Stage 14 tables.
- Existing privacy export/data-rights, restricted incident reporting and private malware-scanned document foundations remain in place.
- Stage 14 remains PARTIAL. Retention execution/hold enforcement, appeals, automated risk detection, complete file access audit, full tenant authorization review, disaster recovery and legal/independent acceptance remain open.
- Tests/typecheck/build/PostgreSQL/API/browser/accessibility were NOT RUN, as instructed. No migration or production action was performed.


## Batch 62 — Stage 15 UX and accessibility source additions (17 November 2026)

- Added API-backed organisation workspace with membership switching, organisation report list/create, active-member and invitation administration, recent activity and pending-verification gating.
- Added organisation activity endpoint with active membership enforcement and minimal action/resource-type/timestamp DTO.
- Added responsive organisation layout, semantic data tables, accessible labels, 44px form controls, 12px typography floor, high-contrast preference enhancement and semantic design tokens.
- Added confirmation and busy-state protection for member/invitation operations, accessible status/error/empty/loading states, `aria-current` navigation and Escape-to-close mobile menu.
- Advanced UX requirement traceability for the affected requirements; all remain PARTIAL and NOT_ACCEPTED.
- No application tests, typecheck, build, lint, PostgreSQL/API/browser/accessibility tests were run. No migration or production action was performed.
- Stage 15 remains PARTIAL; role-specific dashboard completion, organisation settings, cross-role Needs Attention hierarchy, full WCAG 2.2 AA and device acceptance remain outstanding.
