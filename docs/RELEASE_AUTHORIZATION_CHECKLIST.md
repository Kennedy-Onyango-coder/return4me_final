# Production release authorisation checklist

**Current release state: `NOT_AUTHORISED`.** This checklist is fail-closed. Completion of source code or a ZIP archive does not authorise release.

| Gate | Required evidence | Status |
|---|---|---|
| Exact source baseline | Immutable commit/archive SHA-256, dependency lockfile and build provenance | PENDING |
| Requirements | All 173 requirement IDs reconciled across both registers; canonical provenance and no unsupported VERIFIED status | PENDING |
| Technical validation | Clean install, typecheck, tests, production build and migration verification | PENDING |
| Database | Reviewed migrations, disposable PostgreSQL integration, rollback and non-destructive production plan | PENDING |
| Security | Independent threat review, auth matrix, penetration test, incident readiness and secrets rotation | PENDING |
| Privacy/legal | Qualified Kenya privacy, consumer, payment, tax and legal review; DPIA/ODPC applicability decision | PENDING |
| Finance | Independent accounting review, ledger/reconciliation, provider evidence and wallet/beneficiary controls | PENDING |
| External providers | Approved sandbox evidence, callback signature/replay/idempotency and delivery tests | PENDING |
| Storage | Private bucket ACL, malware scan, retention, deletion and restore evidence | PENDING |
| UX/accessibility | Independent WCAG 2.2 AA and browser/device acceptance | PENDING |
| Operations | Encrypted backup/restore, RPO/RTO, monitoring, alerting, incident and rollback rehearsal | PENDING |
| Pilot | Explicitly scoped pilot, support coverage, rollback and incident owner | PENDING |
| Governance evidence | Evidence register, source hashes, change approvals, reviewer decisions and no unapproved waivers | PENDING |
| Owner decision | Separate explicit release approval after all applicable gates, with recorded source hash and approval reference | NOT_AUTHORISED |

## Prohibited until separately authorised

- Production deployment or production database mutation.
- Live IntaSend collection, refund, payout or wallet transfer.
- Real customer data import or public evidence downloads.
- Production email/SMS or social publication.
- Any bypass of maker/checker, dispute, legal hold, custody, payment or audit controls.

The automated `npm run release:check` is a configuration preflight only. Passing it is not the Owner's release decision and does not substitute for the evidence above. The added environment approval flags are necessary configuration gates, not cryptographic signatures or proof that an authorised person approved the release.
