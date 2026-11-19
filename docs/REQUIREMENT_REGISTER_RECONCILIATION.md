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

## Full CI result — 19 November 2026

Latest full workflow run: [44595627238](https://github.com/Kennedy-Onyango-coder/return4me_final/actions/runs/44595627238), commit `fe7c99e5287499136664c2fe3b6e3b7711fa994b`.

| Check | Result |
|---|---|
| `npm ci` | PASS |
| `npm run verify:all` | PASS |
| `npm run typecheck` | PASS |
| `npm run db:migrate` | PASS against the workflow's disposable PostgreSQL 16 service |
| `npm test -- --run` | PASS |
| `npm run build` | PASS |
| `npm audit --audit-level=high` | FAIL — 5 advisories reported (4 moderate, 1 high) |

The remaining high-severity finding is in `sharp@0.34.5`; GitHub Advisory Database identifies `sharp` versions below 0.35.5 as affected by the librsvg advisory and lists 0.35.5 as patched: https://github.com/advisories/GHSA-wq5f-xc86-pv6w. The audit also reports the deprecated `drizzle-kit@0.31.11` → `@esbuild-kit/esm-loader` → `@esbuild-kit/core-utils` → `esbuild@0.18.20` chain for a moderate advisory: https://github.com/advisories/GHSA-67mh-4wv8-2f99.

No `npm audit fix --force` was run. The CI output proposes a breaking Drizzle Kit downgrade to 0.18.1, so the remaining dependency remediation requires a separately reviewed lockfile update and verification of Drizzle configuration/migration behavior. The audit gate remains enabled and release remains `NOT_AUTHORISED`.

## Dependency remediation batch

The security remediation updates the direct `sharp` dependency to `^0.35.5`, the first release confirmed patched for the reported 2026 Sharp/libvips advisories. It also adds a narrowly scoped npm override for `@esbuild-kit/core-utils` so its obsolete nested `esbuild@0.18.20` dependency resolves to the maintained compatible `^0.25.0` range already used by the repository. The override is deliberately scoped to that deprecated package rather than globally overriding every esbuild dependency.

A branch-scoped GitHub Actions workflow regenerates the lockfile with Node 22, performs a clean install, runs the high-severity audit gate, typecheck, test suite and production build, and commits only the generated lockfile back to this branch when all checks pass. The ordinary Return4me CI workflow remains the final full verification gate, including PostgreSQL migration checks and the complete governance suite. The helper workflow is restricted to this remediation branch and package/workflow changes; its lockfile-only commit does not retrigger itself.
