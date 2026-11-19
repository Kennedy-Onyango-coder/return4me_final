# Return4me implementation progress — 18 November 2026

## Batch 67D — Claim evidence lifecycle serialization

- Baseline: recovered cumulative Batches 59–67C archive; ZIP integrity check passed.
- Updated `server/routes/claim-evidence.ts` to lock the parent claim before evidence/document rows, aligning lock order with claim approval and upload.
- Evidence review now rejects closed/decided claims with HTTP 409; missing evidence remains 404 and non-clean malware state returns 409.
- Step-up grant consumption, evidence/document updates and audit record remain transaction-bound.
- Updated CLAIM-001 traceability, evidence matrix, implementation register, Batch 67D report and master roadmap. CLAIM-001 remains PARTIAL; no acceptance status was upgraded.
- No tests, typecheck, build, lint, database, migration, API, browser, concurrency, security, performance, accessibility or provider checks were run.
- No production operation, payment, item release, deployment, commit or push occurred.

**Follow-on:** Batch 67E addresses duplicate claim submission and appeal-in-progress integrity. Testing remains deferred until all implementation stages are complete.


## Batch 67E — Claim submission integrity

- `server/routes/claims.ts` now takes a `FOR UPDATE` lock on the found-report row before rechecking `kind=found` and `status=published`, then checks/inserts the claim in one transaction. This serializes competing submissions to the same report without preventing different claimants from filing separate claims.
- The transaction locks the same claimant's prior claims for that report and blocks duplicate `submitted`, `under_review`, `approved`, `disputed` and `completed` claims. It also blocks a new submission while a prior rejected claim has an open submitted/under-review appeal. Rejected claims with no open appeal and cancelled claims remain eligible for a new submission.
- Claim insert and `claim.created` audit event are atomic; the report submitter notification is invoked only after transaction success. No schema or migration change.
- No application tests, typecheck, build, lint, database, migration, API, browser, concurrency, security, performance, accessibility or provider checks were run. This follows the instruction to defer testing until all implementation stages are complete.
- No production operation, payment, item release, deployment, commit or push occurred.

**Next:** Batch 67F — inspect and close the next claimant representative-authority lifecycle seam across evidence, collection identity and handover; preserve manual independent verification and avoid changing any payment or release policy.


## Batch 67F — Representative authority and collection-check serialization

- `server/routes/agent-operations.ts`: Admin collection identity/authority check now locks the approved claim and active assignment (`FOR UPDATE OF c,x`), rechecks relationship-specific authority while locked, and writes the check against those exact row IDs. Step-up consumption and audit insertion remain in the same transaction.
- This closes a source-level race between collection-check recording and claim-state/Agent-assignment changes. Existing independent representative-authority review, separate collection-code issuer, confirmed payment, appointment, claimant confirmation, dispute/legal hold and final Agent release controls remain intact. No raw identity number is stored.
- No schema or migration change. No application tests, typecheck, build, lint, PostgreSQL, migration, API, browser, concurrency, security, performance, accessibility or provider checks were run; these remain deferred until implementation is complete.
- No production operation, payment, item release, deployment, commit or push occurred. CUST-004 remains IMPLEMENTED_UNVERIFIED; INT-007 remains NOT_VERIFIED.

**Next:** Batch 67G — inspect and close the remaining custody release/claimant-confirmation race, including stale appointment, assignment, dispute and legal-hold transitions.


## Batch 67G — Final release and legal-hold serialization

- `server/routes/agents.ts`: final release now locks report -> exactly one approved claim -> current assignment; checks active legal holds on claim/report/assignment in addition to dispute holds; verifies claim completion update and emits the release event in the same transaction; completion notification targets the exact completed claimant.
- `server/routes/agent-operations.ts`: claimant confirmation and audit are atomic; report -> claim -> assignment locks prevent stale confirmation and serialize against release; payment, readiness, dispute and legal-hold conditions are rechecked.
- `server/routes/security-governance.ts`: active legal-hold creation locks an existing claim/report/assignment subject before insertion, preventing a concurrent release from missing a newly committed hold. Generic other subject types retain prior behaviour and are not implied to block item release.
- No schema or migration change. No application tests, typecheck, build, lint, database, migration replay, API, browser, concurrency, security, performance, accessibility or provider checks were run. Verification remains deferred.
- No production operation, provider call, payment, refund, payout, item release, deployment, commit or push occurred.

**Next:** Batch 67H — appointment lifecycle invalidation, reassignment and claimant/Agent workspace state accuracy.


## Batch 67H — Appointment lifecycle and workspace state integrity

- Appointment request, Agent confirmation and decline now use report -> claim -> assignment lock ordering, recheck current approved claim/active assignment/current active verified Agent, and apply dispute/legal-hold gates to request/confirmation. Appointment state and audit records are transactional.
- Agent appointment list includes report reference. Claimant assignment summary scopes handover readiness to current Agent/custody segment and confirmation to exact current assignment; latest appointment status/time is exposed. Agent queue prefers current approved claim and scopes confirmation to current assignment.
- `src/App.tsx` shows report reference and latest appointment status/time, and release guidance names legal holds.
- No schema or migration change. No tests, typecheck, build, lint, database, migration replay, API, browser, concurrency, security, performance, accessibility or provider checks were run; verification remains deferred.
- No production operation, provider call, payment, refund, payout, item release, deployment, commit or push occurred.

**Next:** Batch 67J — appointment cancellation, expiry/no-show, rescheduling and authorization invalidation.


## Batch 67I — Collection-code and appointment-context integrity
- `server/routes/agent-operations.ts` — collection-code issuance now locks report -> claim -> assignment -> confirmed appointment; it rechecks approved claim, active verified Agent, exact claimant identity/authority check, future confirmed appointment, provider-confirmed paid assessment, and active dispute/legal-hold gates.
- Collection authorization expiry is capped at the confirmed appointment end (and no later than 24 hours); delivery failure invalidates only the exact claim/assignment authorization.
- No schema or migration change. Source implementation only; no tests, typecheck, build, lint, database, API, browser, concurrency, security, performance, accessibility or provider checks were run.
- Appointment cancellation/rescheduling/no-show lifecycle remains open and is not represented as completed.

**Next:** Batch 67J — inspect and implement the appointment cancellation, expiry/no-show and rescheduling lifecycle, including claimant/Agent workspace visibility and authorization invalidation.
