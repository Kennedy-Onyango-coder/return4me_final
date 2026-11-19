# Testing strategy

Run `npm run typecheck`, `npm run build` and `npm test` after each batch.

Required suites across the complete project:

- OTP expiry, attempt limits, replay, concurrency and email delivery failure.
- Role matrix and object-level access controls.
- Public/private report disclosure and county/category validation.
- Claim ownership evidence, admin review and dispute holds.
- Matching false-positive controls and manual review.
- Agent eligibility, assignment integrity and custody event sequence.
- Organisation tenant isolation and permission revocation.
- Provider webhook authentication, replay, idempotency and unknown outcomes.
- Ledger balancing, 33/25/42 allocation snapshots and reconciliation.
- 48-hour settlement timing, approval holds and manual payout authorisation.
- Refunds, reversals, chargebacks, duplicate and mismatch quarantine.
- File content validation, malware quarantine, WebP outputs, private access and retention.
- Communication approval, channel publication, retries and duplicate suppression.
- Keyboard, screen-reader, responsive and low-bandwidth testing.
- Backup restore, incident response and deployment rollback drills.

Do not use real money or production provider wallets in automated tests.

## Current source-only checks

After installing dependencies, run:

```bash
npm run verify:all
npm run typecheck
npm test
npm run build
```

`verify:all` performs TypeScript/TSX syntax transpilation, checks the 165-ID requirement traceability export, and checks that migration journal entries are ordered and each has a matching SQL file. It does not execute SQL or prove runtime correctness.

Additional authored tests include `shared/custody-chain.test.ts`, `server/tests/custody-chain-integrity.test.ts` and `shared/ledger-policy.test.ts`. PostgreSQL-specific trigger, lock, deferred-constraint, migration, idempotency and concurrency behavior still requires a newly created disposable PostgreSQL database. No migration should be applied to an existing owner or production database for these tests.
