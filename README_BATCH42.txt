BATCH 42 — RESTRICTED PRIVACY AND SECURITY CASE WORKSPACES

See docs/BATCH42_RESTRICTED_CASE_WORKSPACES.md for scope, controls and deferred acceptance.

Source changes:
- server/routes/privacy.ts: paginated metadata-only Admin queue; separately authorised and audited detail route.
- server/routes/security-incidents.ts: paginated/filterable metadata-only Admin queue; separately authorised and audited detail route.
- src/App.tsx: Admin/Owner Restricted Governance panel for both queues and existing step-up-protected decisions.
- docs/IMPLEMENTATION_PROGRESS_2026-11-14.md, docs/ROADMAP_1_TO_24_UPDATED.md, docs/REQUIREMENT_TRACEABILITY.csv and docs/REQUIREMENT_EVIDENCE_MATRIX.csv updated.

Per user instruction, no tests, typecheck, build or runtime acceptance were run in this batch. No migration was added or applied. Production/provider/money/deployment/publication/item-release actions remain disabled.
