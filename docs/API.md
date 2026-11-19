# API reference — expanded clean-room implementation

All API routes are prefixed with `/api`. The browser uses an opaque, random session token in an `HttpOnly` cookie named `r4m_session`. Client JavaScript never receives the raw token. State-changing authenticated requests must include the trusted `Origin` configured by `WEB_ORIGIN`. Authenticated responses are role- and ownership-scoped where implemented; every endpoint still requires migration-backed integration tests before production use.

## Health

- `GET /health` — process/database health; requires configured database connectivity in connected mode.

## Authentication and sessions

- `POST /auth/request-code` — request an email OTP; body `{ "email": "person@example.com" }`.
- `POST /auth/verify-code` — consume a valid single-use OTP; body `{ "email": "person@example.com", "code": "123456" }`; sets the HttpOnly session cookie.
- `GET /auth/me` — current user and active roles.
- `GET /auth/sessions` — caller's sessions, including current/revocation state.
- `DELETE /auth/sessions/:sessionId` — revoke a session owned by the caller.
- `POST /auth/logout` — revoke the request's session when present and clear the cookie; trusted Origin required.

Production requires three separate secrets of at least 32 characters: `SESSION_HASH_SECRET`, `OTP_HASH_SECRET`, and `CASE_TOKEN_HASH_SECRET`. Do not reuse them. Cookies are Secure in production and SameSite=Lax. MFA, recovery controls, device/risk-based abuse detection and independent CSRF/security testing remain outstanding.

## Reports and public notices

- `GET /reports/public` — consented, reviewed public found notices only.
- `POST /reports` — authenticated; creates a private lost/found report. Uses approved category/county contract; `Other` requires a proposal and rationale. Public notice text is separate from the private description.
- `POST /reports/guest/request-code` — requests a guest-report email OTP; does not create an account.
- `POST /reports/guest/verify-code` — consumes a single-use guest OTP and returns a short-lived single-use submission proof.
- `POST /reports/guest/submit` — creates a report with no account after proof validation; stores only reporter email/verification timestamp and a hashed tracking token.
- `POST /reports/guest/access` — exchanges the tracking token supplied in the email URL fragment for a report-specific HttpOnly cookie.
- `POST /reports/guest/request-tracking-code` — requests a recovery OTP for a matching report reference and verified guest email; response does not disclose whether the pair exists.
- `POST /reports/guest/resend-tracking-link` — consumes the recovery OTP, creates and emails a replacement 30-day tracking link, then revokes previous tracking links only after successful email delivery.
- `GET /reports/guest/:reference/tracking` — returns limited report progress only; private description, evidence, reporter email and exact location are withheld.
- `PATCH /reports/guest/:reference/public-consent` — guest reporter changes/withdraws public-notice consent using the tracking cookie.
- `PATCH /reports/:id/public-consent` — authenticated report owner updates consent and the separate public-safe description; previously published/matched notices are returned to review when consent is newly enabled.
- `GET /reports/mine` — caller's reports.
- `GET /admin/reports` — Admin-only private report queue.
- `PATCH /admin/reports/:id/status` — Admin status review. Publication requires explicit consent, non-empty privacy-screened public description and (for found items) documented authorised Agent receipt.

No-account submission and tracking are implemented in source but still need database migration, email delivery, cookie/browser, privacy and abuse-control acceptance. A 47-county list is data coverage, not a claim that Agents operate in every county.

## Claims and disputes

- `POST /claims` — claimant submits a claim against an already published found report; parent/guardian/family-representative claims need separately verified authority before ownership approval.
- `GET /claims/mine` — caller's claims.
- `GET /admin/claims?status=submitted&limit=25&offset=0` — metadata-only Admin/Owner claim queue.
- `GET /admin/claims/:claimId` — separately authorised and audited Admin/Owner claim detail; returns evidence metadata, never file bytes or storage keys.
- `PATCH /claims/:id/authority-review` — Admin/Trust & Safety verifies representative authority after a separate clean-scanned authority document has been reviewed.
- `PATCH /claims/:id/review` — Admin/Trust & Safety review; transitions and evidence/authority gates are enforced.
- `POST /claims/:id/appeals` — claimant submits an appeal against a rejected claim.
- `GET /claims/appeals/mine` — caller's appeal history.
- `GET /claims/appeals/queue` — Admin/Trust & Safety independent appeal queue.
- `PATCH /claims/appeals/:appealId/review` — independent reviewer starts/finalises an appeal; the original claim reviewer cannot decide it. An upheld appeal only reopens claim review.
- `POST /disputes/claims/:claimId` — open a claim dispute and apply settlement/release holds transactionally.
- `GET /disputes/mine` — caller's dispute records.
- `PATCH /disputes/:disputeId/resolve` — Trust & Safety/Admin resolution with recorded audit action; resolution does not itself authorise a physical handover.

