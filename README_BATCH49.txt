Return4me Batch 49 — Combined Finance Control Totals and Period-Close Preparation

This is the full consolidated source archive through Batch 49. Read docs/BATCH49_COMBINED_FINANCE_CONTROL_TOTALS.md and docs/ROADMAP_1_TO_17_UPDATED.md for the batch report and updated stage roadmap.

Batch 49 adds an Admin/Owner-only, audited, metadata-only aggregate endpoint for reconciliation, refunds, payouts, provider operations, payment statuses and ledger journal integrity. The Admin Finance workspace displays exception signals and a fail-closed period-close preparation checklist. The report is best-effort and non-transactional; category counts can overlap. It does not establish provider-to-ledger matching, certify accounting completeness, or perform period close.

Verification: full non-PostgreSQL verify:all passed with 92/92 Node-native tests across 15 suites; 156 TypeScript/TSX syntax files; 166 traceability/evidence rows; 17 migration metadata entries. Full semantic TypeScript/build are blocked by missing @types/node and vite/client; Vitest is unavailable. PostgreSQL intentionally not run.

No migration or production operation was performed. No live provider calls, collection, refund, payout, external publication or item release is authorised.
