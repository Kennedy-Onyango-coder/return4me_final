# Batch 12 — in-app notification delivery and role workspaces

**Source status:** IMPLEMENTED_UNVERIFIED  
**In-app notifications:** durable outbox + retry worker  
**Email/SMS/social external delivery:** NOT ENABLED / ACCEPTANCE PENDING  
**Migration:** `0008_notification_outbox.sql`, `0009_category_decision_notifications.sql`

## Implemented

### Notification delivery

1. `notifySafely` now writes to a durable in-app `notification_outbox` rather than directly inserting a user notification.
2. A background worker drains the outbox using row locks and `SKIP LOCKED`, inserts notifications idempotently using `outbox_id`, and marks successful delivery.
3. Failed deliveries retry with bounded exponential backoff; after eight attempts they move to `dead`. Error records contain controlled codes, not message bodies or secrets.
4. Primary decisions remain committed if a later notification enqueue/delivery fails. Existing decision routes call the notification service after their decision transaction commits.
5. Claim, report, agent assignment, dispute, assessment, payment confirmation, refund, payout-destination, payout and category-proposal events use in-app notifications. Category proposal decisions include a controlled reason and permitted note, and go only to the proposing user.
6. Users can list their notifications, read their unread count, mark one read or mark all read. The workspace exposes unread count and read controls.
7. No email, SMS or social notification is sent by this outbox. External channel delivery requires separate consent, credentials, template review, bounce/complaint handling and acceptance.

### Claimant payment workspace

- Displays the itemised recovery-service assessment and claimant confirmation state.
- Shows the 24-hour payment window only after the Agent inspection gate.
- Allows a claimant to request an M-Pesa prompt only within the active window and when the sandbox collection gate is enabled.
- Shows masked payer number and provider state; claimant can request an authoritative status refresh.
- Unknown initiation without a provider invoice reference is not presented as retryable; the UI instructs the claimant not to request another prompt.
- Displays the payment-confirmation receipt only after provider-confirmed payment. The receipt is explicitly not a tax invoice.

### Agent workspace

- Work-queue API exposes only claim ID/status and boolean claimant-confirmation/payment-confirmation gates, not claimant identity or private evidence.
- Agent can record final release only after both payment and claimant confirmation are visible; the server rechecks the appointment, identity/authority, handover and dispute gates.
- Completed handovers are displayed as complete; no further release action is offered.
- Agent workspace includes the encrypted M-Pesa payout-destination submission panel.

### Finance/Admin workspace

- Adds a controlled finance panel for payment sessions, reward funding, settlements, refund requests, payout destinations, payout requests and collection reconciliation exceptions.
- Admin-only actions are hidden/disabled for Finance-only and Owner-only roles where the API requires Admin. Finance-only users cannot approve their own actions.
- Finder/Agent can submit and view their own masked payout destination; only Admin can verify it.
- Live provider execution remains disabled and sandbox execution buttons remain disabled unless all corresponding configuration flags pass.

## New or expanded routes

- `GET /api/notifications/unread-count`
- `PATCH /api/notifications/:id/read`
- `PATCH /api/notifications/read-all`
- `GET /api/collections/assessments/:assessmentId/payment-sessions/latest`
- `GET /api/finance/payment-transactions`
- `GET /api/finance/eligible-claims`
- Existing Finance/Agent routes are now surfaced through role-aware workspace panels.

## Remaining / blocked

- Transactional enqueue is best-effort after the business transaction commits. Once persisted, outbox delivery is retried; an enqueue failure itself is logged but cannot be replayed from the primary transaction. A future full transactional-outbox refactor is required for guaranteed enqueue atomicity.
- No external email/SMS/social notification is enabled. SMTP/Resend, bounce/complaint, user consent/preferences, provider idempotency and delivery-event acceptance remain pending.
- Admin/Finance workspace UI does not yet expose every reconciliation/export/reporting function or every post-handover reversal workflow.
- No browser/E2E, accessibility, API or database acceptance has been run.

## Acceptance still required

- Apply migrations 0008 and 0009 to disposable PostgreSQL and test outbox concurrency, duplicate suppression, retry schedule, dead-letter behaviour and read isolation.
- Run full typecheck/build/Vitest, claimant payment flow, Agent final release, Finance/Admin maker-checker flows and browser accessibility checks.
- Validate all role gates server-side; UI visibility is not an authorization boundary.
- External email/SMS/social channels remain disabled until independently approved and tested.
