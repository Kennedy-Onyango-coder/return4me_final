# Consolidated Stage 11 Governance Implementation — 15 November 2026

## Scope
This consolidated implementation strengthens the two privileged administrative roles and adds a report decision maker/checker workflow. It is a source implementation, not a production release or independent acceptance.

## Administrative roles
- Exactly two privileged application roles are exposed: `admin` and `owner` (Super Admin).
- Legacy delegated labels are normalized to Admin on authentication. Route gates that still name legacy scopes are normalized too, so Admin does not lose those operational permissions.
- Owner is the highest authority and passes privileged route gates. Owner-only gates remain unavailable to Admin. Restricted data still requires authenticated, purpose-appropriate route access and audit controls.
- Customer, Finder, Agent and organisation roles are unchanged.

## Report decision governance
- Admin proposes publish/reject/close with a reason. Proposals expire after 48 hours.
- A different Admin or the Owner may review. An Admin cannot review their own proposal.
- Owner may make and finally approve their own report decision after action-specific step-up.
- Reviewer must complete session-bound, single-use, five-minute step-up for proposal review.
- Review re-locks the proposal and report, rechecks the report state and publication safety, then updates the report, approval and audit events in one database transaction.
- Rejected proposals do not change the report. Direct high-risk report status endpoint is blocked and points to the proposal workflow.
- Notifications are attempted only after successful decision commit.

## Operational scope still pending
Maker/checker is not yet generalized to privacy requests, claim/evidence decisions, disputes/appeals, Agent/organisation approval, finance/reconciliation, communications publication, access grants, or Trust & Safety incident closure. Step-up coverage for these actions remains incomplete. Additional queue/detail coverage and field-level authorization require endpoint-by-endpoint review.

## Verification boundary
Node-native policy tests and static source guards can verify policy shape, not runtime database correctness. Migration 0014 is not applied. TypeScript/build/Vitest, PostgreSQL integration, route authorization tests, concurrency/replay tests against PostgreSQL, browser/mobile/accessibility and independent security review remain required. No production data, provider calls, payouts, deployment or item releases were used.


## Batch 28 verification summary
- 63/63 Node-native policy tests passed (role normalization, capability policy, queue parsing, audit query, step-up and maker/checker policy).
- Stage 11 static guards passed for overview, audit explorer, queue policy, support ownership, bulk start-review, step-up, two-role authority and maker/checker source shape.
- Traceability and evidence matrix validators passed for 166 requirement IDs/rows; 15 migration entries are ordered.
- Full TypeScript check could not complete because dependency installation timed out and `@types/node` / `vite/client` are unavailable. A parser-oriented TypeScript invocation reported missing dependency/type declarations; it did not report syntax diagnostics in the changed TypeScript files, but this is not a substitute for the full typecheck.
- No PostgreSQL migration or runtime integration, no browser/mobile/accessibility testing, and no independent security acceptance were performed.

## Batch 29 — Two-role consistency and privileged role provisioning
- Corrected the Finance assessment detail endpoint to use canonical Admin/Owner authority rather than checking the retired `finance` role label directly.
- Reduced demo role selection to the six actual application roles: Claimant, Finder, Agent, Organisation, Admin and Super Admin (Owner). Admin demo workspace now contains finance, Trust & Safety, communications and support work as operational areas rather than separate roles; Owner demo copy states final authority.
- Hardened the operator role-grant script to support one-time Owner bootstrap only (configured email, no active Owner); routine Admin grants and revocations are performed only through the authenticated Owner workspace.
- Added pure policy tests and static guards for Owner bootstrap, Owner-controlled Admin lifecycle, canonical finance access and the six-role demo selector.
- These are source/policy controls only. No role was granted, no migration applied, and no account or production database was accessed.


## Batch 29 continuation — Owner-controlled Admin account lifecycle
- Added Owner-only exact-email account lookup for role administration; successful and unsuccessful lookups are audit logged without storing the full searched email.
- Added Owner-only Admin grant and revoke endpoints, each requiring a distinct five-minute, session-bound, single-use step-up purpose and a documented reason.
- Admin grants require a verified, active target and reject self-grant, duplicate Admin and Owner-target operations.
- Admin grant and revocation lock the target, invalidate every active session and consume remaining step-up grants in the same transaction as the role and audit change. Revocation also removes legacy delegated Admin-scope rows so they cannot restore Admin after login.
- Added Owner workspace UI for lookup, grant and revoke. The role selector offers dedicated step-up purposes.
- Routine Admin grants are no longer available through the operator CLI; only first-Owner bootstrap remains an operator operation.
- Added pure policy tests and static source guards. Database/API concurrency and browser acceptance remain pending.
