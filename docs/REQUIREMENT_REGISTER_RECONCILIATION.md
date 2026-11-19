# Requirement register reconciliation

**Repository:** `Kennedy-Onyango-coder/return4me_final`  
**Base:** `main` at `d4de539d6577bd2bccf81c5c3170dd44240725f8`  
**Change type:** CI/governance-register repair  
**Release state:** `NOT_AUTHORISED`

## Findings addressed

The CI run `44594034735` stopped at requirement traceability. The traceability register contained 173 requirements while the evidence matrix contained only 19 rows, and the two registers did not share the same ordered requirement IDs. Two explanatory pending-acceptance notes were also stored in `test_paths` as if they were file paths (`AGENT-003` and `PROD-003`).

## Changes

- Rebuilt the evidence matrix to contain one row for every traceability requirement, in the exact same order.
- Synchronized each row's implementation status and source/test candidate paths from the traceability register.
- Kept specification provenance at its existing value where present; new rows default to `PROVENANCE_PENDING`. No requirement approval or provenance was inferred.
- Kept technical verification at `NOT_RUN`, independent acceptance at `PENDING`, and release authorisation at `NOT_AUTHORISED`. No test names, execution evidence, reviewers, acceptance dates or source-review hashes were invented.
- Moved the two pending acceptance descriptions out of candidate test paths and into the relevant acceptance/blocker text.
- Strengthened the evidence-matrix validator to enforce exact register alignment, exact source/test path parity, path existence, and evidence requirements before technical verification, independent acceptance or release can be recorded.

## Verification boundary

The register repair is not application acceptance. Candidate test files identify where tests may be developed or run; they do not prove that a requirement is covered. PostgreSQL migration/API/concurrency, browser, security, independent acceptance and release checks remain outstanding unless a later run records explicit evidence.

Run the normal CI workflow on this branch. A passing static register check must not be interpreted as permission to apply migrations, move money, enable provider operations or release the product.

## Follow-on CI finding

The first full CI attempt passed the repaired traceability and evidence-matrix checks, then exposed a stale Batch 49 test boundary. The test used a comment marker that no longer followed the control-totals route, so its source slice extended into unrelated mutating Finance routes. The test now delimits the control-totals route at the next Finance route registration and continues to reject updates or writes to settlement, refund, payout and provider-operation records. This corrects the test boundary; it does not relax the read-only requirement.
