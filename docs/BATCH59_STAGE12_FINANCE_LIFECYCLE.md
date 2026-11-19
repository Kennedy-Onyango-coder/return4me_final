# Batch 59 — Stage 12 Finance lifecycle and evidence safeguards

**Implementation date:** 17 November 2026  
**Baseline:** Batch 60 Stage 13 communications source archive  
**Source status:** IMPLEMENTED_PARTIAL / UNVERIFIED  
**Migration:** `0019_stage12_finance_lifecycle_evidence.sql` — prepared, NOT applied  
**Application tests:** DEFERRED until all stage implementations are complete, per user instruction.

## Baseline reconciliation

Batch 59 was previously described in chat but its claimed source archive/working copy was not available in the Batch 58 baseline. This batch reconstructs the documented outstanding Stage 12 finance scope against the actual Batch 60 source tree. It does not claim to recover the earlier unavailable implementation. Migration 0018 remains Stage 13 communications; Batch 59 receives migration 0019. No migration was applied.

## Implemented

1. **Third-party payer authorisation:** claimant payment-session UI requires payer relationship and an explicit attestation before the payment transaction is created. The policy version and text SHA-256, payer fingerprint and attestation timestamp are recorded against the transaction. The actual payer must personally approve the M-Pesa prompt. The claimant attestation is not independent proof of payer identity/consent, and the payer receives no ownership rights. The attestation is included in the claimant's personal-data export without exposing the internal fingerprint.
2. **Historical allocation provenance:** new settlements carry `33-25-42-v1` policy version and snapshot timestamp/source. Existing historical amounts and percentages are not rewritten. A step-up-protected, separately audited allocation review stores a new immutable review record; the original settlement is unchanged.
3. **Payout beneficiary verification history:** manual verification creates a separate evidence-hash event; beneficiary cannot verify their own destination. Admin/Owner can inspect an audited verification history without exposing the raw evidence reference.
4. **Provider statement evidence register:** Admin/Owner can register provider, statement period, private evidence reference, SHA-256 and declared row count. A different Admin/Owner with step-up may review the reference. The system does not upload, parse or reconcile statement contents.
5. **Provider reversal/chargeback register:** chargebacks, provider returns and refund reversals can be linked to an original payment, recorded with evidence reference/hash, and independently reviewed. The review does not mutate payment status, post a journal, trigger a refund/payout or alter item custody.
6. **Dormant liability safeguards:** Finance shows aggregate aged unsettled settlement, payout and refund obligations and provides a manual contact/legal-review register. No automatic forfeiture, transfer or write-off is provided.
7. **Period-close evidence workflow:** a best-effort, non-transactional operational snapshot is hashed and submitted for a separate step-up-protected maker/checker review. Snapshot provenance is immutable. Approval only permits external accountant review; it does not close the accounting period, certify provider matching or post journals.
8. **Audit and step-up:** new consequential finance review actions use distinct purposes and audit events. Provider evidence provenance is protected against ordinary update/delete/truncate mutation by migration triggers where specified.

## New API routes

- `GET /api/finance/liabilities/aging`
- `GET /api/finance/liabilities/review-register`
- `POST /api/finance/liabilities/review-register`
- `POST /api/finance/settlements/:id/allocation-review`
- `GET /api/finance/payout-destinations/:id/verification-history`
- `GET /api/finance/provider-statements`
- `POST /api/finance/provider-statements`
- `POST /api/finance/provider-statements/:id/review`
- `GET /api/finance/provider-reversals`
- `POST /api/finance/provider-reversals`
- `POST /api/finance/provider-reversals/:id/review`
- `GET /api/finance/period-close-requests`
- `POST /api/finance/period-close-requests`
- `POST /api/finance/period-close-requests/:id/review`

## Migration 0019

Adds payer authorisation attestations, historical allocation review records, payout destination verification history, provider statement evidence, provider reversal cases, dormant liability review register and period-close evidence requests. It adds allocation provenance columns to settlements and append-only/provenance protection triggers. Migration 0019 is in Drizzle journal index 19 and is NOT applied.

## Explicit remaining Stage 12 gaps

- No actual provider statement file upload, parsing, row-level matching or automated provider-to-ledger reconciliation.
- No external payer OTP/identity verification; payer authorisation is claimant attestation plus the payer's own STK approval.
- No post-handover chargeback correcting journal or legal/accounting decision engine. Reversal review is a register only; no payment/custody state changes.
- No historical allocation backfill/recalculation. Existing unversioned rows remain labelled legacy; any backfill requires separate written authority and accountant review.
- No complete provider fee expense ledger posting or verified wallet liquidity/treasury integration.
- No actual period close, financial statement certification, tax treatment or journal posting from the period-review workflow.
- Dormant-liability register requires manual population and contact/legal process; no automated outreach or forfeiture.
- PostgreSQL, API, concurrency, accounting, provider, browser and independent acceptance are deferred until all implementation stages are complete.

## Safety

No provider call, STK prompt, refund, payout, wallet transfer, journal posting, period close, production migration, deployment, item release, commit or push was performed. Live money movement remains BLOCKED and NOT AUTHORISED.
