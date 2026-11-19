# Release and rollback runbook

## Pre-release

- Freeze the exact source commit and preserve the working tree/diff report.
- Require green CI: syntax/traceability/migration checks, typecheck, Vitest, migration integration, build and dependency audit.
- Review migration forward/rollback plan on a disposable database; back up and verify restore before any production change.
- Confirm approved secrets manager, TLS origins, secure cookies, private S3, ClamAV, email provider, logging, monitoring and alert ownership.
- Close independent security/privacy/accessibility/accounting/payments/legal reviews and record owner release approval.
- Confirm external financial and communications feature flags remain disabled unless a separate, specific release authorisation has been approved. This replacement currently has no live IntaSend mode.

## Deployment and verification

- Deploy an immutable image built from the approved commit; never build from a developer workstation for production.
- Run migrations only under the approved operator and maintenance window.
- Verify `/healthz`, `/readyz`, authentication, core report/claim flow, notification outbox, ledger balance and monitoring alerts.
- Verify financial controls in sandbox only. No real-money test transaction is permitted without a separate explicit approval.

## Rollback

- Stop new writes or disable the affected capability before rollback if data integrity is at risk.
- Prefer an application image rollback when schema compatibility allows. Do not blindly roll back irreversible financial or custody migrations.
- Restore from encrypted backup only under a separate incident/restore approval and only to the designated target.
- Preserve payment, payout, ledger, custody and audit evidence. Reconcile provider state before resuming financial workflows.
- Record the incident, operator, image, migration state, evidence and owner approval.

No deployment or rollback has been executed for this source tree.
