# Batch 43 — Restricted dispute and appeal workspaces

**Date:** 16 November 2026  
**Status:** Source implementation complete; non-PostgreSQL checks pending in this batch; independent acceptance remains open.

## Implemented

- Added Admin/Owner-only restricted detail endpoints for disputes and appeals under `/api/admin/disputes/:disputeId` and `/api/admin/appeals/:appealId`.
- Kept existing dispute and appeal queue responses metadata-only; detail narratives are fetched only after a deliberate case selection.
- Added `admin.dispute_detail_viewed` and `admin.appeal_detail_viewed` audit events after successful detail retrieval. Audit metadata does not duplicate case narratives.
- Added an Admin/Owner workspace for dispute and appeal queues, status filtering, case selection and read-only narrative inspection.
- The new case-detail workspace does not itself perform a consequential decision or release. Separately, the existing appeal review path was hardened: `/claims/appeals/queue` now returns metadata only; appeal decisions require the distinct `admin.appeal.review` step-up purpose and consume the grant in the same transaction as the locked appeal/claim update and audit event. The original claim reviewer remains barred from deciding the appeal. The appeal review UI now fetches narrative details only after selection and instructs the reviewer to verify the matching step-up purpose.
- Kept dispute resolution in its existing step-up-protected workflow and appeal decisions in the existing review workflow; the new workspace does not perform a consequential decision, item release, refund, settlement or payout.
- Preserved the two privileged roles: Admin and Super Admin (Owner). No delegated privileged role or new database column was introduced.

## Deliberately not implemented in this batch

- Case assignment/reassignment and reviewer ownership. The current dispute and appeal records do not provide a shared, clearly defined assignment lifecycle or maker/checker semantics. Adding a guessed assignment field without a reviewed data model, migration, authorization and reassignment audit policy would be unsafe. This remains a Stage 11 design/implementation item.
- New appeal/dispute decision controls in the new workspace. Existing review routes need a separate transactional step-up and maker/checker review before exposing consequential actions here.
- PostgreSQL migrations or database execution.

## Verification boundary

This batch's non-PostgreSQL checks are recorded in the accompanying progress report. PostgreSQL/API concurrency, full dependency-backed TypeScript, Vitest, production build, browser/mobile/accessibility and independent security/privacy acceptance remain pending unless specifically listed as passed. No production data or provider was accessed.
