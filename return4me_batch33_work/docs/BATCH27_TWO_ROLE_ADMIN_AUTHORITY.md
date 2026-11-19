# Batch 27 — Two-role administrative authority

Date: 2026-11-15
Status: Source implemented; database/runtime/independent acceptance pending

## Owner-approved governing rule

Return4me has exactly two privileged administrative roles:

1. **Admin** — operational administrator with the platform permissions needed to run day-to-day workflows.
2. **Super Admin (Owner)** — highest authority and final decision-maker. Owner can access and approve every privileged platform operation, including restricted operational, finance, Trust & Safety, support, communications and governance capabilities.

Other platform roles (Claimant, Finder, Agent and Organisation) remain separate non-administrative roles. There are no separate Finance, Trust & Safety, Support, Communications Writer, Communications Approver or Communications Publisher administrator tiers.

## Implemented source changes

- `shared/admin-role-policy.mjs` centralizes normalization and authority decisions.
- `server/security.ts` maps legacy delegated administrative scopes to canonical Admin on authentication. Owner bypasses privileged role gates but not authentication, suspension, session, origin, step-up, audit or workflow-specific validation.
- `shared/contracts.ts` exposes only `admin` and `owner` as privileged application roles.
- `shared/admin-access-policy.mjs` describes all declared capabilities as available to Owner; Admin has operational capabilities, while legal approval of Agent agreements remains Owner-only.
- Handler-level explicit checks in authentication step-up, disputes, evidence and support were updated to recognize Owner authority.
- Support queue assignment now recognizes canonical Admin and Owner accounts rather than a retired Support role.
- `scripts/grant-role.ts` no longer provisions legacy delegated admin scopes.
- The authenticated workspace exposes Admin operational controls to Owner and shows the Super Admin/final-authority distinction.
- Migration `0013_two_privileged_admin_roles.sql` grants canonical Admin to legacy delegated-scope holders unless they already hold Admin or Owner, then revokes the legacy active role rows. It is prepared but NOT applied.

## Security and audit interpretation

Owner final authority is not an audit bypass. Owner actions remain tied to an individual authenticated account and session. Existing step-up controls remain applicable to the currently covered report publication/rejection/closure actions. Workflow validation, transaction integrity, privacy and legal gates remain in force. Admin cannot exercise Owner-only legal approval.

## Verification

- Combined Node-native tests: 57/57 passed.
- Two-role role-policy, Admin capability, step-up, Admin queue, support ownership, overview, audit explorer, bulk action, traceability, migration metadata and evidence matrix static checks passed.
- Traceability: 166 unique requirement IDs; source and candidate test paths exist. This is not proof of full coverage.
- Evidence matrix: 166 rows; no requirement was marked independently accepted or release-authorised.
- Migration metadata: 14 ordered migrations; none applied.
- `verify-source` could not run because the extracted archive has no installed `typescript` package. TypeScript, Vitest, build, PostgreSQL, API, concurrency, browser, mobile, accessibility and independent security acceptance remain pending.

## Remaining Stage 11 work

- Maker/checker proposal and approval workflows for consequential Admin actions.
- Owner final-decision workflow and clear Owner-vs-Admin action history.
- Full operational queue/detail coverage and object/field-level authorization tests.
- Step-up coverage for every applicable high-risk action.
- Full runtime and independent acceptance.

No production migration, deployment, provider call, live payment, payout, item release or public publication was performed.
