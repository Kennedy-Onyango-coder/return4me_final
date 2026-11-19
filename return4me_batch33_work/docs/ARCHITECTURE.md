# Return4me architecture

## Target modules

1. Identity and access management
2. Lost/found reporting
3. Matching and claims
4. Agent operations and custody
5. Organisations and memberships
6. Pricing and assessments
7. Payment collection, ledger, settlements and payouts
8. Refunds, reversals and reconciliation
9. Notifications and communications publishing
10. Documents and evidence
11. Trust, safety and investigations
12. Administration, analytics and governance
13. Platform configuration and operations

## Trust boundaries

- Browser clients are untrusted; all permissions are enforced by the server.
- Express API is the application policy enforcement boundary.
- PostgreSQL is the authoritative transactional store.
- Resend, IntaSend and object-storage providers are external trust boundaries.
- Sensitive evidence must be stored privately; public derivatives are separately generated and access-controlled.

## Financial invariants

- A payment is never confirmed from a browser redirect.
- Provider callbacks must be authenticated, replay-protected and idempotent.
- An unknown payment outcome stays unknown/pending; never ask the payer to pay again merely because a request timed out.
- Settlement eligibility follows verified recovery/handover and the approved 48-hour period, subject to dispute/legal holds.
- Settlement approval and payout initiation are distinct. Payout initiation remains manual and authorised.
- Target split: Finder 33%, Agent 25%, Return4me 42%. Historical allocations require immutable snapshots and a separately authorised migration.
- Provider disbursement fees are platform expenses.

## Workflow invariants

- Matching is not proof of ownership.
- Ownership is verified by an authorised process.
- Only authorised agents physically hold items.
- Finder and claimant do not arrange private direct handovers.
- Public listings require explicit consent and privacy review.
- Found-item public listings require documented authorised custody.
- Uploaded evidence is not automatically verified.

## Data access

- Every user reads their own account records by default.
- Agent records are scoped to active assignments and approved agent account.
- Organisation access must be tenant-scoped through active membership and granular permission.
- Administrative and financial actions require explicit server-side roles and auditable actor attribution.
- Super Admin (Owner) is the final authority across privileged platform operations and approvals. Access to restricted records remains authenticated, purpose-controlled and audit-logged; Owner authority is not an audit bypass.
- Exactly two privileged administrative roles are exposed to the application: Admin and Owner. Legacy delegated scopes are consolidated into Admin.
