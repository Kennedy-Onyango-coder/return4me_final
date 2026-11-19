# Implementation phases

| Batch | Work | Dependency / acceptance gate |
|---|---|---|
| 1 | New foundation: app shell, database schema, email OTP, reports, initial claims, agent/admin foundations | Install, migration, typecheck, build, API tests; this ZIP |
| 2 | Requirements traceability expansion; claim lifecycle, ownership evidence, private matching and disputes | Claim and privacy acceptance tests |
| 3 | Agent KYC, training, capacity, assignment rules, custody codes, collection and release | Full custody chain and permission tests |
| 4 | Organisation onboarding, memberships, invitations and tenant isolation | Cross-tenant isolation tests |
| 5 | Pricing, assessment, IntaSend, callbacks, ledger, allocations, settlement, payouts, refunds and reconciliation | Provider signature/idempotency proofs; no production money without separate authorisation |
| 6 | Resend templates, in-app delivery lifecycle, communications approval, Facebook and Telegram | Delivery/retry/privacy acceptance tests |
| 7 | Object storage, WebP processing, malware scanning, evidence viewer, document verification and retention | File-content, malware, access and lifecycle tests |
| 8 | Complete design system, Admin/Owner dashboards, role-specific workspaces, analytics and support | Responsive, WCAG 2.2 AA and role acceptance audit |
| 9 | Security hardening, monitoring, disaster recovery, legal review, production readiness and rollout | Independent security/legal review and operational drills |

Each phase requires a traceability update, tests and an acceptance report. Do not skip blocked prerequisites. A schema table is not evidence that its business workflow is complete.
