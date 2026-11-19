# Batch 8 — payment-controlled custody and final handover

**Source status:** IMPLEMENTED_UNVERIFIED  
**Release capability:** gated in source; no database acceptance evidence yet  
**Migration:** no additional migration required

## Implemented lifecycle

1. The claimant confirms the approved, itemised recovery-service assessment.
2. The 24-hour payment window is anchored to the assigned active Agent's `inspection_completed` custody event, after physical receipt. If inspection predates claimant confirmation, the existing inspection timestamp is used; otherwise the window is opened when the Agent later completes inspection.
3. The claimant initiates an M-Pesa STK session only while the assessment is claimant-confirmed, the 24-hour window is active, the approved claim remains payable and the current assigned active verified Agent has recorded inspection.
4. The IntaSend callback is authenticated, but callback contents alone never confirm payment. The canonical provider status lookup must verify invoice ID, API reference, KES currency, exact amount and `COMPLETE` state.
5. Admin may issue the claimant collection code only after confirmed payment, active assignment, appointment and claimant identity/authority checks.
6. The Agent records `handover_ready` only after confirmed payment, inspection, active appointment and successful single-use collection-code validation.
7. The claimant records their handover confirmation for the same current assignment.
8. The Agent records `released`. The release transaction rechecks payment, identity/authority, consumed code, handover-ready event, claimant confirmation, current appointment, active verified Agent and absence of unresolved release holds. It updates the claim to `completed` and appends the release event atomically.

## Important boundaries

- `completed` means the item was operationally handed over; it does not mean the Finder/Agent/Platform rewards have been settled or paid.
- The claimant's recovery-service charge remains separate from the reward split (Finder 33%, Agent 25%, Platform 42%).
- A later financial reversal does not automatically retrieve the item or reopen a completed handover.
- Settlement and payout remain separate later batches; no automatic or live payout is enabled.

## Verification still required

- Full typecheck/build/Vitest, including the updated custody workflow tests.
- Disposable PostgreSQL application of migrations 0000–0004 and concurrent release tests.
- Prove a dispute/legal hold, changed assignment, expired appointment, unconfirmed claimant, unconsumed code, failed payment, or duplicate release all fail closed.
- Prove claim completion and custody event insertion commit or roll back together.
- Independent review of the final handover and claimant-authority controls.
