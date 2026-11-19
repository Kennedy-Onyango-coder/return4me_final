# Batch 42 — Restricted privacy and security case workspaces

**Date:** 16 November 2026  
**Baseline:** Batch 41 complete-project archive  
**Implementation state:** Source implementation added; verification intentionally deferred at the user's direction.

## Scope delivered

### 1. Privacy request queue and detail separation

- Replaced the broad Admin privacy-request list response with a paginated, metadata-only queue.
- Queue fields are limited to request ID, request type, status and lifecycle timestamps. Request narratives, reviewer notes and reviewer identity are not included in the queue response.
- Added a separately permissioned Admin/Owner detail endpoint for an individual privacy request.
- Each successful detail read writes a dedicated audit event (`privacy.data_rights_request_detail_viewed`) with the request type and resource reference; the private narrative itself is not copied into audit metadata.
- Existing decision workflow remains step-up protected and transaction-coupled. The interface explicitly warns that a fulfilled decision does not itself erase data.

### 2. Security incident queue and detail separation

- Replaced the broad security-incident queue response with a paginated metadata-only queue and bounded status/severity filters.
- Queue fields exclude reporter identity, summary, incident narrative, resolution and internal responder details.
- Added an individual Admin/Owner detail endpoint for the restricted incident narrative and resolution.
- Each successful detail read writes `security.incident_detail_viewed`; narrative content is excluded from audit metadata.
- Existing step-up-protected update workflow remains in place, including documented resolution before closure and immutability after closure.

### 3. Admin workspace interface

- Added a combined Restricted Governance panel to the Admin/Owner workspace.
- Privacy and security queues display metadata only; an explicit selection fetches the restricted detail endpoint.
- Privacy decisions and incident updates use the existing purpose-specific step-up grants, whose OTP purposes are already available in the Admin workspace.
- The panel does not expose storage keys, private file content, or unrestricted personal-data exports.

## Verification status

No tests, typecheck, build, migration, database integration, browser automation or external service checks were run in this batch, in accordance with the user's instruction to continue building before returning to tests. Source review only is not acceptance evidence. The next batch should continue implementation before beginning the deferred verification programme.

## Remaining work

- Add focused API tests for metadata-only queue DTOs, cross-role denial, detail-read audit events, pagination/filter validation and case-ID isolation.
- Add PostgreSQL-backed tests for access audit writes and concurrent decision/update behavior.
- Complete exhaustive object/field/tenant authorization review across all Admin detail routes.
- Complete accessibility, mobile and independent security acceptance.

Stage 11 remains **PARTIAL**. No migration was added or applied. No production database, provider, payment, refund, payout, deployment, external publication or item-release operation occurred.
