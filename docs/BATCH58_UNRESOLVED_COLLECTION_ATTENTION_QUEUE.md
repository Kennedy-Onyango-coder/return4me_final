# Batch 58 — Unresolved claimant collection attention queue

**Date:** 16 November 2026  
**Baseline:** Batch 57 complete project archive.  
**Stage:** 12 — Pricing, collections, ledger, settlements, payouts, refunds and reconciliation.  
**Scope:** Source implementation only; full testing is deferred until implementation across all stages is complete.

## Implemented

1. Added `GET /api/finance/collections/unresolved-sessions`, restricted to Admin and Owner. It returns a bounded, paginated metadata-only list of stale IntaSend payment attempts with no persisted provider invoice reference and statuses `initiated`, `pending` or `unknown`.
2. Added a default five-minute attention threshold, configurable between five minutes and seven days. Age is an investigation signal only; it is not evidence of provider failure or non-payment.
3. Added `GET /api/finance/collections/unresolved-sessions/:id`, restricted to Admin and Owner, for audited detail access. It returns the claim reference, amount, transaction/assessment state, timestamps, provider state and masked payer phone only. It never returns the encrypted phone, fingerprint, provider secret, raw provider payload or invoice reference.
4. Both queue and detail reads create audit events. Queue audit metadata contains counts and filter parameters only; detail audit metadata records that only masked payer information was exposed.
5. Added a Finance Operations panel that surfaces unresolved attempts and links to the restricted detail view.
6. The endpoints are read-only. They do not call IntaSend, create a provider operation, retry a request, confirm/fail a payment, change an assessment, issue a receipt, post a journal or alter custody/handover state.

## Safety decisions

- A missing invoice reference does not prove that IntaSend did not receive the request.
- No manual “mark failed” or “mark paid” action was added. A future resolution workflow must require independently verifiable provider evidence and a separate approved maker/checker design.
- No new provider status endpoint or undocumented IntaSend contract was assumed.
- No migration is required for this read-only source addition.

## Deferred verification

As instructed, all application tests are deferred until source implementation across all stages is complete. Batch 58 has not been represented as tested or accepted. The eventual consolidated test programme must cover authentication and role denial, response-field minimisation, SQL query behaviour, pagination, stale-time boundaries, audit creation, UI rendering, and proof that queue/detail reads cannot mutate financial state or trigger provider calls.

## Safety boundary

No provider call, payment, refund, payout, settlement, migration, production database operation, deployment, external publication, item release, commit or push was performed.
