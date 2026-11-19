# Batch 10 — original-payer refunds and controlled reconciliation

**Source status:** IMPLEMENTED_UNVERIFIED  
**Refund submission:** DISABLED BY DEFAULT; sandbox-only code path  
**Live refund:** NOT SUPPORTED / NOT AUTHORISED  
**Migration:** `0006_original_payer_refund_controls.sql`

## Implemented

1. The original claimant M-Pesa destination is encrypted at rest using AES-256-GCM with a versioned envelope (`v1`) and separately fingerprinted with HMAC-SHA256. Raw phone numbers are not stored in plaintext. Collection remains disabled unless both independent keys are configured.
2. A refund request is a deliberate Finance/Admin decision, not an automatic consequence of claim rejection. Only a provider-confirmed payment can be requested for refund.
3. The current refund workflow supports full refunds only, to the original M-Pesa payer. Alternate destinations are not offered; the stored destination fingerprint is rechecked against the original payer fingerprint before execution.
4. A completed/handover claim cannot use the pre-handover refund path. Post-handover reversals/chargebacks must not automatically reopen the claim or retrieve the item.
5. Request, approval, execution and reconciliation are separate actions. The approver must differ from the requester; the executor must differ from both; the reconciler must differ from the requester and executor.
6. The IntaSend sandbox B2C refund adapter uses the original repository's documented `send-money/initiate` structure. It is disabled unless `INTASEND_REFUND_ENABLED=true`, and live mode is explicitly refused.
7. Provider initiation acceptance is always recorded as `unknown`, never as a completed refund. A timeout, 408, 429 or 5xx is also `unknown`; a clear 4xx refusal is `rejected`. Unknown/submitting outcomes cannot be resubmitted.
8. The original repository's refund status verification is not implemented as an authoritative provider status path. Therefore finalisation is a manual independent-admin evidence decision; only then can payment and assessment become `refunded` and a correcting KES journal reverse the original collection journal.
9. A confirmed refund creates a balanced correcting journal: debit unclassified collections liability, credit provider collection clearing. It does not change the already completed custody state.

## Routes added

- `GET /api/finance/refund-requests`
- `POST /api/finance/refund-requests`
- `POST /api/finance/refund-requests/:id/approve`
- `POST /api/finance/refund-requests/:id/execute`
- `POST /api/finance/refund-requests/:id/reconcile`

## Explicit limits

- No partial refund, alternate destination, automatic refund, automatic retry, or automatic refund finalisation.
- No refund provider status endpoint has been assumed or invented.
- Collection-fee allocation and tax/accounting classification remain subject to professional review.
- Live IntaSend refund calls are not supported by this release; the adapter is sandbox-only.
- Post-handover chargeback/reversal intake and separate accounting workflow remain pending Batch 11 follow-up.

## Acceptance still required

- Full typecheck/build/Vitest and test AES-GCM key handling, wrong-key rejection, key rotation/version retention and encrypted destination access.
- Apply migration 0006 to a disposable PostgreSQL DB; test request/approval/execution/reconciliation races and journal immutability.
- Verify maker/checker separation and original-payer fingerprint equality in API integration tests.
- Sandbox refund request only after separate operator approval; confirm provider response shape and status semantics. No such provider test has been performed.
- Independent security, privacy and accounting review. Keep the refund flag false until all gates pass.
