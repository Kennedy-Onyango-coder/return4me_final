# Financial operations runbook — controlled source workflow

- Never ask a claimant to pay outside the Return4me payment-session flow. A requested STK prompt is not a payment confirmation.
- For an ambiguous collection, preserve `unknown`, reconcile the exact invoice and authoritative provider status, and do not create a second prompt until a confirmed failure and active payment window are established.
- Claimant recovery-service charges are separate from reward funding. Do not allocate Finder/Agent/Platform percentages from claimant service charges.
- A reward pool requires a recorded source/reference/evidence and independent verification. Settlement eligibility is 48 hours after the final release event and pauses under a settlement hold.
- Settlement auto-approval never initiates payout. Finance/Admin creates payout legs; a different Admin approves; a third operator executes.
- Verify beneficiary destination and 48-hour cooling, current destination fingerprint, claimant payment, completed handover, dispute holds, KES wallet identity, disbursement capability and available funds before any sandbox request.
- Provider acceptance is not completion. Only exact per-transaction TS100 status (or separately documented independent evidence reconciliation) confirms payout completion.
- Never retry `submitting`, `accepted` or `unknown` collection/refund/payout outcomes automatically. Do not create a new attempt until a separate repair policy is approved.
- IntaSend adapters in this replacement source are sandbox-only and disabled by default. No live provider execution is supported.
- Provider disbursement fees are Platform expense. If the provider does not return a verifiable fee, do not assume zero.
