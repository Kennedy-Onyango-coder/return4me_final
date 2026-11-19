# Return4me Master Requirements Contract — Stages 1–17

This is the controlling checklist derived from the product approvals and delegated decisions in the discovery conversation. It is intentionally separate from code status. **Approval does not mean implementation.** Status remains `NOT_STARTED`, `PARTIAL`, `IMPLEMENTED_UNVERIFIED`, `VERIFIED_COMPLETE` or `BLOCKED` until evidence is recorded in `IMPLEMENTATION_REGISTER.md`.

## A. Product foundations, service model and user journeys (Stages 1–10)

| ID | Approved requirement | Initial status |
|---|---|---|
| PROD-001 | Operate as a Kenya-focused lost-and-found coordination platform under Elligrace Technologies Limited. | PARTIAL |
| PROD-002 | Communicate that recovery is coordinated but not guaranteed. | PARTIAL |
| PROD-003 | Support all 47 Kenyan counties while distinguishing platform coverage from actual authorised-agent availability. | PARTIAL |
| PROD-004 | Serve individuals, families, students, schools, transport/boda operators, businesses, hotels, hospitals, community groups and approved partners. | NOT_STARTED |
| PROD-005 | Basic organisation registration/reporting is free at launch; advanced services are a later approved offering. | NOT_STARTED |
| USER-001 | One individual account may hold multiple separately granted roles. | PARTIAL |
| USER-002 | Claimants, Finders, Agents, Organisations, Administrators and Owner have role-specific workspaces. | PARTIAL |
| USER-003 | Organisation staff use individual accounts, invitations and granular organisation permissions; no shared credentials. | NOT_STARTED |
| USER-004 | Admin and Owner accounts are provisioned; users cannot self-grant privileged roles. | PARTIAL |
| REPORT-001 | Lost and found reports are separate workflows with appropriate conditional fields. | PARTIAL |
| REPORT-002 | Email verification is required before a report is submitted. | PARTIAL |
| REPORT-003 | Support secure tracking/report references for account and eligible no-account journeys where separately implemented. | NOT_STARTED |
| REPORT-004 | Support reporting on behalf of a child, family member or organisation while recording reporter and actual owner separately. | NOT_STARTED |
| REPORT-005 | Guardian workflow must apply for children; do not expose children's personal data publicly. | NOT_STARTED |
| MATCH-001 | Lost/found matching is private; public searching must not expose private matching or evidence data. | NOT_STARTED |
| MATCH-002 | Matching precedence is exact approved item rule, subcategory, category, then authorised manual review. | NOT_STARTED |
| MATCH-003 | OCR/document analysis may assist extraction but never proves ownership or automatically determines fraud. | NOT_STARTED |
| CLAIM-001 | Claims require ownership information/evidence and authorised review. | PARTIAL |
| CLAIM-002 | Matching is not ownership proof; a human-authorised process makes ownership decisions. | NOT_STARTED |
| CLAIM-003 | Disputes and credible legal/stolen-property concerns pause affected release and settlement. | PARTIAL |
| CONTACT-001 | No private Finder–claimant contact or privately arranged meetings. | NOT_STARTED |
| CONTACT-002 | Finder may coordinate drop-off with assigned Agent using the Agent's verified official service number only. | NOT_STARTED |
| CUST-001 | Only authorised Agents physically receive and hold found items. | PARTIAL |
| CUST-002 | Finder receives controlled drop-off instructions/code and takes the item to the assigned Agent. | NOT_STARTED |
| CUST-003 | Agent inspects, accepts and records custody with an auditable event trail. | PARTIAL |
| CUST-004 | Claimant collection occurs at an approved Agent service location after verification and authorisation. | NOT_STARTED |
| CUST-005 | Handover requires claimant identity/authority checks and Agent confirmation; successful recovery is separately recorded. | NOT_STARTED |
| AGENT-001 | Agent applications capture identity, business, service location, capacity and required documents. | PARTIAL |
| AGENT-002 | Agent approval is manual and follows onboarding, training, assessment and agreement. | PARTIAL |
| AGENT-003 | Public directory includes only active verified Agents and their approved service information. | NOT_STARTED |
| AGENT-004 | Assignment considers eligibility, location/county, capacity and operational availability. | PARTIAL |
| AGENT-005 | Agent workspace covers assignments, custody, collections, earnings, availability, performance, training, incidents, documents and support. | PARTIAL |
| ORG-001 | Organisation records and staff access are isolated by organisation and active membership. | NOT_STARTED |
| ORG-002 | Organisation workspace supports reports, claims/cases, members, activity and settings according to permission. | NOT_STARTED |
| TRUST-001 | Police OB is optional/private and is not ownership proof. | NOT_STARTED |
| TRUST-002 | Formal police/public-institution partnerships require separate agreement and authorisation. | NOT_STARTED |
| TRUST-003 | Public found notices are privacy screened and only published after authorised custody; lost notices require reporter consent. | PARTIAL |
| TRUST-004 | No scraping or harvesting of external lost/found listings. | NOT_STARTED |
| TRUST-005 | Apply rate limits and abuse protections to public reporting, matching, login and claim workflows. | PARTIAL |

