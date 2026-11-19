Return4me Batch 60 — Stage 13 Communications and Notification Governance
Baseline: Batch 58 complete source archive.
Date: 17 November 2026.

This archive adds central branded/versioned transactional email templates, notification categories/priorities and deduplication, grouped notification history, optional community-update preferences, explicit email consent history, one designated Communications Approver, one separate designated Communications Publisher, campaign/template review and scheduling/withdrawal workflows, public-content screening, found-notice reporter-consent/custody checks, and signed Resend delivery-event ingestion.

Migration: 0018_stage13_communications_governance.sql — prepared, NOT applied.
External campaign publication: DISABLED.
SMS / WhatsApp: NOT ENABLED.
Resend webhook: code prepared; RESEND_WEBHOOK_SECRET not configured.
Application tests: NOT RUN by user instruction until all implementation stages are complete.

Important baseline reconciliation: Batch 59 finance source/ZIP was described in earlier chat responses but was not present in the accessible Batch 58 baseline. Batch 59 is not included or claimed complete; Stage 12 remains open and must be reconciled.

No production migration, provider call, message dispatch, external publication, deployment, money movement, item release, commit or push was performed.

Historical note: this Batch 60 README records the source baseline at the time Batch 60 was prepared. The current combined Batch 59–60 archive reconstructs the missing Stage 12 work with migration 0019; see README_BATCH59_60.txt and docs/BATCH59_STAGE12_FINANCE_LIFECYCLE.md.
