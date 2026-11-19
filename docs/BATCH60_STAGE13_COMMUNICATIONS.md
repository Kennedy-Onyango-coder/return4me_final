# Batch 60 — Stage 13 communications and notification governance

**Baseline archive:** Batch 58 (`Return4me_Batch58_Unresolved_Collection_Queue_2026-11-16.zip`)  
**Implementation date:** 17 November 2026  
**Source status:** IMPLEMENTED_PARTIAL / UNVERIFIED  
**Application tests:** DEFERRED by user until all stages are implemented  
**Database migration:** `0018_stage13_communications_governance.sql` — prepared, NOT applied  
**External channels:** email transactional delivery remains existing functionality; campaign email/social publication remains disabled; SMS and WhatsApp remain disabled.

## Baseline reconciliation

The latest accessible source archive was Batch 58. A Batch 59 finance working copy and ZIP were described in earlier chat responses, but neither the claimed working directory nor a Batch 59 archive was present in the available project files when Batch 60 work began. Batch 59 therefore remains **unverified and not included** in this archive. No Batch 59 completion is inferred. The next finance batch must be reconciled before later migration numbering or Stage 12 closure.

## Implemented in Batch 60

### 1. Transactional email presentation

- Central branded, mobile-safe email shell added for OTP, organisation invitation, Finder drop-off, guest tracking, guest report status and claimant collection-code messages.
- Source template version `2026-11-v1` and per-template codes are included in the footer.
- Dynamic HTML values are escaped.
- Action URLs are restricted to HTTPS, with localhost HTTP allowed for development only.
- OTP, drop-off and collection codes may appear in development logs only when provider configuration is absent and `NODE_ENV` is not production. Production continues to fail closed when email configuration is missing.

### 2. In-app notification governance

- Notification outbox now records category and priority; security and financial categories are forced to critical priority.
- Worker processes critical and high-priority messages ahead of normal messages.
- Optional idempotency keys suppress duplicate outbox enqueue attempts; stable keys were added to report, claim, assignment, handover, dispute, refund, payout, assessment and payment-confirmation notifications.
- Notification links are constrained to safe internal paths; absolute, protocol-relative and control-character links are discarded.
- Notification history is returned grouped by date; the workspace displays date groups and critical markers.
- Preferences expose only optional community updates. The outbox suppresses `community` category notices when the user has disabled them; critical account, security, claim and financial in-app notifications are not preference-controlled.

### 3. Consent and preference records

- New `notification_preferences` table stores optional community in-app/email choices; SMS remains disabled.
- New `communication_consents` table stores append-only grant/revoke history, channel, purpose, policy version, consent-text SHA-256, source and timestamps.
- Explicit email consent is required before optional community emails can be enabled.
- Consent withdrawal immediately disables the optional email preference.
- Consent and preference records are included in the user's personal-data export.

### 4. Communications maker/checker and publisher separation

- `communications_governance` holds one designated active Admin Communications Approver and one separate designated active Admin Publisher.
- Only the Owner can assign these designations; each assignment requires its own step-up purpose, a reason and an audit event.
- The same Admin cannot be both Approver and Publisher.
- Campaign and template creators cannot approve their own work, including when the creator is Owner.
- Campaign/template approval requires step-up and an audit event. Owner may make a final decision for another user's content.
- Scheduling requires the designated Publisher, a future schedule time and step-up; the scheduler must differ from creator and approver.
- Publishing requires the designated Publisher and separation from creator/approver. The endpoint remains deliberately locked and records a blocked attempt; it never calls a provider.

### 5. Campaign lifecycle and public-content safeguards

- Added campaign list and workspace UI for draft creation, submission, approval, scheduling and withdrawal/correction.
- Added versioned template draft submission and approval.
- Withdrawal is step-up protected and auditable. If a record was previously published, the state becomes `takedown_pending`; external takedown remains a separately authorised manual process.
- Public-content screening now detects email addresses, Kenyan phone numbers, labelled identity/account numbers, IMEI/serial values, OTP/pickup codes, private case references, GPS coordinates and labelled precise custody/home addresses.
- A `found_notice` campaign must reference a published found report with reporter consent and an `handover_ready` custody event. These conditions and content screening are rechecked at submission, approval, scheduling and the locked publish boundary.
- Existing lost-report public listing continues to depend on reporter consent.

### 6. Resend delivery-event observability

- Added a signed Resend/Svix webhook receiver for sent, delivered, delayed, bounced, complained, opened, clicked and failed events.
- Signature validation uses the raw request body, a five-minute timestamp tolerance and constant-time comparison.
- Provider event IDs are deduplicated.
- Recipient and message identifiers are stored only as keyed hashes; raw recipients and message IDs are not stored in the event table.
- Admin/Owner delivery health endpoint reports aggregate counts only and explicitly states that provider ingestion is incomplete unless the webhook is configured.
- `RESEND_WEBHOOK_SECRET` added to `.env.example` and the release configuration gate; it is not configured in this archive.

## New endpoints

- `GET /api/communications/governance`
- `PUT /api/communications/governance/approver` (Owner + step-up)
- `PUT /api/communications/governance/publisher` (Owner + step-up)
- `GET /api/communications/campaigns`
- `POST /api/communications/templates/:templateId/submit`
- `PATCH /api/communications/templates/:templateId/approve` (step-up)
- `POST /api/communications/campaigns/:campaignId/schedule` (designated Publisher + step-up)
- `POST /api/communications/campaigns/:campaignId/withdraw` (step-up)
- `GET /api/communications/delivery-health`
- `GET /api/communications/consents/me`
- `POST /api/communications/consents`
- `GET /api/notifications/preferences`
- `PATCH /api/notifications/preferences`
- `POST /api/webhooks/resend` (signed provider webhook; inactive until secret configured)

Existing campaign/template creation, submission, approval, publication queue and publish routes were tightened.

## Migration 0018

Adds notification categories/priorities/dedupe key, optional notification preferences, communication consent history, one-row communications governance, hashed provider delivery events, report linkage for found notices, and campaign/publication withdrawal/publisher audit fields. The Drizzle migration journal was extended to index 18. The migration has **not** been applied and no database test was run.

## Explicitly not completed / blocked

- Batch 59 finance source changes were not present in the actual baseline and are not included.
- Resend SPF, DKIM, DMARC, sender-domain and production deliverability verification remain deployment tasks.
- Resend webhook secret is not configured; no webhook was invoked.
- No transactional email outbox or durable retry worker exists for outbound email; the current email functions still use the existing direct Resend integration.
- No bounce/complaint suppression list or automatic recipient suppression is connected to outbound campaigns.
- Facebook and Telegram credentials/ownership/permissions are not configured; social publication is disabled.
- SMS is not a launch dependency; WhatsApp is not integrated.
- Campaign approval and publisher separation are source-enforced but not runtime-tested.
- External publishing and takedown are intentionally disabled/manual.
- OTP completion analytics, channel outage alerting, full moderation/correction review and provider service-level reporting remain incomplete.
- Existing notification enqueue is best-effort after the primary business transaction commits; a failure before durable enqueue is not replayable from the original transaction.
- The consent UI is in the authenticated workspace; additional accessibility and mobile browser acceptance remains pending.

## Verification policy

No application tests, typecheck, build, PostgreSQL integration tests, browser tests or accessibility tests were run in Batch 60, per the user's instruction to defer all application testing until implementation across all stages is complete. The ZIP integrity check is a packaging check only, not application acceptance.

No migration was applied, no provider was contacted, no message was sent or posted by this work, no deployment occurred and no external publication was made.
