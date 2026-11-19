# Batch 11 — reward funding, 48-hour settlement and manual payouts

**Source status:** IMPLEMENTED_UNVERIFIED  
**Automatic action:** settlement eligibility approval only  
**Payout submission:** DISABLED BY DEFAULT; sandbox-only code path  
**Live payout:** NOT SUPPORTED / NOT AUTHORISED  
**Migration:** `0007_reward_settlement_payout_controls.sql`

## Reward allocation is separate from claimant collection

The claimant recovery-service payment is not used as the Finder/Agent reward pool. A Finance/Admin user must record a separate reward-funding authorisation with a funding source, source reference and evidence reference. A different Admin verifies that evidence. Only then is the reward allocation snapshot created.

The approved split is applied to the separately authorised reward pool:

- Finder: 33%
- Assigned Agent: 25%
- Platform holding: 42%

The immutable allocation journal debits `REWARD_FUNDING_CLEARING` and credits Finder, Agent and Platform holding liabilities. It does not treat claimant service charges as reward funds or automatically recognise revenue. The funding evidence is manually verified; no bank connector or funding-provider confirmation is implemented.

## Settlement lifecycle

1. Claim must be `completed` with a recorded Agent release event and claimant handover confirmation.
2. Required claimant payment must be provider-confirmed and its assessment `paid`.
3. The Finder is identified as the reporter of the found report; the Agent is the currently assigned, active and verified Agent. The claimant is excluded as a beneficiary.
4. No unresolved dispute release hold may exist.
5. The reward funding authorisation must have been independently verified.
6. Settlement is created as `eligible`, with `settle_at` exactly 48 hours after the final release event.
7. A background worker automatically changes an eligible settlement to `approved` only after `settle_at` has elapsed and no release-holding dispute exists. It writes an audit event and does not create or submit payouts.

## Beneficiary destinations

- Finder and Agent submit their own Kenyan M-Pesa destination.
- Phone values are encrypted with the same versioned AES-256-GCM envelope and HMAC fingerprint used for payment PII.
- Only masked values are returned in API projections.
- Admin manually verifies a destination with an evidence reference.
- A 48-hour cooling period starts after verification. Replacing a destination revokes the prior active destination and restarts verification/cooling.
- A payout request snapshots the encrypted destination and fingerprint. Execution rechecks the current verified fingerprint and cooling period; a changed destination blocks execution. A pre-submission draft can be refreshed, which resets approval.

## Manual payout lifecycle

1. Finance/Admin creates Finder and Agent payout legs only after the settlement is approved and both positive-value beneficiary destinations are verified and past the cooling period.
2. A different Admin approves each payout leg.
3. A third, independent Finance/Admin user must execute. Preflight rechecks settlement, payment, completed handover, dispute holds, beneficiary, destination fingerprint/cooling, wallet identity/capability and operator-recorded working-wallet funds evidence.
4. Payout execution is disabled unless `INTASEND_PAYOUT_ENABLED=true`, the KES disbursement wallet is configured and manually attested as verified/disbursement-capable, the settlement wallet is configured and different, the PII keys exist, and the funds-evidence flag is true.
5. The adapter is hard-coded to the IntaSend sandbox host. Live payout mode is not supported. The request uses `MPESA-B2C`, `requires_approval: NO` (because Return4me's independent approval is already complete), one exact transaction binding and a stable idempotency key.
6. Provider acceptance is only `accepted`, never `completed`. Only an exact provider tracking ID plus exact transaction ID with authoritative `TS100` can complete a leg. Known failure/cancellation is recorded as rejected; unknown remains unresolved. No automatic retry exists.
7. Payout completion posts a correcting journal against the Finder or Agent payable. Verified disbursement charges, if returned by provider status, are posted as `PLATFORM_PROVIDER_FEES_EXPENSE`; no missing fee is assumed to be zero.
8. Settlement becomes `paid` only after all external Finder/Agent payout legs are provider-confirmed. The 42% Platform holding remains a separate internal allocation and is not a B2C payout.

## Routes added

- `GET /api/finance/payout-destinations/mine`
- `POST /api/finance/payout-destinations/mine`
- `GET /api/finance/payout-destinations/pending`
- `POST /api/finance/payout-destinations/:id/verify`
- `POST /api/finance/reward-authorizations`
- `GET /api/finance/reward-authorizations`
- `POST /api/finance/reward-authorizations/:id/verify`
- `POST /api/finance/settlements/:id/payout-requests`
- `GET /api/finance/payout-requests`
- `POST /api/finance/payout-requests/:id/refresh-destination`
- `POST /api/finance/payout-requests/:id/approve`
- `POST /api/finance/payout-requests/:id/execute`
- `GET /api/finance/payout-requests/:id/status`
- `POST /api/finance/payout-requests/:id/reconcile`

## Operational boundaries

- The application does not read wallet balances. `INTASEND_DISBURSEMENT_WALLET_FUNDS_VERIFIED=true` is an operator attestation, not a live balance check.
- The working/disbursement wallet must be verified KES and `can_disburse=true`; the settlement wallet must be separately identified and different. The environment values are not themselves provider verification.
- The provider adapter is sandbox-only and disabled by default. No sandbox or live provider request has been made.
- Unknown/submitting/accepted payout outcomes are never automatically resubmitted. Manual reconciliation records evidence but does not create a retry.
- If the Finder is a guest reporter with no user account, or a beneficiary lacks a verified destination, payout preparation is blocked rather than inventing a recipient.
- No automatic payout occurs when settlement is approved.

## Acceptance still required

- Full typecheck/build/Vitest and disposable PostgreSQL migration 0007.
- Concurrency tests for reward authorization, 48-hour worker, dispute hold, destination change, maker/checker/executor separation and payout CAS.
- Verify the exact IntaSend send-money response/status contract and fee fields in sandbox before enabling the sandbox flag.
- Test provider accepted/BP103, timeout/408/409/429/5xx, missing tracking ID, missing transaction ID, mismatched tracking ID, unmatched transaction, TP/TH/TR, TF/TC and exact TS100.
- Verify wallet identity/currency/can_disburse and working-wallet liquidity out of band; the app deliberately does not query wallet balances.
- Independent accounting, payments, privacy and security acceptance. No live mode or production money movement is authorised.
