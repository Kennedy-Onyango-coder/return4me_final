# Batch 6 — financial integrity foundation (source only)

**Date:** 14 November 2026  
**Status:** `IMPLEMENTED_UNVERIFIED` for the journal foundation; provider collection, refunds, payouts and automated settlement remain `BLOCKED`.

## Implemented in this source delivery

- `shared/ledger-policy.ts` validates integer-cent KES postings, requires at least two lines, requires exactly one positive debit or credit per line, rejects invalid account codes and requires exact debit/credit balance.
- `server/db/migrations/0003_financial_journal.sql` adds immutable financial journals and postings, idempotency/source uniqueness, KES-only currency, deferred balance checks, and correction-by-new-journal controls.
- `server/services/ledger.ts` posts a balanced journal and its lines in one database transaction; an existing idempotency key is reused, while a conflicting source with a different key is not silently treated as success.
- `GET /api/finance/ledger/journals` provides a permission-gated read-only view.
- Collection, payout and refund endpoints remain fail-closed. This journal service is not connected to IntaSend or any real-money operation.

## Required acceptance before use

1. Generate and review Drizzle migration metadata/snapshot for the added schema.
2. Apply migrations only to a newly created disposable test database after separate database-test authorisation.
3. Prove deferred constraint behaviour for balanced, unbalanced, empty and duplicate journals.
4. Prove idempotency under concurrent requests and rollback when any posting insert fails.
5. Verify account mapping with a qualified Kenyan accountant and reconcile the model against provider/M-Pesa statements.
6. Independently review permissions, audit coupling, period-close separation and correction workflows.

## Not implemented or enabled

- No IntaSend request/callback adapter, wallet routing, live collection, refund, payout, beneficiary verification or settlement worker was enabled.
- No historic ledger/allocation rows were rewritten.
- No provider, database, production or external service was contacted.
