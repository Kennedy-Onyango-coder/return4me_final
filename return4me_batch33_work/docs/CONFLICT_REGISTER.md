# Requirements and evidence conflict register

**Baseline:** Return4me clean-room source archive, 14 November 2026.  
**Rule:** Do not resolve a conflict by assumption. Record the source, owner decision and evidence before changing implementation or status.

| ID | Conflict / inconsistency | Impact | Current treatment | Resolution required |
|---|---|---|---|---|
| CON-001 | `docs/FINAL_HANDOFF.md` and `docs/BATCH16_INTEGRATED_VERIFICATION.md` describe an earlier environment where migrations were not applied and dependency installation was blocked; later owner-supplied Cline evidence reports 11 migrations applied locally, 82/82 tests, typecheck and build passing. | Readers may mistake old environment evidence for the latest working-tree state. | Preserve both as dated evidence; do not overwrite historical reports. This archive does not independently reproduce the later result. | Attach exact Cline logs, source hash/commit, environment and DB migration ledger to the next evidence update. |
| CON-002 | Earlier roadmap language describes Stages 1–17 source implementation as present while the detailed traceability matrix records 135 PARTIAL, 22 IMPLEMENTED_UNVERIFIED and 8 BLOCKED requirements. | Stage-level wording can overstate requirement-level completion. | Requirement-level matrix is authoritative for implementation status; stage headings are summaries only. | Keep stage summary aligned to all requirement rows and acceptance gates. |
| CON-003 | A source route or UI surface can exist while external execution is intentionally disabled. | Presence may be misread as operational availability. | Distinguish source implementation from configured/verified external capability. | Provider sandbox, security, finance and Owner approvals must be separately evidenced. |
| CON-004 | The saved ZIP does not prove it contains every subsequent change in the owner's Windows working directory. | Exact source baseline may differ. | This package is a reproducible saved-archive baseline only. | Compare fresh working-tree hash/manifest before treating it as current production candidate. |
| CON-005 | Traceability `test_paths` can identify candidate files but does not prove exact test names or requirement coverage. | Suite-level pass can be incorrectly generalized to requirements. | Evidence matrix keeps `mapped_test_names` blank until a precise mapping is documented. | Map test names and execution evidence requirement by requirement. |

## Decision log

No new product-policy decision is made by this register. Existing approved policies remain in `MASTER_REQUIREMENTS.md` and the relevant batch specifications. Any new decision requires explicit Owner approval and provenance.
