Return4me — Batch 67G

This cumulative package contains Batches 59–67F plus Batch 67G final-release, claimant-confirmation and legal-hold serialization changes.

Main changes:
- Final Agent release locks report -> approved claim -> assignment and checks active legal holds targeting claim/report/assignment.
- Claimant handover confirmation and audit now commit in one transaction using the same lock order.
- Legal-hold creation locks supported claim/report/assignment subjects before inserting the hold.
- Exact completed claimant receives the post-commit handover notification.

No schema/migration change. No application tests, typecheck, build, lint, database, API, browser, concurrency, security, performance, accessibility or provider sandbox verification was run. These remain deferred until implementation is complete. No production migration, provider call, payment, refund, payout, item release, deployment, commit or push occurred.

All master stages remain PARTIAL. Batch 68 pending; Batch 69 deferred. Independent acceptance pending; production release NOT AUTHORISED.
