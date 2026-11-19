Return4me — Batch 67F
Representative authority and collection-check serialization
Date: 18 November 2026

This cumulative package includes Batches 59–67E plus Batch 67F.

Batch 67F updates server/routes/agent-operations.ts so the Admin in-person collection identity/representative-authority check locks the approved claim and active assignment before rechecking authority and writing the check against the locked IDs. Step-up grant consumption and audit insertion remain transaction-bound. Existing independent authority, payment, appointment, claimant confirmation, dispute/legal hold and release gates are preserved. No schema/migration change.

No application tests, typecheck, build, lint, PostgreSQL, migration replay, API, browser, concurrency, security, performance, accessibility or provider checks were run. No production operation, payment, item release, deployment, commit or push occurred. All stages remain PARTIAL; independent acceptance remains PENDING; production release remains NOT_AUTHORISED.
