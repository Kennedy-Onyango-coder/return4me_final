Return4me — Batch 67D cumulative implementation update

This archive continues cumulative Batches 59–67C and adds the Batch 67D claim evidence lifecycle serialization correction.

The claim evidence review route now locks the parent claim before evidence/document rows, follows the same lock order as claim approval and upload, and rejects evidence review after the claim leaves submitted/under_review. No migration was added.

See docs/BATCH67D_CLAIM_EVIDENCE_SERIALIZATION.md and docs/ROADMAP_1_TO_67_UPDATED.md.

No tests, typecheck, build, lint, PostgreSQL, migrations, API, browser, concurrency, security, performance, accessibility or provider checks were run. All independent acceptance remains pending; production release is not authorised. No production operation, commit or push occurred.