## B. Financial architecture and operating policy (Stage 12)

| ID | Approved requirement | Initial status |
|---|---|---|
| FIN-001 | Keep claimant recovery-service charges separate from Finder/Agent/Platform reward allocation and refund/reversal flows. | PARTIAL |
| FIN-002 | Use IntaSend M-Pesa STK for approved collection flows; provider evidence is authoritative. | NOT_STARTED |
| FIN-003 | Maintain a central financial ledger with gross, allocations, provider fees, refunds, reversals, liabilities and revenue kept distinct. | PARTIAL |
| FIN-004 | Target allocation is Finder 33%, Agent 25%, Return4me 42%; percentages total 100%. | PARTIAL |
| FIN-005 | Preserve historical allocation snapshots; do not silently rewrite historic rows to the new target. | PARTIAL |
| FIN-006 | Any historical allocation migration requires a separately authorised, reviewed migration. | BLOCKED |
| FIN-007 | Automatic settlement approval only after the existing 48-hour `settle_at` eligibility time and all other gates pass. | PARTIAL |
| FIN-008 | Settlement approval and payout initiation are distinct; payout initiation remains manual and admin-authorised. | PARTIAL |
| FIN-009 | A dispute or legal hold pauses the affected settlement. | PARTIAL |
| FIN-010 | IntaSend disbursement fees are a Platform expense. | PARTIAL |
| FIN-011 | Claimant is not a settlement beneficiary; actual Finder and assigned Agent must be correctly identified. | NOT_STARTED |
| FIN-012 | Eligibility requires verified ownership, provider-confirmed required payment, documented recovery/handover, elapsed 48 hours and no hold. | NOT_STARTED |
| FIN-013 | Payout preflight checks beneficiary/destination verification, available funds, duplicate prevention and approved allocation snapshot. | NOT_STARTED |
| FIN-014 | Provider acceptance is not payout success; only verified provider outcome may mark paid. | NOT_STARTED |
| FIN-015 | Do not permit manual success overrides or force-release that bypasses workflow gates. | NOT_STARTED |
| FIN-016 | Use server-side secrets and authenticated, replay-resistant, idempotent callbacks. | NOT_STARTED |
| FIN-017 | Timeouts and ambiguous provider outcomes remain unknown/pending; never request duplicate payment solely because of a timeout. | NOT_STARTED |
| FIN-018 | Underpayment is not full payment; overpayment, duplicate and mismatch are quarantined/reconciled. | NOT_STARTED |
| FIN-019 | Refunds default to the original M-Pesa payer; alternate destination requires verified approval. | NOT_STARTED |
| FIN-020 | Unsuccessful recovery or cancellation before handover defaults to a full refund unless an explicitly approved exception applies. | NOT_STARTED |
| FIN-021 | Refunds, reversals, chargebacks and provider returns remain separately reconciled; a post-handover financial reversal does not automatically retrieve/reopen the item. | PARTIAL |
| FIN-022 | Price assessment occurs only after ownership is approved; claimant sees itemised charges and confirms before STK request. | NOT_STARTED |
| FIN-023 | Category-based KES pricing; no item-value percentage, arbitrary/hidden charges or Agent-negotiated fees. | NOT_STARTED |
| FIN-024 | Categories are admin-owned; users/Agents may propose through “Other” but only Admin may approve/create permanent categories. | PARTIAL |
| FIN-025 | Maintain effective-dated/versioned price rules and preserve the applicable historical assessment version. | NOT_STARTED |
| FIN-026 | Matching price precedence and manual review are explicit; multi-item/shared costs do not double-charge. | NOT_STARTED |
| FIN-027 | Pricing reviewed initially quarterly; hardship support does not affect case priority. | NOT_STARTED |
| FIN-028 | No public coupons, storage penalties or new pricing mechanics without separate approval. | NOT_STARTED |
| FIN-029 | KES only at launch; tax/accounting treatment requires professional review; gross collections are not automatically revenue. | NOT_STARTED |
| FIN-030 | Separate collection, disbursement and working-wallet purposes; verify provider wallet routing and liquidity without assuming capabilities. | BLOCKED |
| FIN-031 | Reconcile provider, ledger and M-Pesa evidence daily/on demand; discrepancies block close. | PARTIAL |
| FIN-032 | Distinguish cash, liabilities, revenue, expenses and provider fees; adjustments are immutable correcting entries. | NOT_STARTED |
| FIN-033 | Finance preparation and independent approval for period close; sensitive actions use separation of duties and high-risk dual approval. | PARTIAL |
| FIN-034 | Verify beneficiary destination; destination changes trigger a hold and re-verification. | PARTIAL |
| FIN-035 | Dormant balances are not forfeited; use approved complaints and escalation processes. | PARTIAL |
| FIN-036 | Receipts are issued only after confirmed payment and do not automatically claim to be tax invoices. | NOT_STARTED |
| FIN-037 | Third-party payer is allowed with claimant authorisation; payer does not acquire ownership rights. | IMPLEMENTED_UNVERIFIED |
| FIN-038 | Financial exports and reports are permission-scoped, masked and auditable. | PARTIAL |
| FIN-039 | Failed/refunded/reversed provider transactions remain linked to original transaction and evidence; no blind automatic resend. | NOT_STARTED |
| FIN-040 | Payment capability remains disabled until provider, callback, ledger, permissions, reconciliation, treasury and security gates pass. | PARTIAL |

