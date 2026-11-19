# Batch 9 — collection accounting, receipts and reconciliation

**Source status:** IMPLEMENTED_UNVERIFIED  
**Migration:** `0005_collection_accounting_receipts.sql`  
**Financial execution:** claimant collections remain disabled by default; no refunds, payout or settlement execution enabled

## Implemented

1. Every newly provider-confirmed claimant collection posts an immutable balanced KES journal in the same PostgreSQL transaction as payment confirmation.
2. The conservative journal treatment debits `PROVIDER_COLLECTION_CLEARING` and credits `UNCLASSIFIED_COLLECTIONS_LIABILITY`. It does not automatically recognise platform revenue or Finder/Agent rewards. Qualified accounting review is still required before changing the classification.
3. The journal uses the existing `financial_journals`/`financial_postings` immutability and same-transaction/balance triggers. Idempotency is tied to the payment transaction.
4. A payment-confirmation receipt is issued in the same transaction, only after provider verification. The receipt is explicitly not a tax invoice.
5. Verified provider fee values, when supplied by the authoritative status response, are retained as evidence. No collection-fee allocation is assumed or posted; fee treatment requires policy/accounting review.
6. Invoice/API-reference/currency/amount/assessment mismatches create durable `reconciliation_items` exceptions. Duplicate exception records are constrained by a unique key.
7. Finance/Admin can inspect collection exceptions and record a review note plus evidence reference. Reconciliation review cannot mark a payment paid, alter a journal, change a claimant balance or move funds.
8. Claimants can retrieve their own confirmed payment receipt; unconfirmed sessions never receive receipts.

## New routes

- `GET /api/collections/payment-sessions/:transactionId/receipt`
- `GET /api/finance/reconciliation/collections`
- `POST /api/finance/reconciliation/collections/:id/review`

## Accounting boundaries

- The 33/25/42 reward split applies to the separate recovery reward pool, not the claimant's recovery-service charge.
- Provider collection fees are evidence-only until a separate approved policy establishes who bears them and how they are booked.
- The 48-hour settlement policy remains distinct from payment receipt and handover. Batch 10 will implement/verify settlement and payout workflows; payout initiation remains manual and separately authorised.
- A payment-confirmation receipt is not a tax invoice. Tax and accounting treatment remains subject to professional review.

## Acceptance still required

- Apply migration 0005 to a disposable PostgreSQL database and test deferred balance triggers, same-transaction posting and duplicate callbacks.
- Verify receipt and journal atomicity under process failure and concurrent webhook delivery.
- Test mismatch exceptions, unique exception idempotency, review permissions, audit trail and claimant receipt isolation.
- Full typecheck/build/Vitest/API/browser tests and independent accountant/security review.
- No provider sandbox/live call or real-money activity has been performed in this source stage.
