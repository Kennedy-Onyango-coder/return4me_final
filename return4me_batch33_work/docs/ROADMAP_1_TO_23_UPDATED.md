# Return4me roadmap — Stages 1–23

Updated: 2026-11-14

## Current checkpoint
Batch 23 added support queue ownership controls on top of Batch 22 audit-query hardening. The combined Node-native audit/support policy suite passes 32/32; the new support route static guard passes. This is source-level progress, not a claim that Stage 11 is complete.

| Stage / batch | Status | Evidence / remaining work |
|---|---|---|
| Stages 1–10 | Existing source baseline; acceptance open | Requirement-by-requirement runtime and independent acceptance remain outstanding. |
| Stage 11 — Admin/Owner | In progress | Overview/audit explorer and support queue ownership source work exists; broader queue catalogue, bulk actions, maker/checker, re-authentication, full permission matrix, PostgreSQL/API/browser and independent acceptance remain. |
| Stage 12 — Finance | Incomplete | Finance workflows require remaining implementation, accounting reconciliation, provider evidence and controlled acceptance. Live money movement remains disabled. |
| Stage 13 — Communications | Incomplete | Delivery, consent, retries, privacy and external-provider acceptance remain. External publishing remains disabled. |
| Stage 14 — Security/privacy | Incomplete | Full API/object/field/tenant authorization matrix, independent security/privacy reviews and incident controls remain. |
| Stage 15 — UX/accessibility | Incomplete | Full responsive and WCAG 2.2 AA browser/accessibility acceptance remains. |
| Stage 16 — Technical architecture | Incomplete | Backup/restore proof, RPO/RTO approval, observability and operational acceptance remain. |
| Stage 17 — Governance | Documentation consolidated; acceptance open | Per-requirement mapped test/technical evidence and independent review are still incomplete. |
| Batches 18–21 | Source changes present; acceptance open | Admin overview, audit explorer, filters and initial query tests. |
| Batch 22 | Source task + tests complete; acceptance open | Strict audit query allowlist, scalar validation, outcome allowlist; 16/16 Node tests pass. |
| Batch 23 | Support queue ownership source increment complete; acceptance open | Minimal queue DTO, support/admin scoping, bounded query parser, active verified support assignee validation, row-locked transactional assignment + audit; combined policy suite 32/32 and static guard pass. Full typecheck/API/DB/browser acceptance blocked/pending. |

## Current evidence boundaries
- Traceability: 165 unique requirement IDs and referenced source/candidate test paths validate. Candidate test paths are not proof that each requirement is covered.
- Evidence matrix: 165 rows validate; independent acceptance and release evidence remain explicit.
- Migrations: 12 ordered migration files validate; no migration was applied in this checkpoint.
- Static guards: admin overview and audit explorer guards pass.
- Full typecheck/build/Vitest/PostgreSQL/API/browser/accessibility/independent reviews: not run or not accepted in this environment. The full source verifier is blocked because TypeScript dependencies are not installed in this extracted archive.
- Production release: blocked; no production authorization is implied by this archive.
