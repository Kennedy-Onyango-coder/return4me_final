# Return4me master roadmap — Stages 1–23 and implementation batches through 64

**Updated:** 17 November 2026  
**Current source baseline:** Cumulative Batches 59–64.  
**Implementation policy:** Finish all source implementation before consolidated technical testing and acceptance.

## Baseline and evidence reconciliation

The earlier claimed Batch 59 archive was not present in the accessible Batch 58 baseline. Batch 59 Finance scope was reconstructed against the actual Batch 60 source tree; this is not recovery of the unavailable archive. Migrations 0018–0021 are prepared in source and have NOT been applied.

Batch 64 reconciled the requirement registers: the traceability CSV previously contained 115 valid IDs plus five malformed rows, while the evidence matrix contained 173 IDs. The 58 missing or malformed IDs were reconstructed from the corresponding evidence-matrix rows. Both registers now represent the same 173 requirement IDs. The evidence matrix still records independent acceptance PENDING and release NOT_AUTHORISED for all 173. Five historical technical-verification `PASSED` entries remain subject to evidence/hash validation and are not treated as acceptance.

## Stage roadmap

| Stage | Status | Remaining work | Acceptance |
|---|---|---|---|
| Stages 1–10 | PARTIAL | Requirement-level source gaps and lifecycle closure | Deferred |
| Stage 11 — Admin/Owner governance | PARTIAL | Full object/field/tenant authorization and Owner oversight | Deferred |
| Stage 12 — Finance | PARTIAL | Provider statement ingestion/matching, correcting journals, treasury/fees, historical allocation review and accounting acceptance | Deferred |
| Stage 13 — Communications | PARTIAL | Durable outbox/retries, deliverability, suppression, provider setup and moderation | Deferred |
| Stage 14 — Security/Privacy | PARTIAL | Retention/hold enforcement, full document access coverage, tenant authorization, incident exercises and legal review | Deferred |
| Stage 15 — UX/Accessibility | PARTIAL | Remaining role journeys, shared components and WCAG 2.2 AA device/AT acceptance | Deferred |
| Stage 16 — Technical Architecture | PARTIAL | External telemetry, backup/restore, approved RPO/RTO, SBOM and rollback rehearsal | Deferred |
| Stage 17 — Governance/Evidence | PARTIAL | Register structure and traceability reconciliation added; canonical requirement approval, immutable test evidence, independent signatures and final release authorization remain | Deferred |
| Stages 18–23 | Existing historical scope | Preserve and reconcile prior requirements; verify evidence against current source | Deferred |

## Batch tracker

| Batch | Scope | Status |
|---|---|---|
| 59 | Stage 12 Finance reconstruction | Source additions included; PARTIAL/unverified |
| 60 | Stage 13 Communications | Source additions included; PARTIAL/unverified |
| 61 | Stage 14 Security/Privacy/Fraud | Source additions included; PARTIAL/unverified |
| 62 | Stage 15 UX/Accessibility | Source additions included; PARTIAL/unverified |
| 63 | Stage 16 Technical Architecture | Source additions included; PARTIAL/unverified |
| 64 | Stage 17 Governance/Evidence | Traceability reconciled to 173 IDs; governance registers and fail-closed controls added; PARTIAL/unverified |
| 65 | Remaining Stages 1–10 source-gap closure | Next |
| 66 | Cross-stage integration and implementation freeze | Pending |
| 67 | Consolidated testing and independent acceptance | Pending; only after Batch 66 |

## Testing and release controls

Per user instruction, no application tests, typecheck, build, PostgreSQL, API, concurrency, browser or accessibility tests during implementation batches. Batch 67 begins only after Batch 66. Static governance verifier is also not run in this batch.

All independent acceptance remains PENDING. Release state remains NOT_AUTHORISED. No production migration, deployment, provider call, money movement, refund, payout, message dispatch, external publication, item release, commit or push is authorised by these implementation batches.
