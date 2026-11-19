Return4me — Batch 67H

This cumulative package contains Batches 59–67G plus Batch 67H appointment lifecycle and workspace-state corrections.

Main changes:
- Appointment request, Agent confirmation and decline now use transactions and consistent report -> claim -> assignment lock ordering.
- Appointment requests and confirmations recheck active assignment, approved claim, current active/verified Agent, availability, dispute and legal-hold conditions as applicable.
- Appointment audit events are transaction-bound.
- Claimant and Agent workspace indicators are scoped to the current claim/assignment/custody segment; appointment status/time and report references are visible.
- Agent handover guidance includes legal holds.

No schema/migration change. No application tests, typecheck, build, lint, database, API, browser, concurrency, security, performance, accessibility or provider sandbox verification was run. These remain deferred until implementation is complete. No production migration, provider call, payment, refund, payout, item release, deployment, commit or push occurred.

All master stages remain PARTIAL. Batch 68 pending; Batch 69 deferred. Independent acceptance pending; production release NOT AUTHORISED.
