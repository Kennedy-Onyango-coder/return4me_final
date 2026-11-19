# Batch 14 — production readiness and governance

**Source status:** IMPLEMENTED_UNVERIFIED / RELEASE BLOCKED  
**Deployment:** NOT PERFORMED  
**Production migration:** NOT PERFORMED  
**Live financial operations:** NOT AUTHORISED

## Source additions

- Multi-stage Node 22 Dockerfile with a production-only runtime dependency layer and `/healthz` container health check.
- `.dockerignore` excludes local environment files, node_modules, logs and generated archives.
- CI workflow runs dependency install, source/traceability/migration checks, typecheck, PostgreSQL migrations, Vitest, production build and high-severity dependency audit. CI does not deploy.
- `/healthz` is a liveness check; `/readyz` checks PostgreSQL connectivity and required schema tables for migrations 0000–0010. Readiness fails closed if any required table is missing.
- Graceful shutdown stops both background workers, waits for HTTP server closure and closes the PostgreSQL pool.
- Encrypted PostgreSQL backup and non-production restore scripts require protected passphrase files, checksum verification, explicit restore approval and a target database ending in `_restore` or `_dr_test`.
- `npm run release:check` is a fail-closed evidence gate. It requires migration/backup/RPO-RTO/security/privacy/accessibility/payment-accounting/legal/pilot sign-offs and blocks enabled external/live execution flags. Passing the configuration check is not deployment authorisation.
- Local Docker Compose uses an explicitly local-only database password and is not a production deployment stack.

## Release gate requirements

Before any production consideration, the operator must supply evidence for all of the following:

1. Full CI green on the exact release commit; typecheck, Vitest, production build and dependency audit.
2. All migrations applied and verified against a fresh disposable PostgreSQL database; migration rollback/forward recovery reviewed.
3. Backup encryption, off-site storage, restore rehearsal, backup access controls and checksum verification.
4. Approved RPO and RTO values, monitoring/alert ownership and tested incident response.
5. Security penetration test and retest of all critical/high findings; API/IDOR/CSRF/file/payment/webhook/payout/infrastructure checks.
6. Privacy review, DPIA where required, retention schedule, controller/processor agreements, cross-border transfer review and ODPC/legal advice.
7. Accessibility review against WCAG 2.2 AA on desktop/mobile, keyboard, screen reader, contrast, zoom and reduced motion.
8. Accounting/payments review of ledger, refunds, reward pool, payout legs, fees, taxes and reconciliations.
9. IntaSend contract, sandbox, webhook delivery, wallet identities/capability/liquidity, dispute/refund and payout outcome acceptance. No live mode is implemented in this source.
10. Approved pilot scope, support/escalation rota, rollback plan, communications plan and separate owner release authorisation.

## Current release blockers

- Full dependency installation is unavailable in the current preparation environment. `npm run typecheck` fails because `@types/node` and `vite/client` are missing; Vitest is not installed.
- No CI run has been executed from this working environment. The GitHub Actions workflow is source-added only.
- No Docker image built or started; no PostgreSQL service or migrations applied here.
- No encrypted backup or restore rehearsal executed. Backup scripts are unverified against a real PostgreSQL installation.
- RPO/RTO, off-site backup target, monitoring/alerting provider and incident rota are not selected or approved.
- No independent security, privacy, accessibility, accounting, payments or Kenyan legal sign-off.
- No production environment, domain, DNS, email, S3, ClamAV, secrets manager, IntaSend wallet or provider credentials were configured or contacted.
- Collection/refund/payout and external communications remain disabled by default. The application has no live provider mode in this replacement source.

## Final status

Batch 14's release tooling and runbooks are source-added, but the release is **BLOCKED**. A passing source syntax check or a future green CI run cannot replace operational, provider, legal, financial and owner sign-off. No deployment or real-money action is authorised.
