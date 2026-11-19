# Batch 31 — Expanded high-risk verification and Owner final authority

Date: 15 November 2026

## Scope

This batch extends action-specific, session-bound step-up verification to consequential operational routes. It does not enable external providers, publishing, refunds, payouts, or production execution.

## Source changes

- Added allowlisted step-up purposes and OTP challenge mappings for claim-evidence review, dispute resolution, Agent status changes, Agent assignment creation/cancellation, pricing schedule approval, collection reconciliation review, refund approval/execution/reconciliation, payout-destination verification, reward-authorisation verification, and payout approval/execution/reconciliation.
- Applied the matching `requireStepUp` middleware to those routes. Existing role checks, business validation, feature gates, maker/checker rules and audit writes remain in place.
- Added all new purposes to the Admin/Owner step-up selector.
- Clarified the Owner's final approval authority: Owner may approve their own refund request, payout request, pricing schedule, or communications campaign; Admin cannot self-approve those actions. Audit metadata records when Owner final authority was used.
- Preserved separate executor controls for financial operations. Owner approval does not turn provider execution on or bypass existing payout/refund feature gates and reconciliation requirements.

## Verification

- Node native policy suite: 67/67 passed across the selected Stage 11 policy and queue tests.
- High-risk step-up static guard: passed for existing and newly added route purposes and Owner override conditions.
- Full typecheck, Vitest, build, PostgreSQL migration/runtime, API/concurrency, browser/device/accessibility and independent security acceptance: not completed in this environment.
- Step-up grant consumption still occurs in its own transaction before the business transaction. This is fail-closed but can consume a grant if the downstream action fails; atomic transaction integration remains a separate hardening item.

## Stage 11 roadmap

- Two privileged roles (Admin and Super Admin/Owner): source implemented; DB/API/browser acceptance pending.
- Owner final authority: expanded across report, role lifecycle, legal agreement, communications, organisation, finance and pricing approvals; acceptance pending.
- High-risk step-up: expanded to the listed routes; full inventory and atomic consumption remain pending.
- Maker/checker: report decisions and existing communications/finance/pricing controls remain; full cross-domain policy review pending.
- Queue/detail coverage, object/field authorization, bulk action coverage and complete runtime/independent acceptance remain pending.

Stage 11 remains PARTIAL. No requirement is marked VERIFIED_COMPLETE by this source batch.

## Operational restrictions

No production migration, deployment, live refund, payout, provider operation, external publication, or item release was performed. Database migrations remain unapplied.
