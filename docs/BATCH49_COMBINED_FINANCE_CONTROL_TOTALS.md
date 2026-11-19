# Batch 49 — Combined Finance Control Totals and Period-Close Preparation

**Date:** 16 November 2026  
**Baseline:** Batch 48 consolidated source archive.

## Implementation

- Added Admin/Owner-only `GET /finance/reconciliation/control-totals`, returning metadata-only grouped control totals for collection reconciliation items, refunds, payouts, provider-operation outbox records and payment transactions.
- Included the count of empty/unbalanced immutable journals and a period-close preparation checklist.
- The endpoint writes an audit event containing aggregate counts only. It does not return row-level identities, provider references, destination details, notes or evidence.
- Added a Finance UI section showing the operational exception counts and explicit close blockers.
- Category counts may overlap across related records. The report is a best-effort, non-transactional snapshot, not a unique count of affected business records.
- Period close is fail-closed in this report (`readyForClose: false`); no period-close action, journal posting, provider matching, settlement, refund or payout is performed.
- The report explicitly warns that parallel control totals are not proof of provider-to-ledger matching or accounting completeness.

## Verification

- Batch 49 static source guard: 14/14 passed.
- Batch 49 focused Node-native tests: 5/5 passed.
- Full non-PostgreSQL `npm run verify:all`: passed, including 92/92 Node-native tests across 15 suites, 156 TypeScript/TSX syntax files, 166 traceability rows, 166 evidence rows and 17 ordered migration metadata entries.
- Full semantic TypeScript: attempted; blocked by missing `@types/node` and `vite/client`.
- Vitest: attempted; unavailable (`vitest: not found`). Production build: attempted; blocked by the same missing type definitions.
- Release gate check correctly remains blocked by 27 missing environment, backup, legal, security, privacy, accessibility, financial and authorisation gates.

## Safety and acceptance

No migration was added or applied. No provider call, live money movement, production database operation, external publication or item release occurred. Stage 12 remains PARTIAL and money movement remains BLOCKED. Accounting period close requires verified source-to-ledger matching, resolution of exceptions, independent Finance approval and a separate authorised process. PostgreSQL/API, provider, accounting, browser and independent acceptance remain pending.
