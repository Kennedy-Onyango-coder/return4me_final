# Batch 51 — Combined Claim Privacy, Detail Authorization and Reviewer Separation

**Baseline:** Batch 50 archive dated 2026-11-16  
**Scope:** Stage 11 claim-workspace remediation. This batch combines tightly related claim queue privacy, restricted detail access, sensitive-read audit and claimant/reviewer separation. It does not claim to complete all Stage 11 governance work.

## Implemented in source

1. The legacy `GET /api/claims/admin` full-row queue was removed.
2. `GET /api/admin/claims` remains a metadata-only paginated queue and is available to Admin and Owner.
3. `GET /api/admin/claims/:claimId` provides restricted claim detail to Admin/Owner only, returns claim/report context and evidence metadata, and does not return storage keys or file bytes.
4. Successful claim-detail reads write `admin.claim_detail_viewed` audit events with the claim identifier and evidence count, not the private narrative.
5. The Admin console now loads submitted, under-review and approved metadata queues and fetches restricted detail only when a reviewer opens a claim.
6. Claimants cannot review their own representative authority or ownership claim.
7. The same reviewer who verified representative authority cannot approve that represented ownership claim.

## Verification

- `node scripts/verify-batch51-claim-governance.mjs`
- `node --test scripts/test-batch51-claim-governance.mjs`
- Full existing source/static verification and Node-native tests to be run and recorded in the batch handoff.

These tests are source-level guards. They do not prove Express runtime authorization, database query behaviour, audit transaction durability, browser behaviour or accessibility. No dependencies were installed and no package lock/dependency versions were changed.

## Not included / still pending

- Step-up authentication for claim ownership and authority decisions.
- Independent review of claimant identity and reviewer identity against all possible role combinations.
- Evidence file-content read auditing and document route authorization review.
- PostgreSQL integration tests, API negative tests and concurrency tests.
- Browser/mobile and WCAG acceptance.
- Remaining Stage 11 maker/checker, high-risk step-up, audit integrity, permission-matrix and Owner analytics work.
- Independent acceptance and production authorisation.

## Safety

No migration was added or executed. No provider was contacted, no money moved, no item released, no deployment performed and no external publication made.
