# Batch 64 — Stage 17 Governance, Evidence and Release Controls

**Date:** 17 November 2026  
**Status:** Source/documentation controls added; unverified; Stage 17 remains PARTIAL.
**Production status:** NOT_AUTHORISED.

## 1. Scope implemented

1. Reconciled `REQUIREMENT_TRACEABILITY.csv` to every requirement ID in `REQUIREMENT_EVIDENCE_MATRIX.csv`. The traceability register previously contained 115 valid IDs plus five malformed rows with evidence-matrix columns appended; the evidence matrix contained 173 IDs. The 58 missing or malformed IDs were reconstructed from the evidence matrix, while the 115 valid original traceability rows were preserved.
2. Added `GOVERNANCE_EVIDENCE_REGISTER.csv` for source evidence provenance, hash capture, verification state, independent review and release state.
3. Added `CHANGE_CONTROL_REGISTER.csv` to record scope, affected stages, migration impact, reviewers, approval, rollback and production authorisation.
4. Added `ACCEPTANCE_DECISIONS.csv` with explicit PENDING decisions for Stages 12–17. No reviewer, signature, date or approval has been invented.
5. Added `RELEASE_EXCEPTIONS.csv`; no active waiver exists.
6. Added `scripts/verify-governance-registers.mjs` as a static governance-register consistency checker. It has NOT been executed.
7. Tightened `scripts/check-release-gates.mjs` with additional fail-closed governance approval flags. The release check is still only a configuration preflight, not an authorization mechanism.

## 2. Evidence rules

- Every evidence item must identify an exact source/archive baseline and SHA-256. `PENDING_CAPTURE` is not a hash and cannot support acceptance.
- Evidence must be captured from the actual command/tool output or immutable artifact. A planned test, candidate test path, screenshot description or source-code presence is not execution evidence.
- Technical verification, independent acceptance and production authorization are separate fields and decisions.
- A `PASSED` technical check does not imply requirement acceptance. Acceptance must cite exact evidence IDs, reviewed source hash, reviewer identity/role, date, findings and decision.
- A source change affecting an accepted requirement invalidates that acceptance until impact review is completed. Prior decisions are retained and superseded, never silently overwritten.
- Exceptions require documented risk, compensating controls, expiry, independent review and explicit Owner decision. No exception can waive statutory obligations or override payment, custody, security or privacy safeguards.
- Release approval is a separate Owner action after all applicable gates and professional reviews are complete.

## 3. Requirement reconciliation outcome

- Requirement evidence matrix: 173 requirement IDs.
- Requirement traceability register after reconciliation: 173 requirement IDs.
- Reconciliation method: exact ID set comparison; no requirement ID was removed.
- Specification provenance remains pending for the 173 matrix rows unless separately supported by approved requirement evidence.
- Existing five `PASSED` technical-verification labels in the matrix are historical entries and must be checked against exact command output and source hash before acceptance. This batch does not upgrade or endorse them.
- The matrix still has 173 `PENDING` independent-acceptance entries and 173 `NOT_AUTHORISED` release entries.

## 4. Outstanding governance work

- Obtain the signed, owner-approved canonical requirements baseline and reconcile requirement provenance.
- Capture immutable hashes for every final batch archive and source snapshot.
- Populate exact test names, execution logs, exit codes, environment, database migration state and artifact hashes after the implementation freeze.
- Conduct independent stage/requirement reviews with conflicts of interest managed.
- Review and resolve risk register items; no silent waiver or due-date inference.
- Record formal change approvals and rollback evidence for all migrations and production changes.
- Obtain qualified Kenya legal/privacy, accounting, security and accessibility reviews where applicable.
- Obtain explicit Owner release authorization separately; current state remains NOT_AUTHORISED.

## 5. Verification and safety

No application test, typecheck, build, PostgreSQL/API/browser/accessibility test or static governance verifier was run in this batch, per the agreed implementation-first policy. No migration was added or applied. No production data, provider, payment, deployment, publication, item release, commit or push action occurred.
