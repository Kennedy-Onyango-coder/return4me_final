# Batch 45 — Restricted Finance Workspaces (16 November 2026)

## Delivered source changes

- Finance operational queues are now Admin/Owner-only and return bounded metadata projections rather than full record details. Payment queues omit payer phone/provider references; settlement queues omit beneficiary IDs and allocation legs; refund queues omit rationale/provider evidence; payout queues omit beneficiary/destination/provider identifiers; reconciliation queues omit provider references, reviewer notes and evidence; reward funding queues omit source/evidence details; pending payout-destination queues omit beneficiary identity and phone.
- Added separately permissioned Admin/Owner detail endpoints for payment transactions, settlements, refund requests, payout requests, collection reconciliation items, reward authorizations and pending payout destinations. Every successful detail read records a specific `auditEvents` action.
- Payout destination detail returns only masked phone data and expressly does not return phone ciphertext. Payout request detail does not return destination ciphertext. Payment detail returns masked payer data only.
- FinanceControlPanel now fetches restricted details only after explicit selection and displays them in a clearly labelled restricted-detail surface. Queue rows no longer display beneficiary IDs or settlement allocation legs.
- Provider operation attention queue no longer includes provider reference or HTTP status in its default list projection.
- No database migration was added. Existing transactional step-up and maker/checker paths were not weakened. Queue/detail reads do not create provider calls, execute refunds/payouts, alter settlements or release items.

## Source files

- `server/routes/finance.ts`
- `src/App.tsx`
- `scripts/verify-batch45-finance-workspaces.mjs`
- `scripts/test-batch45-finance-workspaces.mjs`
- `package.json`
- `docs/ROADMAP_1_TO_17.md`
- `docs/ROADMAP_1_TO_17_UPDATED.md`
- `docs/IMPLEMENTATION_PROGRESS_2026-11-14.md`
- `docs/REQUIREMENT_TRACEABILITY.csv`
- `docs/REQUIREMENT_EVIDENCE_MATRIX.csv`

## Verification performed

- Batch 45 static source guard: 14/14 passed.
- Batch 45 Node-native policy/source tests: 8/8 passed.
- Broader Node-native and non-PostgreSQL source checks: recorded in the batch delivery report.
- TypeScript/TSX syntax transpilation: recorded in the batch delivery report.
- Full semantic typecheck, Vitest/build and PostgreSQL integration are not claimed as complete. PostgreSQL was intentionally not run.

## Acceptance and release status

Finance governance remains `PARTIAL`. The new source projections and audited detail reads are not independently accepted. PostgreSQL migration/API/concurrency, full dependency-backed typecheck, Vitest, build, provider sandbox, financial reconciliation/accounting, browser/mobile/accessibility and independent security/privacy acceptance remain open. Live collection/refund/payout remains disabled or blocked by existing policy; no money movement or production operation was performed. Production release remains `NOT_AUTHORISED`.