## C. Communications and notifications (Stage 13)

| ID | Approved requirement | Initial status |
|---|---|---|
| COMM-001 | Email-first launch; email OTP is mandatory. SMS is not a launch dependency. | PARTIAL |
| COMM-002 | Reuse Resend integration; validate sender domain, SPF, DKIM, DMARC and production delivery. | PARTIAL |
| COMM-003 | Centralised, branded, mobile-safe, versioned email templates by event and role. | PARTIAL |
| COMM-004 | OTP is short-lived, single-use, attempt-limited, rate-limited and never exposed in logs outside local development. | PARTIAL |
| COMM-005 | In-app notification centre supports read/unread, history, grouping and role-scoped links. | PARTIAL |
| COMM-006 | Critical security and financial notifications cannot be silently disabled. | PARTIAL |
| COMM-007 | Reuse existing Facebook Page and Telegram integrations only after credential, ownership and permission validation. | NOT_STARTED |
| COMM-008 | WhatsApp requires separate approval before integration. | NOT_STARTED |
| COMM-009 | Communications workspace supports drafts, channel variants, approval, scheduling, publishing, withdrawal and failure states. | PARTIAL |
| COMM-010 | One Communications Approver; no self-approval; approval and publishing are separately auditable. | PARTIAL |
| COMM-011 | Writer, Approver and Publisher permissions are separated. | PARTIAL |
| COMM-012 | Public content is screened for phone numbers, IDs, claim references, private evidence and custody locations. | PARTIAL |
| COMM-013 | Lost-item public listing requires reporter consent; safe found notices follow authorised custody. | PARTIAL |
| COMM-014 | Moderation, correction, takedown, retry and duplicate-suppression workflows are auditable. | PARTIAL |
| COMM-015 | Monitor email delivery/bounce/complaint, OTP completion, in-app read status, channel publishing and outages without exposing PII/OTP. | PARTIAL |

## D. Security, privacy and fraud prevention (Stage 14)