Secure ownership evidence upload and appeal foundations exist but remain runtime-unverified. Multiple-claimant adjudication and comprehensive stolen-property/legal-hold workflows remain incomplete.

## Agents, assignments and custody

- `GET /agents/directory` — public directory of active Agents with approved service contact data.
- `POST /agents/applications` — claimant/Finder submits an Agent application.
- `GET /agents/me` — caller's application information.
- `GET /agents/work-queue` — assigned Agent's work and custody event summaries.
- `GET /agents/availability/mine` — Agent's own availability/capacity.
- `POST /agents/availability` — Agent updates availability/capacity settings.
- `GET /agents/admin` — Admin application queue.
- `GET /agents/assignments/admin` — Admin assignment queue.
- `PATCH /agents/:id/status` — Admin activation/suspension/rejection; activation requires the configured prerequisites.
- `PATCH /agents/:id/service-phone` — Admin updates verified service-phone information.
- `PATCH /agents/:id/training/:moduleCode/verify` — Admin records verification for a training module.
- `POST /agents/assignments` — Admin manually assigns a found report to an eligible same-county Agent with available capacity; report/Agent rows are locked in a transaction.
- `POST /agents/assignments/:assignmentId/dropoff-code` — Admin requests one-time Finder drop-off code delivery to the verified Finder email. Raw code is not stored; hash, 24-hour expiry and five-attempt limit apply.
- `PATCH /agents/assignments/:assignmentId/cancel` — Admin cancels an assignment before custody; capacity is reconciled in the workflow.
- `POST /agents/custody-events` — Agent records `received` only after drop-off code verification (code consumption and custody write share a transaction), then `inspection_completed`. `handover_ready` and `released` remain blocked until all separate payment, claimant identity, collection and dual-confirmation gates are genuinely implemented.

There is no automatic assignment engine or full re-assignment/repair worker yet. Do not infer all-county Agent coverage from the county catalogue.

## Private matching

- `POST /matching/reports/:reportId/evaluate` — Admin/Trust & Safety runs explainable candidate evaluation.
- `GET /matching/reports/:reportId/candidates` — Admin/Trust & Safety views candidates for the authorised report.
- `PATCH /matching/candidates/:candidateId/review` — Admin/Trust & Safety records human candidate review.

A match score is a triage hint, never proof of ownership or a decision to release an item.

## Organisations

- `POST /organisations` — create an organisation onboarding record.
- `GET /organisations/mine` — caller's organisations/memberships.
- `POST /organisations/:organisationId/invitations` — authorised organisation member issues a hashed, seven-day email-bound invitation.
- `POST /organisations/accept-invitation` — accept using the verified invited email.
- `GET /organisations/:organisationId/members` — permission-scoped member list.
- `GET /organisations/:organisationId/reports` — tenant-scoped reports.
- `POST /organisations/:organisationId/reports` — create organisation report under membership permission.
- `PATCH /organisations/:organisationId/members/:memberId` — authorised membership permission change.
- `DELETE /organisations/:organisationId/members/:memberId` — remove a member, protecting the last organisation administrator.
- `GET /organisations/:organisationId/invitations` — organisation invitation list.
- `DELETE /organisations/:organisationId/invitations/:invitationId` — revoke an invitation.
- `PATCH /organisations/:organisationId/status` — Admin organisation status review.

Cross-tenant negative tests, formal organisation document verification and complete staff lifecycle acceptance are still required.

## Pricing and payment assessment

- `GET /pricing/categories` — built-in/approved category list.
- `POST /pricing/categories/seed-builtins` — Admin idempotently seeds the approved 11 categories.
- `POST /pricing/category-proposals` — user/Agent proposes a category through `Other`.
- `GET /pricing/category-proposals` — Admin proposal queue.
- `PATCH /pricing/category-proposals/:proposalId` — Admin reviews a proposal.
- `POST /pricing/schedules` — Admin drafts a versioned KES price schedule.
- `POST /pricing/schedules/:scheduleId/rules` — Admin adds a category rule.
- `PATCH /pricing/schedules/:scheduleId/approve` — separate Admin/Owner approves a schedule; creator cannot approve own schedule.
- `GET /pricing/active-schedule` — published active schedule.
- `GET /finance/readiness` — Finance/Admin/Owner read-only readiness blockers.
- `GET /finance/settlements` — read-only settlement view; does not initiate payout.
- `POST /finance/assessments` — Finance/Admin drafts an itemised assessment after claim approval and schedule validation.
- `GET /finance/assessments` — Finance/Admin/Owner assessments view.
- `GET /finance/claims/:claimId/assessment` — claim-side assessment view, subject to ownership/permission checks.
- `POST /finance/assessments/:assessmentId/confirm` — claimant confirms the quoted assessment; this is not payment.
- `POST /finance/collection-intents` — deliberately locked (HTTP 423; no provider call).
- `POST /finance/payout-requests` — deliberately locked (HTTP 423; no provider call).
- `POST /finance/refund-requests` — deliberately locked (HTTP 423; no provider call).

