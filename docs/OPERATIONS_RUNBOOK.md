# Local development and safe operations runbook

## Install and validate

Use Node.js 20 or later. From the project root:

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Do not treat a successful frontend preview as evidence that database-backed workflows work.

## Database safety

- Use a newly created disposable PostgreSQL database for integration tests.
- Never point tests or migration commands at a production or owner data database.
- Review every SQL migration and generated Drizzle snapshot before applying it.
- The supplied project contains migrations `0000`, `0001`, `0002`, and `0003`; they have not been applied as part of this source archive creation.
- Do not run `npm run db:up` if a local PostgreSQL service already owns the configured port or volume.
- `DATABASE_URL` must be explicit and scoped to a disposable test database. Do not rely on development fallback credentials.

## Secrets and providers

- Keep `.env` files and provider secrets out of source control and ZIP handoffs.
- Use separate secrets per environment and rotate compromised credentials.
- Do not use production IntaSend, Resend, Facebook or Telegram credentials for tests.
- Provider sandbox and external account access require separate Owner authorisation.

## Disabled capabilities

Payment collection, payouts, refunds, automated settlement approval, final physical release, and external campaign publishing remain blocked until their acceptance gates and separate authorisations are complete.

## Recovery and change safety

- Preserve the project folder and all untracked files before any code-agent task.
- Do not reset, clean, stash, checkout, commit, push, deploy or publish unless separately authorised.
- Make corrections as additive migrations and append-only records where the approved policy requires immutable evidence.