| ID | Approved requirement | Initial status |
|---|---|---|
| SEC-001 | Secure email verification, account recovery, session controls and privileged authentication. | PARTIAL |
| SEC-002 | Central server-enforced RBAC, deny by default and least privilege. | PARTIAL |
| SEC-003 | Record-, field- and tenant-level access controls; client visibility is never security enforcement. | PARTIAL |
| SEC-004 | No self-grant of roles; immediate revocation; individual accounts; no shared credentials. | PARTIAL |
| SEC-005 | Exactly two privileged roles exist: Admin and Super Admin (Owner). The Owner is the final authority across platform operations and approvals; privileged access remains authenticated, purpose-controlled and audit-logged. | PARTIAL |
| SEC-006 | Minimise personal data; purpose limitation, transparency, consent, data rights and retention controls. | NOT_STARTED | PARTIAL |
| SEC-007 | Protect identity documents, serials/IMEI, phone numbers, exact addresses, custody locations, OB reports, M-Pesa and internal notes. | PARTIAL |
| SEC-008 | HTTPS/TLS, encryption at rest, protected backups, password hashing and separate secrets management. | PARTIAL |
| SEC-009 | Secure file validation, malware scanning, private storage and derivative access controls. | NOT_STARTED | PARTIAL |
| SEC-010 | Audit logs are protected, access-restricted, masked and retained under policy. | PARTIAL |
| SEC-011 | Fraud signals trigger risk-based human review; signals are not proof and appeals are available. | NOT_STARTED | PARTIAL |
| SEC-012 | Security incident/breach response, incident register, exercises and applicable Kenyan notifications. | NOT_STARTED | PARTIAL |
| SEC-013 | Disaster recovery includes encrypted backups, RPO/RTO, restore tests, separate credentials and evidence consistency. | NOT_STARTED |
| SEC-014 | Independent OWASP/API/auth/file/payment callback/replay/duplicate/payout/infrastructure/dependency assessment; critical/high findings retested. | NOT_STARTED |
| SEC-015 | No external testing of third parties or production money movement without explicit authorisation. | PARTIAL |
| SEC-016 | Review Kenya Data Protection Act 2019, ODPC obligations, controller/processor agreements, DPIA where required and cross-border transfers. | BLOCKED |
| SEC-017 | Review consumer, tax, payment, CBK/NPS and AML/CTF obligations with qualified professionals. | BLOCKED |

## E. Visual identity, user experience and accessibility (Stage 15)

| ID | Approved requirement | Initial status |
|---|---|---|
| UX-001 | Unified Return4me design system with role-specific layouts. | PARTIAL |
| UX-002 | Brand palette: navy `#101C32`, blue `#2563EB`, teal `#0F766E`, white `#F8FAFC`, slate `#334155`, red `#DC2626`. | PARTIAL |
| UX-003 | Light/dark themes, semantic status tokens and accessible contrast. | PARTIAL |
| UX-004 | Inter/system typography; 12px floor, body typically 14–16px, clear hierarchy and tabular financial numerals. | PARTIAL |
| UX-005 | Reusable buttons, forms, cards, tables, status, navigation, feedback, dialogs, charts and loading components. | PARTIAL |
| UX-006 | Public navigation: Home, I found something, I lost something, For organisations, Become an Agent, How it works, Sign in; Help/Contact and Pricing secondary/footer. | PARTIAL |
| UX-007 | Public homepage prioritises lost/found actions; organisation and Agent pages have dedicated destinations. | PARTIAL |
| UX-008 | Homepage order: hero, how it works, Agent recruitment, organisations, recovery/trust, coverage, FAQs, footer. | PARTIAL |
| UX-009 | Pricing is contextual and disclosed before payment; detailed Pricing page is secondary/footer. | PARTIAL |
| UX-010 | Authentic Kenyan imagery; no fabricated testimonials, partner logos, success numbers or unsupported coverage claims. | NOT_STARTED |
| UX-011 | Mobile-first responsive public and authenticated workspaces; low-cost Android and slower-network support. | PARTIAL |
| UX-012 | Mobile/tablet/desktop layouts, touch targets, table alternatives and safe form-state recovery. | PARTIAL |
| UX-013 | WCAG 2.2 AA target: contrast, keyboard, focus, screen reader, labels, alt text, non-colour status, zoom and reduced motion. | PARTIAL |
| UX-014 | Consistent hover/focus/pressed/loading/disabled states and restrained animation. | PARTIAL |
| UX-015 | Never display success until the operation actually succeeds; prevent duplicate submissions and support safe retries. | PARTIAL |
| UX-016 | Claimant dashboard: reports, claims, recovery, payments, notifications, support and profile. | PARTIAL |
| UX-017 | Finder dashboard: found reports, matching activity, earnings, payments, notifications and profile. | PARTIAL |
| UX-018 | Agent dashboard: assignments, custody, collections, earnings, availability, performance, training, incidents, documents and support. | PARTIAL |
| UX-019 | Organisation dashboard: reports, cases, members, activity and settings. | NOT_STARTED |
| UX-020 | Admin console: operations, agents, organisations, financial management, communications, trust/safety, reports, content and administration. | PARTIAL |
| UX-021 | Owner dashboard: company performance, financial oversight, governance, people/access, risk/trust, partnerships and platform oversight. | PARTIAL |
| UX-022 | Dashboard hierarchy: Needs Attention, primary activity, supporting analytics/history/settings. | PARTIAL |
| UX-023 | Role-specific, defined metrics; distinguish verified, pending, confirmed, historical and unavailable values. | PARTIAL |
| UX-024 | Tables support safe search, filters, sorting, pagination, mobile alternatives and permission-scoped actions. | PARTIAL |
| UX-025 | Bulk actions require permission, preview, confirmation and audit; never bypass approval workflow. | PARTIAL |
| UX-026 | Detail pages include overview, data, authorised people, timeline, related records, actions, protected evidence and audit history. | PARTIAL |
| UX-027 | Unified visual status language while preserving distinct domain-specific status definitions. | PARTIAL |
| UX-028 | Distinguish payment initiated, payment confirmed, settlement approved and payout successful. | PARTIAL |
| UX-029 | Notification centre, priority levels, activity history and critical-notification rules. | PARTIAL |
| UX-030 | Standard confirmations for reports, assignment, custody, claims, disputes, financial operations, permissions, publishing and suspension. | PARTIAL |
| UX-031 | Forms have clear instructions, required/optional markers, conditional validation, review and safe progress preservation. | PARTIAL |
| UX-032 | Image uploads convert supported imagery to WebP; compress and create derivatives; strip EXIF/GPS from public derivatives; preserve originals where evidentiary integrity requires. | NOT_STARTED |
| UX-033 | Document uploads have file limits, previews, safe access, upload-vs-verification states, resubmission history and retention. | NOT_STARTED |
| UX-034 | Error/empty states, retry guidance, connection-loss behavior and safe recovery are consistent. | PARTIAL |
| UX-035 | Global search is permission-aware and excludes sensitive fields from suggestions/results. | NOT_STARTED |
| UX-036 | Profiles/settings support security, roles, notification preferences and organisation/Agent context. | NOT_STARTED |
| UX-037 | Help/support offers contextual help, case references and protected communication history. | NOT_STARTED |
| UX-038 | Central design tokens/components are versioned and interface changes are governed. | PARTIAL |

