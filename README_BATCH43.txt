Return4me Batch 43 — Restricted Dispute and Appeal Workspaces

Start from the project directory in this archive.

This batch adds Admin/Owner-only dispute and appeal detail endpoints, metadata-only queues, audited detail reads and an Admin/Owner read-only case workspace. The new case-detail workspace is read-only. The existing appeal review workflow was hardened to use metadata-only queues and transaction-bound, purpose-specific step-up before a decision. No item release, refund, settlement or payout action is available from these case workspaces.

Case assignment was intentionally deferred: the current schema does not define a shared assignment lifecycle or safe reassignment semantics. No speculative migration was added.

See docs/BATCH43_DISPUTE_APPEAL_WORKSPACES.md, docs/IMPLEMENTATION_PROGRESS_2026-11-14.md and docs/ROADMAP_1_TO_24_UPDATED.md.

Verification status is in the Batch 43 progress report. PostgreSQL, full TypeScript dependency-backed checks, Vitest/build and independent acceptance remain distinct gates. No production operation or migration was performed.
