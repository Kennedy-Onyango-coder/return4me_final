Return4me — Batch 67I

Cumulative source package through Batches 59–67I.

Batch 67I changes:
- Claimant collection-code issuance uses report -> claim -> assignment -> appointment row locks.
- Rechecks the currently approved claim, active verified Agent assignment, exact current claimant identity/authority check, confirmed future appointment, provider-confirmed paid assessment, and active dispute/legal-hold gates.
- Authorization expires at the earlier of 24 hours or the confirmed appointment end.
- Delivery failure invalidates only the exact claim/assignment authorization.

No schema or migration change. No application tests, typecheck, build, lint, database replay, API/browser, concurrency, security, performance, accessibility or provider sandbox checks were run; all remain deferred until implementation completion. Appointment cancellation/rescheduling/no-show lifecycle remains outstanding. No production migration, provider call, payment, refund, payout, item release, deployment, commit or push occurred. All master stages remain PARTIAL; Batch 68 pending; Batch 69 deferred; independent acceptance pending; production release NOT AUTHORISED.