## F. Technical architecture and production readiness (Stage 16)

| ID | Approved requirement | Initial status |
|---|---|---|
| TECH-001 | Retain an incremental modular architecture; avoid unnecessary framework rewrite. | PARTIAL |
| TECH-002 | Use React 19, TypeScript, Vite, Tailwind CSS v4, Express, Drizzle and PostgreSQL as the target stack. | PARTIAL |
| TECH-003 | Separate identity, reports, matching/claims, agents/custody, organisations, finance, communications, trust/safety, admin and analytics domains. | PARTIAL |
| TECH-004 | Server API contracts are validated; central error handling and safe DTOs are used. | PARTIAL |
| TECH-005 | Consequential operations use database transactions, idempotency and audit events. | PARTIAL |
| TECH-006 | Versioned/reviewed database migrations, constraints, indexes, archival and non-destructive data change procedures. | PARTIAL |
| TECH-007 | Separate development, staging and production environments with secrets isolation. | NOT_STARTED |
| TECH-008 | Health checks, monitoring, structured privacy-safe logs and alerting. | PARTIAL |
| TECH-009 | Automated tests include unit, component, API, DB, permissions, end-to-end, payments, security, accessibility, performance and recovery. | PARTIAL |
| TECH-010 | Backup/restore, RPO/RTO, incident response, rollback and operational runbooks are tested. | NOT_STARTED |
| TECH-011 | Production acceptance requires functionality, security, financial integrity, migrations, monitoring, DR, accessibility, legal review and operational readiness. | NOT_STARTED |

## G. Consolidation and governance (Stage 17)

| ID | Approved requirement | Initial status |
|---|---|---|
| GOV-001 | Produce one consolidated product and technical specification containing all approved decisions. | PARTIAL |
| GOV-002 | Maintain original approval ID, implementation evidence, test evidence and acceptance state for every requirement. | PARTIAL |
| GOV-003 | Distinguish approved policy, specified design, implemented functionality and independently verified acceptance. | PARTIAL |
| GOV-004 | Unresolved dependencies, legal issues, financial risks and blocked capabilities are visible; never silently waived. | PARTIAL |
| GOV-005 | Final build/production authorisation is a separate explicit decision from approval of product specifications. | PARTIAL |

## Rules for maintaining this contract

1. Add a row before implementing any new approved requirement not represented here.
2. Link each requirement to one or more code paths and tests in the implementation register.
3. When a feature touches multiple IDs, record all affected IDs; do not close only the headline item.
4. Mark a requirement `VERIFIED_COMPLETE` only when implementation and acceptance evidence both exist.
5. Keep legal/professional decisions and third-party credential dependencies explicitly blocked until completed.
6. Do not enable financial transactions, payouts, public evidence downloads or privileged access while their gates are incomplete.