No IntaSend STK, callback/webhook, ledger journal posting, payout execution, refund execution or provider reconciliation is enabled. The 33% Finder / 25% Agent / 42% Return4me split and 48-hour eligibility helpers are policy only; they do not represent transferred funds. No real money should be used.

## Communications and notifications

- `GET /communications/templates` — approved communications roles.
- `POST /communications/templates` — Communications Writer draft.
- `POST /communications/campaigns` — create campaign draft.
- `POST /communications/campaigns/:campaignId/submit` — submit for separate approval.
- `PATCH /communications/campaigns/:campaignId/approve` — Communications Approver; cannot approve own campaign.
- `GET /communications/publishing-queue` — Communications Publisher queue.
- `POST /communications/publications/:publicationId/publish` — deliberately locked until provider credentials, privacy safeguards, retry/idempotency and channel acceptance are verified.
- `GET /notifications` — caller's notification list.
- `PATCH /notifications/:id/read` — mark own notification as read.

Actual Resend campaign dispatch and Facebook/Telegram publishing are not enabled. OTP development logging is restricted to local non-production mode.

## Support and security incidents

- `POST /support/tickets` — create support request.
- `GET /support/mine` — caller's tickets.
- `GET /support/queue` — Support/Admin queue.
- `GET /support/tickets/:ticketId/messages` — caller/authorised support reads ticket messages.
- `POST /support/tickets/:ticketId/messages` — add customer/staff message; internal notes are restricted.
- `PATCH /support/tickets/:ticketId/status` — Support/Admin changes ticket state.
- `POST /security-incidents` — authenticated user reports a security/privacy concern.
- `GET /security-incidents/mine` — caller's own incident status, without internal resolution notes.
- `GET /security-incidents/queue` — restricted Trust & Safety/Admin incident queue.
- `PATCH /security-incidents/:incidentId` — restricted triage and documented resolution with audit event.

## Explicit non-capabilities

There is no public anonymous submission/tracking API, secure file upload/download API, malware-scanning pipeline, claimant collection code, final handover/release, payment provider callback endpoint, payout/refund execution, automated 48-hour scheduler, automatic assignment scheduler, external marketing publish or production deployment endpoint. Database schema entries for these planned domains are not evidence that the workflow is live.

## Claim evidence and private documents

- `POST /claims/:claimId/evidence` — claimant-only; multipart form fields `evidenceType` and one `file`. Accepts genuine PDF, JPEG, PNG or WebP files up to 10 MB. File type is detected from bytes, not the supplied MIME header.
- `GET /claims/:claimId/evidence` — claimant, Admin or Trust & Safety; returns evidence metadata, not storage keys.
- `GET /documents/:documentId/content?variant=preview|original` — claimant owner, Admin or Trust & Safety; private content is streamed only after access and scan checks. Images may use a metadata-stripped WebP preview; original evidence is preserved privately.
- `GET /admin/evidence` — Admin/Trust & Safety queue of clean-scanned evidence files awaiting human review.
- `PATCH /claims/:claimId/evidence/:evidenceId/review` — Admin/Trust & Safety marks a clean file verified, rejected or expired with an auditable note.

Uploads are held in memory only until accepted. The server detects allowed content signatures, scans bytes using a private ClamAV `clamd` INSTREAM endpoint, writes the original into private local development storage or a private S3 bucket, and creates a metadata-stripped WebP derivative for images. A missing scanner, scanner timeout, malware detection or unavailable private storage fails closed. The original filename is sanitised. No file is placed under the static web root. Production startup requires HTTPS URLs, Resend, ClamAV and S3 storage; the S3 bucket must independently enforce Block Public Access, encryption and least-privilege access. Do not configure public object ACLs.

A claim can be decided from private written evidence if appropriate, but if any uploaded evidence exists, every attached file must have a completed review state and none may remain pending before approval. Only verified files count as verified evidence. The implementation still needs malware-evasion testing, scanner health monitoring, file-retention/deletion policy, encrypted backups, storage-provider acceptance and an independent security review.


## Batch 5 Agent and custody operations

The additional endpoints are mounted under `/api/agent-operations`. See `docs/BATCH5_IMPLEMENTATION.md` for the complete method/path inventory, role requirements, validation and gate behavior. All state-changing requests require the existing authenticated session and trusted Origin check.

- Training is scored server-side; clients cannot submit a score. Each module requires 80% and expires after 12 months.
- Agreement drafts are not accepted until an Owner records separate legal approval. Acceptance binds typed full name and the agreement SHA-256.
- Appointment requests must fit within a published Agent availability window; overlapping requested/confirmed appointments are rejected by database controls.
- Claimant collection codes are never returned in API responses. The verified claimant receives the code through the configured private email path; local development logs are explicitly marked `DEV ONLY`.
- The custody `released` event remains locked. Agent readiness and claimant confirmation are records only, not authority to release an item.
