# Acceptance gates and release controls

This file supplements `MASTER_REQUIREMENTS.md`, `ROADMAP_1_TO_17.md` and `IMPLEMENTATION_REGISTER.md`.

## Required evidence layers

1. **Source review:** requirement-to-code traceability, threat review, migration review, safe DTO review and no unapproved policy changes.
2. **Static validation:** clean dependency installation, TypeScript typecheck, lint where configured, production build and migration metadata validation.
3. **Unit/domain tests:** deterministic policy, validation, idempotency-key construction and state transition tests.
4. **Disposable PostgreSQL tests:** migration ordering, constraints, row locks, triggers, deferred constraints, rollback, uniqueness, concurrency and append-only controls.
5. **API/security tests:** role, object, field and tenant isolation; authentication, recovery, CSRF/origin, rate limits, abuse, replay and duplicate requests.
6. **Browser/accessibility tests:** mobile Android viewport, slow network, keyboard, screen reader, contrast, zoom, reduced motion, safe retries and form recovery.
7. **External integration tests:** only authorised sandbox credentials and non-production accounts; verified callback signatures, idempotency, failure/timeout/duplicate/partial outcomes and reconciliation.
8. **Independent acceptance:** reviewer records evidence and closes each requirement only after all applicable gates pass.
9. **Production release:** separate explicit Owner authorisation after professional/legal/security, financial, operational and DR gates.

## Financial safety gates

- Browser redirects and provider acceptance are not payment success.
- Unknown or timed-out outcomes remain pending/unknown and require reconciliation; do not retry blindly.
- Collection, payout and refund endpoints remain disabled until provider, ledger, callback, beneficiary, wallet, reconciliation, permissions and legal/accounting gates are independently accepted.
- Settlement approval and payout initiation remain distinct; payout initiation is manual and separately authorised.
- Disbursement fees are a Platform expense.
- Correcting entries use new immutable journals; historical allocations are not silently rewritten.

## Custody safety gates

- Only active authorised Agents at approved service sites may receive or hold found items.
- Custody events are append-only and database sequence/hash generation is authoritative.
- Reassignment after physical custody begins requires current assigned Agent and current approved claimant confirmation.
- Final item release remains disabled until ownership, payment, identity/authority, legal/dispute and dual-party handover gates all pass.

## Current delivery result

Source implementation only. Dependency installation timed out and the offline npm cache lacks required packages. No typecheck, Vitest suite, build, migration application, PostgreSQL integration, browser acceptance, external sandbox or independent review is claimed as passed.
