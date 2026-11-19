# Batches 52–54 — Combined Stage 11 governance implementation

**Baseline:** Batch 51 combined claim governance archive, 16 November 2026  
**Scope:** cross-domain maker/checker improvements, purpose-bound high-risk step-up, and append-only audit-event protection.

## Batch 52 — maker/checker and independent review

- Claimant self-review remains prohibited for representative-authority and ownership decisions.
- The representative-authority reviewer cannot also make the final ownership decision.
- A person who reviewed the attached ownership evidence cannot also make final ownership approval.
- A person who reviewed representative-authority evidence cannot also verify the representative-authority decision.
- Claimant identity/authority checking at collection and claimant collection-code issuance are separate Admin actions; the code issuer must differ from the identity/authority checker.
- Refund and payout maker/checker rules already present in the baseline remain in place; this batch does not claim that every consequential domain now uses the generic proposal/approval workflow.

## Batch 53 — additional high-risk step-up controls

Added purpose-specific step-up verification, with grants consumed in the same database transaction as the consequential write, for:

- representative-authority review;
- final claim ownership review;
- Agent service-phone verification;
- claimant identity/authority check at collection;
- claimant collection-code issuance;
- Finder drop-off-code issuance.

The Admin step-up selector and server challenge-purpose allowlist were updated for each purpose. Service-phone verification now requires a reason and records an audit event. Collection-code and drop-off-code values remain private; they are not returned by the API.

## Batch 54 — audit-event immutability

Migration `0017_admin_audit_immutability.sql` adds database triggers that reject `UPDATE`, `DELETE`, and `TRUNCATE` on `audit_events`. The migration is included in the ordered migration journal but has **not** been applied.

This is an application/database-trigger immutability control, not a cryptographic tamper-evident hash chain. Database owners/superusers can alter schema or disable triggers. Production database role separation, backups, monitoring and retention/legal-hold policy still require independent review.

## Verification

- `node scripts/verify-batch52-54-governance.mjs` — 16/16 source assertions passed.
- `node scripts/verify-migrations.mjs` — 18 ordered SQL migration files and journal entries validated; no migration applied.
- `node scripts/verify-batch51-claim-governance.mjs` — 10/10 source assertions passed.
- `node --test scripts/test-batch52-54-governance.mjs` — 18/18 focused policy/source assertions passed.
- PostgreSQL migration execution and trigger behavior were not tested.
- HTTP/API authorization, concurrency, browser, accessibility and independent acceptance were not performed.
- TypeScript typecheck/build and Vitest remain subject to installed dependency availability.

## Safety boundaries

No production database migration, deployment, provider call, payment, payout, refund, item release or external publication was performed. This archive contains source and a prepared migration only. Stage 11 remains **PARTIAL** pending runtime and independent acceptance.
