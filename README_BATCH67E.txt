Return4me — Batch 67E
Claim submission integrity
Date: 18 November 2026

This cumulative package includes the prior Batches 59–67D source and Batch 67E.

Batch 67E updates server/routes/claims.ts to serialize claim submissions on the found-report row, recheck report eligibility under lock, lock the same claimant's prior claims, prevent duplicate submitted/under_review/approved/disputed/completed claims, and block a new claim while a rejected claim has an open appeal. Different claimants may still submit competing claims. Rejected claims without an open appeal and cancelled claims remain retryable. Claim creation and its audit event are transactional; notification occurs after commit. No schema/migration change.

No tests, typecheck, build, lint, PostgreSQL, migration replay, API, browser, concurrency, security, performance, accessibility or provider checks were run. No production operation, payment, item release, deployment, commit or push occurred. All stages remain PARTIAL; independent acceptance remains PENDING; production release remains NOT_AUTHORISED.
