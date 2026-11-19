# Batch 44 — Restricted Agent and Organisation Governance Workspaces

**Date:** 16 November 2026  
**Baseline:** Batch 43 complete archive  
**Release state:** `NOT_AUTHORISED`

## Source implementation

1. The Admin/Owner Agent queue now returns only record ID, business name, county, status and lifecycle timestamps. It no longer returns service address, service phone, application capacity notes or account email.
2. A separate Admin/Owner Agent detail endpoint returns the restricted application/contact fields only after a record is selected. Each successful detail read writes `admin.agent_detail_viewed` to the audit log. The event contains no copied contact or application narrative.
3. A new Admin/Owner organisation queue returns only ID, organisation name, county, status and lifecycle timestamps. Registration numbers are excluded from the queue.
4. A separate Admin/Owner organisation detail endpoint returns the registration identifier and active membership count. Each successful read writes `admin.organisation_detail_viewed`; the event contains no registration number.
5. The Admin/Owner workspace now provides Agent and Organisation queue navigation and fetches detail only on explicit selection. Existing status-change workflows remain separate and step-up protected.
6. No privileged role was added. Organisation member permissions remain tenant-scoped and distinct from platform Admin/Owner roles.
7. No schema migration was required. No assignment/reassignment model was invented in this batch.

## Verification record

- Batch 44 static source guard: **12/12 passed**.
- Node-native tests across `scripts/test-*.mjs`: **78/78 passed**.
- PostgreSQL was not run, as requested.
- Full semantic TypeScript check, Vitest and production build were not established by this batch. The full non-PostgreSQL `npm run verify:all` suite passed, including the 156-file syntax transpilation, 166-ID traceability check, 166-row evidence matrix, 17-migration metadata check, all registered source guards and policy tests. Full semantic typechecking was attempted once and is blocked by missing `@types/node` and `vite/client`.
- No production migration, provider call, payment, refund, payout, item release, deployment or external publication occurred.

## Remaining acceptance

- Confirm Admin/Owner route behavior against PostgreSQL-backed API requests, including wrong-role and malformed-ID cases.
- Complete object/field/tenant authorization review across Agent and Organisation APIs.
- Browser/mobile and accessibility acceptance for the new workspace.
- Independent security/privacy acceptance.
- Stage 6 and Stage 8 remain PARTIAL / IMPLEMENTED_UNVERIFIED respectively; Batch 44 does not promote either stage to complete.
