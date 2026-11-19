# Batch 7 — claimant payment and IntaSend collection

**Source status:** IMPLEMENTED_UNVERIFIED  
**Collection capability:** DISABLED BY DEFAULT  
**Money movement:** NOT AUTHORISED  
**Migration:** `0004_intasend_claimant_collection.sql`

## Scope delivered

1. Added a claimant-owned payment-session endpoint tied to a specific approved, claimant-confirmed KES assessment. The client cannot submit or alter the amount.
2. Added Kenyan M-Pesa number normalisation and masked phone display/storage.
3. Preserved the two clocks from the original Return4me payment lifecycle: the 24-hour claim payment window begins only after the assigned active Agent records physical receipt and inspection; an individual STK attempt has a separate 15-minute session window.
4. Added a dedicated IntaSend adapter using the documented M-Pesa STK push and payment-status endpoints. It defaults to sandbox and requires `INTASEND_COLLECTION_ENABLED=true`, a secret key and a webhook challenge before a collection request can be made.
5. Added per-session idempotency and unresolved-outcome protection. An ambiguous timeout is recorded as `unknown`; the application does not blindly initiate another prompt.
6. Added a challenge-authenticated webhook endpoint, durable unique delivery records, provider invoice/API-reference binding and a canonical authoritative status lookup before local confirmation.
7. Confirmation requires exact invoice and API-reference binding, KES currency, exact expected amount and provider `COMPLETE`. Pending, processing, partial and unknown provider outcomes never confirm payment.
8. Added claimant status retrieval with a 15-second provider lookup throttle.
9. Added payment-confirmation gates to collection-code issuance, Agent handover readiness and claimant handover confirmation.
10. Kept claimant recovery-service assessment/payment separate from Finder/Agent/Platform reward allocations. No reward settlement or payout is created by claimant collection.

## Endpoints added

- `POST /api/collections/assessments/:assessmentId/payment-sessions`
- `GET /api/collections/payment-sessions/:transactionId`
- `POST /api/webhooks/intasend`

## Important compatibility mapping

The original repository used a `pending_payment` claim state after an Agent's in-person confirmation. The clean-room schema uses `approved` plus a versioned `payment_assessment`; therefore the equivalent 24-hour payment window is stored on the assessment and starts when the assigned Agent records `inspection_completed` after physical receipt. This retains the original timing intent without introducing an incompatible claim status into the new claim enum.

## Verification evidence

- `npm run verify:source`: PASS — 63 TypeScript/TSX files, zero syntax diagnostics.
- `npm run verify:traceability`: PASS — 165 unique requirement IDs mapped.
- `npm run verify:migrations`: PASS — five ordered migration files recognised; migration was not applied.
- Focused unit tests were authored in `shared/payment-collection-policy.test.ts`; Vitest has NOT run.
- `npm run typecheck`: BLOCKED — missing `@types/node` and `vite/client` due incomplete dependency installation.
- `npm ci --ignore-scripts --no-audit --no-fund`: timed out.
- No PostgreSQL migration, API integration, webhook replay, sandbox payment, browser, or provider-account test was run.

## Remaining acceptance gates

- Install complete dependencies and run typecheck/build/Vitest.
- Apply migration only to a disposable test database; test concurrency and all payment transitions.
- Verify the exact deployed IntaSend sandbox response/callback schema, challenge handling, amount/currency fields and status endpoint.
- Test callback duplicates, out-of-order events, missing callback recovery, timeout with and without invoice ID, wrong `api_ref`, cross-claim invoice, under/overpayment and provider outage.
- Add a reconciliation queue/operator surface for unresolved sessions with no provider invoice ID.
- Complete independent security/privacy review and Kenyan payments/accounting/legal review.
- Keep production enablement and live money movement separately unauthorised.
