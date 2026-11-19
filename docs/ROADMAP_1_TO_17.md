# Return4me implementation roadmap — Stages 1–17

**Project:** clean-room rebuild for Elligrace Technologies Limited  
**Current source archive:** Batches 1–49 consolidated (16 November 2026). Stage 11 governance and Stage 12 Finance reconciliation and restricted workspaces have been expanded through Batch 49; Stages 1–17 remain subject to requirement-level acceptance.  
**Status vocabulary:** `NOT_STARTED`, `PARTIAL`, `IMPLEMENTED_UNVERIFIED`, `VERIFIED_COMPLETE`, `BLOCKED`.

This roadmap keeps the complete approved scope visible. It is not a claim that all seventeen stages are production-complete. Source implementation, successful build, runtime acceptance, independent review and production authorisation are separate gates. No stage is marked `VERIFIED_COMPLETE`. Batch 49 adds audited Finance control totals and fail-closed period-close preparation; the full non-PostgreSQL verify:all suite passed with 92/92 Node-native tests across 15 suites, but full dependency-backed typecheck, Vitest/build, PostgreSQL/API concurrency, browser/device/accessibility and independent acceptance remain outstanding.

## Stage-level status

| Stage | Approved scope | Status | Implemented in source | Still required before stage acceptance |
|---|---|---|---|---|
| 1 | Product mission, Kenya service model, audiences, counties and recovery principles | PARTIAL | Public proposition, 47-county list, separate lost/found entry points, no-account reporting after email verification, secure email tracking, self/guardian/family-representative reporter distinction, service-not-guaranteed language | Real authorised-agent coverage source, final service content and service-area acceptance |
| 2 | Identity, email verification, accounts, roles and sessions | PARTIAL | Email OTP request/verify, HMAC OTP hash, expiry/attempt controls, opaque random DB-backed session, HttpOnly cookie, role reload per request, session listing/revocation, trusted-Origin check on unsafe requests | Full MFA and recovery; broader account/device abuse protection; CSRF/security test suite; all role/action/object/field permission tests; mail provider acceptance |
| 3 | Lost/found reports, reporter/owner distinction, privacy and public notices | PARTIAL | Private-by-default report model, separate safe public description and explicit consent, county/category validation, authenticated and guest submissions, no-account email OTP, single-use verification proof, 30-day HMAC-hashed tracking token exchanged for path-scoped HttpOnly cookie, limited tracking DTO, recovery OTP and replacement tracking-link reissue, guest consent withdrawal/re-review, parent/guardian/family-representative attribution and Other-category proposals | Complete consent/retention/data-rights flow, field-level leakage tests, evidence-separation tests and moderator acceptance |
| 4 | Private matching and human candidate review | IMPLEMENTED_UNVERIFIED | Explainable category/subcategory/exact-rule candidate scoring, restricted candidate endpoints, review actions; no automated ownership decision | Database migrations, access/false-positive/performance tests, manual search, match-rule governance and human reviewer acceptance |
| 5 | Claims, ownership evidence, disputes and appeals | PARTIAL | Claim submission/review with constrained state transitions; owner/parent-guardian/family-representative claimant details; owner-versus-representative approval policy; mandatory malware-cleared, independently verified ownership-support document and review of every attachment; authority document requirement and separate Admin/Trust & Safety authority verification; appeal submission and independent reviewer gate; upheld appeals reopen claims to review without auto-approval; transactional claim/dispute locking; settlement/release holds; Batch 43 adds Admin/Owner-only restricted dispute/appeal detail workspaces and audited detail reads; private evidence upload, content-signature validation, ClamAV fail-closed scan, private storage, image previews and human evidence review | Runtime/security acceptance, complete ownership adjudication, claimant challenge/dispute linkage, multiple-claimant conflict handling, legal/stolen-property handling and concurrency tests |
| 6 | Agent application, verification, onboarding, training, availability and directory | PARTIAL | Agent application; private malware-scanned KYC/business/service-location documents; manual Admin review and expiry; system-assessed three-module curriculum (80%, 12-month validity); versioned agreement with typed-name/hash acceptance and separate Owner legal approval; Admin service-site inspection; capacity and availability; directory filters for current compliance | Disposable-DB acceptance, malware/S3 runtime tests, renewal/expiry automation and evidence review; legal approval of actual agreement text; service-site inspection evidence process; Batch 44 adds a metadata-only Admin/Owner queue and audited restricted Agent detail view; complete Admin/Owner review and role/security acceptance |
| 7 | Assignment, custody, appointment, collection and handover | PARTIAL | County/capacity assignment and eligible-Agent recommendations requiring Admin confirmation; audited capacity reconciliation and reassignment; dual Agent/claimant transfer confirmation after custody begins; published Africa/Nairobi availability windows and Agent-confirmed appointments; claimant identity/authority check; 24-hour six-digit HMAC collection code with five attempts and atomic single use; append-only hash-chained custody events; Agent readiness and separate claimant confirmation | Disposable-DB, race/concurrency and abuse tests; email and role acceptance; full chain verification after migrations; claimant appointment/collection UI acceptance; final release remains BLOCKED pending independent payment and legal approvals |
| 8 | Organisation onboarding, staff invitation, granular permissions and tenant isolation | IMPLEMENTED_UNVERIFIED | Organisation onboarding, verified-email-bound hashed seven-day invitations, accept/revoke, memberships and scoped report/member APIs, last-admin protection | Cross-tenant negative tests; verify all membership/permission combinations; full onboarding document verification; offboarding/recovery and org UI acceptance; Batch 44 adds metadata-only Admin/Owner organisation queue and audited restricted detail view |
| 9 | Trust & Safety, dispute/legal handling, support and escalation | PARTIAL | Dispute and hold workflow; support ticket/message/queue APIs with internal-note restriction; user security incident reporting; Batch 43 restricted dispute/appeal workspaces with metadata-only queues and audited detail reads | Assignment/reassignment model, PostgreSQL/API concurrency proof for appeal decision step-up, legal/stolen property holds, safeguarding, SLAs/escalation/complaint metrics, evidence preservation and browser acceptance |
| 10 | Public website, guidance, notices, pricing/service transparency | PARTIAL | Responsive public site, how-it-works and pricing guidance, safe found-notice feed, contact/help, recovery caveat | Licensed authentic Kenya imagery, final legal/company contact review, real service-coverage feed, content and SEO review, user testing |
| 11 | Admin Console and Owner Dashboard | PARTIAL | Batches 18–47 added privacy-minimised aggregate indicators to the authenticated Admin/Owner overview, including claims, disputes, appeals, support, data rights, security incidents, notification retries and pending organisations; authenticated Admin operations surface for report moderation, claim review, Agent status, assignments, drop-off code issuance and standard category seeding; Owner/Admin aggregate overview; 12 role demo workspaces | Complete Owner governance/finance/analytics dashboard, audit explorer, config controls, separation-of-duties UI, paginated/filterable queue details, bulk confirmation and permission acceptance; validate aggregate metrics against a disposable database; Batch 44 adds restricted Agent/Organisation governance queues with audited detail access; Batch 45 adds Admin/Owner-only metadata finance queues and audited payment/settlement/refund/payout/reconciliation/funding/destination details; Batch 47 adds audited approval-history visibility and workload context; complete case assignment/reassignment model and remaining object/field/tenant authorization review |
| 12 | Pricing, collection, ledger, allocations, settlements, payouts, refunds and reconciliation | PARTIAL; money movement BLOCKED | Approved Finder 33% / Agent 25% / Return4me 42% and 48-hour eligibility helpers; registered/guest category proposals; versioned KES schedules and assessment flow; immutable double-entry ledger foundation; guarded IntaSend collection/refund/payout source; settlement eligibility worker; collection reconciliation, provider-operation outbox, recovery queues and Batches 45–47 restricted finance queues with audited detail endpoints, metadata-only immutable journal/provider-operation queues, bounded pagination, stale-attention indicators and maker/checker history | Disposable-PostgreSQL migration/concurrency proof; provider sandbox and wallet/beneficiary verification; refund/chargeback and reconciliation/accounting acceptance; professional review. No production money movement is authorised; provider execution remains disabled/fail-closed by environment and policy gates |
| 13 | Resend email, notifications, templates and channel publishing | PARTIAL; external publishing BLOCKED | Email OTP foundation; in-app notifications with durable outbox/retry controls; campaign/template drafting; content privacy check; independent writer/approver/publisher roles; publish queue | External delivery/bounce/complaint events; template localisation/preferences; transactional outbox atomicity; verified Resend domain; Facebook/Telegram scopes, retries/dedupe and channel acceptance. External campaign publishing remains locked |
| 14 | Security, privacy, fraud and incident response | PARTIAL | Helmet/CORS/size limits/rate limits; HMAC codes; opaque revocable session; HttpOnly cookie; Origin validation; server-side roles; audit events; incident reporting/triage; private claim evidence scanning and storage foundation; audited restricted privacy/security/dispute/appeal/Agent/Organisation/Finance detail reads | Privileged MFA; complete object/field audit; scanner/S3 runtime tests; versioned payment-PII rotation; remaining KMS/key-retirement controls; device/risk controls; log protection/monitoring; breach exercises; Kenyan DPA/ODPC/DPIA review; independent penetration testing |
| 15 | Visual system, UX, accessibility and role workspaces | PARTIAL | Approved navy/blue/teal tokens; responsive mobile-first UI; public pages; authenticated Admin/Agent/claimant/Finder/organisation foundations; all 12 role demo previews; focus and reduced motion; persistent light/dark theme control; skip-to-content navigation; improved mobile-nav state and announcement semantics; Batch 44 Agent/Organisation and Batch 45 Finance restricted-record navigation | All authenticated role pages and task flows; approved image assets; complete record details; full dark-theme contrast audit; keyboard/screen-reader review; WCAG 2.2 AA audit; Android/slow-network testing and user acceptance |
| 16 | Technical architecture, tests, deployment, observability and production readiness | PARTIAL | React 19/TS/Vite/Tailwind v4; Express/Drizzle/PostgreSQL modular routes; schema and domain policy modules; tests authored; native Postgres or hosted DB path; DB-free Vite preview; runbooks drafted; Batch 47: 156 TS/TSX syntax transpilation checks; full non-PostgreSQL `verify:all` passed with 82/82 Node-native tests across 13 suites; 12 Batch 47 Finance source guards and 6 focused tests; full semantic typecheck attempted but blocked by missing `@types/node` and `vite/client` | Full npm install/typecheck/build; generate/apply migrations; execute Vitest + DB/API/integration/E2E tests; monitoring/log alerts; encrypted backup/restore and RPO/RTO; CI, deployment, rollback and staging/prod evidence |
| 17 | Consolidated specification, traceability, approval governance and acceptance | PARTIAL | Master requirements contract; roadmap; implementation register; API, architecture, test and build docs; status vocabulary separates code from acceptance; 166-row traceability and evidence-matrix validators pass; Batch 47 implementation and acceptance gaps documented | Line-by-line requirement/test/migration evidence; decision provenance review against full discovery chat; independent acceptance; privacy/legal/accounting/security sign-off; explicit production release authorisation |

## Batch 4 implementation additions (current source, not yet runtime-verified)

- Guest reporting: a person can submit a lost/found report without creating an account after email OTP verification. Verification proof is short-lived, single-use and stored as an HMAC hash. The report records reporter email and verification time separately from an optional user account.
- Guest tracking: a 256-bit random tracking token is stored only as an HMAC hash, sent by verified email in a URL fragment, exchanged for a report-specific HttpOnly/SameSite cookie, and expires after 30 days. If delivery fails or the link is lost, guests can request a second email OTP and reissue the link; old tokens are revoked. The tracking response exposes limited progress metadata only; private evidence, contact details, full description and exact locations are not included. Guest users can withdraw or update separate public-notice consent; re-enabling consent moves a previously published/matched notice back to review.
- Representative reporting: report creation distinguishes the reporter from the person affected and captures parent/guardian or family-representative declarations. These declarations are not treated as legal proof and do not bypass later verification.
- Claim representation: claimants may submit owner, parent/guardian or family-representative claims. Representative authority requires a separate malware-cleared document and independent Admin/Trust & Safety review before ownership approval.
- Claim appeals: rejected claimants can submit a reasoned appeal. The original decision-maker cannot decide the appeal. A reviewer must start the independent review before a final appeal decision. An upheld appeal returns the claim to `under_review`; it never automatically approves ownership.
- Category governance: registered and guest reporters can propose a category with an explanation through `Other`. An Admin queue can approve a suggestion, reject it, or explicitly approve and create a permanent category. Proposal review is row-locked to prevent simultaneous administrator decisions.
- Public publication: publication requires explicit consent, a separate description passing privacy screening and, for found reports, recorded authorised-Agent receipt. The shared policy module now covers this gate and the same re-review rule for consent changes.

### Batch 4 verification evidence

- TypeScript syntax transpilation: 45 `.ts`/`.tsx` files; zero syntax diagnostics.
- Strict standalone TypeScript check passed for `shared/reporting-policy.ts`.
- Automated Vitest cases were authored for representative authority, claim approval gating, public-consent re-review and found-item custody publication gates; the Vitest runner has not been executed because full dependency installation is unavailable in this preparation environment.
- Full-project typecheck/build, Drizzle migration generation/application, PostgreSQL API integration, email-link round trip, browser tests, role/field access tests and independent security review remain unverified. The local PostgreSQL setup reported by the operator is not directly accessible from this preparation environment.

## Approved product and operating invariants

1. Kenya-focused coordination service; the 47-county list is not evidence of operational coverage. Only verified active Agent coverage may be advertised.
2. Recovery is never guaranteed. A match is a triage suggestion, not proof of ownership. Human review controls claim outcomes.
3. Finder and claimant do not exchange private contact information or arrange private meetings. The Finder can use only the verified official Agent service number for approved drop-off coordination.
4. Only active authorised Agents may physically receive items. Public found notices require reporter consent, a privacy-screened public description, documented Agent custody and review.
5. Police OB documentation is optional/private and is not ownership proof. Institutional partnerships require separate signed agreements.
6. Email-first OTP; SMS is not a launch dependency. OTPs, drop-off codes and sensitive details are never public.
7. Target allocation is Finder 33%, Agent 25%, Return4me 42%. Historical allocations remain immutable snapshots; any historical migration requires separate approval.
8. Settlement eligibility starts only after the approved 48-hour period and all confirmed payment/recovery/hold gates. Settlement approval is separate from manual, authorised payout initiation. IntaSend disbursement fees are a platform cost.
9. Unknown payment outcomes remain unknown/pending. A timeout or browser redirect is not confirmation and must not trigger a second payment request.
10. Claimant payment follows ownership approval, itemised assessment and explicit claimant confirmation. Pricing is KES-only and versioned, with no arbitrary, hidden, value-percentage, public coupon or unapproved storage fees.
11. Disputes and credible legal holds pause release and affected settlements. A post-handover reversal does not automatically retrieve an item.
12. Do not use customer-facing “escrow” or claim the product uses “AI”. No fake testimonials, partners, coverage claims or recovery statistics.
13. Public notices are consent-controlled and privacy-screened. No scraping or harvesting third-party listings.
14. Privileged activity is attributable to an individual user. No shared organisation accounts. Owner oversight is not a bypass of evidence privacy or approval controls.
15. Building the codebase is not permission to move money, publish externally, use production data or deploy. Those require separate explicit approval and independent readiness gates.

## Delivery batches and execution order

- **Batches 1–5 — core platform, claims, Agents and custody:** source included; acceptance remains outstanding as detailed above.
- **Batch 6 — finance foundation:** immutable KES double-entry journal and finance read-only surface added; later batches add disabled-by-default sandbox collection/refund/payout adapters and a 48-hour settlement auto-approval worker; no live execution is authorised.
- **Batch 7 — claimant payment and IntaSend collection:** claimant-confirmed assessment, 24-hour post-Agent-inspection payment window, 15-minute STK sessions, idempotent IntaSend STK adapter, authenticated webhook, authoritative provider status reconciliation and unknown-outcome handling. Source added; full acceptance pending; collection disabled by default.
- **Batch 8 — payment-controlled custody and handover:** payment gates on collection code, Agent handover readiness, claimant confirmation and final release; Agent release now requires verified payment, claimant identity/authority, consumed code, active appointment, claimant confirmation and no release hold. Source added; DB/concurrency acceptance pending.
- **Batch 9 — financial accounting and reconciliation:** balanced collection journal postings, confirmed-payment receipts, verified provider-fee evidence, mismatch exception queue and evidence-based finance review. Refund execution/reversals and full statements remain pending.
- **Batch 10 — refunds and reversals:** original-payer encrypted destination, admin decision and independent approval, sandbox-only B2C initiation, unknown-outcome protection and manual evidence reconciliation. Post-handover chargeback/reversal intake remains pending; refund execution disabled by default.
- **Batch 11 — settlements and payouts:** separate evidence-backed reward funding, immutable 33/25/42 allocation, 48-hour auto-approval, encrypted beneficiary destinations, cooling period, maker-checker-executor controls, sandbox-only manual IntaSend B2C submission and TS100 status confirmation. Payout disabled by default; no automatic payout.
- **Batch 12 — communications and complete workspaces:** durable in-app notification outbox/retries, unread/read controls, claimant payment session/receipt UX, Agent final-release gate, Finder/Agent payout destination panel and Finance/Admin workflow panel. External email/SMS/social, complete Admin/Owner governance and analytics remain pending.
- **Batch 13 — security, privacy and accessibility:** versioned payment-PII key rotation, scoped personal-data export and rights requests, finance PII minimisation and accessibility refinements. MFA policy, retention schedule, DPIA, distributed rate limiting and independent security/accessibility review remain pending.
- **Batch 14 — production-readiness and governance:** CI/Docker/health/readiness/graceful-shutdown tooling, encrypted backup/restore scripts, release evidence gate and runbooks are source-added. CI/Docker/restore execution, monitoring/RPO/RTO, DR drills, threat model, professional sign-off, pilot and rollback remain pending.
- **Batch 15 — UX, themes and accessibility foundations:** persistent light/dark theme selection, skip-to-content navigation, mobile navigation state semantics and accessible status/error announcements are source-added. Full role-workspace completion, contrast/keyboard/screen-reader/WCAG 2.2 AA audits, Android/slow-network and user acceptance remain pending. Separate explicit release authorisation.

## Batch progress register

| Batch | Source implementation | Technical verification | Independent acceptance / authorisation |
|---|---|---|---|
| 1–5 | Included in recovered baseline | Partial / not complete | Pending |
| 6 | Implemented | Migration metadata/source checks only | Pending |
| 7 | Implemented in this continuation | Syntax, traceability and migration metadata pass; typecheck blocked | Pending; provider remains disabled |
| 8 | Implemented in this continuation | Source syntax/traceability/migration metadata checks pass; full tests blocked | Pending; DB/concurrency and security acceptance outstanding |
| 9 | Implemented in this continuation | Source syntax/traceability/migration metadata checks; full tests blocked | Pending DB/accounting/security acceptance |
| 10 | Implemented in this continuation | Source syntax/traceability/migration metadata checks; full tests blocked | Pending DB/sandbox/security/accounting acceptance |
| 11 | Implemented in this continuation | Source syntax/traceability/migration metadata checks; full tests blocked | Pending DB/sandbox/security/accounting acceptance |
| 12 | Implemented in this continuation | Source syntax/traceability/migration metadata checks; full tests blocked | Pending DB/API/browser/accessibility acceptance |
| 13 | Partial source implementation added | Source syntax/traceability/migration metadata checks; full tests blocked | Pending DB/security/privacy/accessibility acceptance |
| 14 | Source tooling/runbooks implemented; release blocked | Source syntax/traceability/migration metadata checks; CI/Docker/DB/restore not run | Pending operational, legal, financial, security and owner sign-off |
| 47 | Combined Finance oversight, reconciliation attention and maker/checker history | Implemented in source | Full non-PostgreSQL verify:all passed; 82/82 Node-native tests; 156 syntax transpilation files; traceability/evidence/migration metadata pass; full semantic typecheck blocked by missing type packages | PostgreSQL/API/browser/mobile/accessibility and independent finance/security acceptance pending; no production authorisation |

## Batch 43 checkpoint — 16 November 2026

- Added Admin/Owner-only dispute and appeal detail endpoints. Queue DTOs remain metadata-only; private narratives are fetched on deliberate selection and each successful detail read writes a dedicated audit event without copying the narrative into audit metadata.
- Added the read-only Admin/Owner dispute and appeal workspace with status filters. Existing dispute resolution and appeal review remain in their separately governed workflows; the new workspace does not perform decisions or money/item release actions.
- Case assignment/reassignment is explicitly deferred because the current schema does not define a shared case ownership lifecycle, maker/checker model or safe reassignment semantics. No speculative migration was added.
- Verification: 156 TypeScript/TSX files transpile with zero syntax diagnostics; 74 Node-native tests pass; all prior static/source guards plus the Batch 43 ten-check static guard pass; traceability (166 IDs), evidence matrix (166 rows) and migration metadata (22 ordered migrations as of Batch 63; later migrations remain unapplied) pass.
- Full `npm run typecheck` remains blocked by missing `@types/node` and `vite/client`; `npm run verify:all` stops at `verify:source` because the local project dependency `typescript` is not installed. PostgreSQL was intentionally not run; no migration was applied. Vitest/build/browser/mobile/accessibility and independent security/privacy acceptance remain pending.
- No requirement or stage is marked `VERIFIED_COMPLETE`; production release remains blocked.

## Acceptance gates

A stage cannot be accepted merely because a table, API route or screen exists. Acceptance requires the relevant migrations applied to a disposable test database; full typecheck/build; API, role/tenant, abuse/concurrency and domain tests; UI/device/accessibility checks; traceability evidence; and no unresolved critical/high security finding. Financial/external integrations additionally require provider sandbox evidence, callback authentication, idempotency, failure simulations and independent reconciliation. Production additionally requires professional/legal/security sign-off and separate owner authorisation.

## Batch 5 implementation (current ZIP)

Batch 5 source has been added under `docs/BATCH5_IMPLEMENTATION.md` and migration `0001_batch5_agent_custody.sql`. Source status is `IMPLEMENTED_UNVERIFIED`; Stages 6 and 7 remain `PARTIAL` until database/API/security/browser acceptance closes the remaining gates. The Batch 5 source includes Agent training assessments, versioned agreement governance, service-site inspections, availability windows, appointments, assignment recommendations/repair, claimant collection checks/codes, dual-party confirmations and custody hash-chain immutability. Final release is enabled only after provider-confirmed payment, claimant confirmation, identity/authority, active appointment and dispute-hold checks. See the Batch 5 implementation note for exact routes, controls and unverified items.


## Batch 6 source foundation — 14 November 2026

The current clean-room delivery adds the initial immutable double-entry KES journal foundation (`shared/ledger-policy.ts`, `server/services/ledger.ts`, `server/db/migrations/0003_financial_journal.sql`) and a read-only journal view. At the Batch 6 baseline this was not provider integration and did not enable collection, refunds or payouts. Later Batches 7–11 add sandbox-gated collection/refund/payout adapters and 48-hour settlement auto-approval; these remain unaccepted and disabled by default.

The same delivery adds custody-chain v2 (`shared/custody-chain.ts`, migration `0002_custody_chain_v2.sql`) with database-owned event sequencing/hashing, append-only enforcement, and current-party identity checks for transfer confirmation. These changes remain `IMPLEMENTED_UNVERIFIED` until the migrations and race/constraint tests pass on a newly created disposable PostgreSQL database.

A 165-row requirement traceability export is maintained in `REQUIREMENT_TRACEABILITY.csv`. No requirement is marked `VERIFIED_COMPLETE`. Dependency installation was attempted but timed out; offline install confirmed required packages are not cached, so no full typecheck, Vitest or production build result is claimed for this delivery.


## Batch 7 implementation note

See `BATCH7_INTASEND_COLLECTION.md` for the exact files, endpoints, timing semantics, controls, verification evidence and outstanding acceptance gates. Batch 8 final release controls are described in `BATCH8_PAYMENT_GATED_HANDOVER.md`; Batch 9 collection accounting and receipt controls are described in `BATCH9_COLLECTION_ACCOUNTING.md`; Batch 10 refund controls are described in `BATCH10_REFUNDS_REVERSALS.md`; Batch 11 settlement and payout controls are described in `BATCH11_SETTLEMENTS_PAYOUTS.md`; Batch 12 communications and workspace changes are described in `BATCH12_COMMUNICATIONS_WORKSPACES.md`; Batch 13 security/privacy/accessibility changes are described in `BATCH13_SECURITY_PRIVACY_ACCESSIBILITY.md`; Batch 14 release tooling and runbooks are described in `BATCH14_PRODUCTION_READINESS.md`. External provider execution remains disabled by default and no provider request was made during source implementation.


## Batch 16 — integrated technical verification (14 November 2026)

Batch 16 is **PARTIAL / BLOCKED**, not accepted. The follow-up execution on 14 November 2026 freshly extracted the 162-entry archive and retried `npm ci --ignore-scripts --no-audit --no-fund`; it timed out after 120 seconds, with the npm log recording `EAI_AGAIN` fetching from `registry.npmjs.org` and an empty local npm cache. The globally installed TypeScript 5.8.3 was linked only under ignored `node_modules` to rerun source syntax validation: 77 TS/TSX files, zero syntax diagnostics. The 165-row traceability validator and 11-migration metadata validator passed again. Full typecheck remains blocked by missing `@types/node` and `vite/client`; `npm test -- --run` exits 127 because Vitest is absent; `npm run build` stops at the same missing type definitions. No Docker/PostgreSQL tooling is available, so no disposable database was provisioned and no migration was applied. No application source code was changed. See `BATCH16_INTEGRATED_VERIFICATION.md` for exact evidence and required actions.

**Current batch:** Batch 16 remains open until clean dependency installation, typecheck, full tests, build, disposable-PostgreSQL migration/integration tests, API/security tests and browser/accessibility acceptance are evidenced. Batch 17 governance/independent acceptance remains pending and must not be used to bypass Batch 16.


## Batch 18 — Admin/Owner overview hardening (14 November 2026)

The authenticated `/admin/overview` endpoint now returns privacy-minimised aggregate counts for pending claims, active disputes, appeals, support tickets, data-rights requests, security incidents, notification retries/dead letters and pending organisation verification. Financial metrics remain explicitly `not_enabled`; the overview contains no sensitive queue record detail and adds no write actions. `scripts/verify-admin-overview.mjs` checks the expected indicators and queue status contracts. Static checks passed, but Stage 11 remains PARTIAL pending full Admin/Owner workspaces, restricted audit explorer, maker-checker surfaces, database/API/permission tests, browser/accessibility acceptance and independent review.


## Batch 44 — Restricted Agent and Organisation Governance Workspaces (16 November 2026)

- Admin/Owner Agent queue now returns metadata only; service address, service phone, account email and application capacity notes are fetched only through a separate audited detail endpoint.
- Admin/Owner Organisation queue now omits registration identifiers; a separate audited detail endpoint returns restricted registration information and active member count.
- Added an Admin/Owner Agent and Organisation governance workspace; detail is fetched only after explicit record selection.
- No new privileged role and no schema migration were introduced.
- Stage 6 remains PARTIAL, Stage 8 remains IMPLEMENTED_UNVERIFIED, Stage 11 remains PARTIAL, and Stages 14–17 remain PARTIAL. No stage is promoted to VERIFIED_COMPLETE.
- PostgreSQL/API, browser/mobile/accessibility and independent acceptance remain pending. Production release remains NOT_AUTHORISED.


## Batch 45 — Restricted Finance Workspaces (16 November 2026)

- Converted payment, settlement, refund, payout, collection-reconciliation, reward-authorization and payout-destination queues to bounded Admin/Owner metadata projections. Sensitive rationale, provider references, evidence notes, beneficiary identifiers, destination fingerprints and settlement allocation legs are not returned in queue responses.
- Added separate Admin/Owner detail endpoints for each of those record types. Successful detail access writes a purpose-specific audit event. Payout destination detail exposes masked phone only; payout/payment ciphertext is not returned.
- Updated the Finance UI to fetch restricted detail only after explicit selection. Consequential actions remain on their existing step-up/maker-checker routes.
- Added 14 static source guard checks and 8 Node-native tests. These are source-policy checks, not PostgreSQL/API runtime acceptance.
- Stage 12 remains PARTIAL and money movement remains BLOCKED. Stages 11, 14, 15, 16 and 17 remain PARTIAL. No stage is promoted to VERIFIED_COMPLETE.
- PostgreSQL was intentionally not run. Full semantic TypeScript, Vitest/build, browser/mobile/accessibility, provider sandbox, financial professional and independent security/privacy acceptance remain pending.


## Batch 46 — Restricted Ledger and Provider Operation Details (16 November 2026)

- Converted the Admin/Owner financial journal endpoint to a metadata-only queue. Source IDs, idempotency keys, memo and debit/credit posting legs are available only through a separate Admin/Owner detail route.
- Added audited ledger journal detail access; journal records remain immutable and the route is read-only.
- Tightened the provider-operation attention queue to omit resource identifiers, provider references and idempotency keys. Added a separately audited Admin/Owner detail endpoint that exposes bounded operational evidence but no request payload.
- Added explicit journal and provider-operation detail selection to the Finance workspace. The recovery surface has no retry or dispatch action.
- Added Batch 46 static source guards and Node-native source tests. No schema migration, provider call, money movement or production action was performed.
- Stage 12 remains PARTIAL and money movement BLOCKED. Stages 11, 14, 15, 16 and 17 remain PARTIAL; original Stages 1–17 remain subject to requirement-level acceptance. PostgreSQL/API, full semantic TypeScript, Vitest/build, browser/accessibility, provider and independent accounting/security acceptance remain pending.


## Batch 47 — Combined Finance Oversight and Maker/Checker History (16 November 2026)

- Expanded the Admin/Owner provider-operation attention queue with strict status filters, bounded pagination, age in minutes and a configurable stale-attention threshold. A stale indicator is explicitly an investigation cue, not proof of provider failure. No provider retry or dispatch action was added.
- Added bounded pagination and source-type filtering to the metadata-only immutable ledger journal queue. Posting legs, memo and source references remain behind the separately audited detail route.
- Added a paginated Admin/Owner approval-history endpoint with maker/reviewer references, proposal and decision reasons, expiry/resolution times and derived expired status. Proposal payload is excluded; every history read writes an audit event.
- Added recent approval-history visibility to the Admin console and provider-operation age/stale indicators to Finance navigation. Existing step-up and maker/checker decisions remain unchanged.
- Added Batch 47 source guard (12/12) and Node-native tests (6/6). Full non-PostgreSQL `npm run verify:all` passed: 82/82 Node-native tests across 13 suites, 156 TypeScript/TSX syntax files with zero syntax diagnostics, 166 requirement IDs and evidence rows validated, and 17 migration metadata entries checked.
- Full semantic `npm run typecheck` was attempted and stopped on missing `@types/node` and `vite/client`. PostgreSQL intentionally not run; no migration was applied. Vitest/build, runtime API/database, browser/mobile/accessibility and independent acceptance remain pending.
- Stage 11 remains PARTIAL. Stage 12 remains PARTIAL and money movement BLOCKED. Stages 14–17 remain PARTIAL. No stage is marked VERIFIED_COMPLETE.


## Batch 48 — Combined Ledger Reconciliation and Settlement Policy Review (16 November 2026)

- Added a read-only Admin/Owner ledger reconciliation overview with account-level debit, credit and net-debit summaries, posting counts and latest posting time. Account totals are aggregated; no payer or beneficiary identity is exposed.
- Added journal integrity exceptions for journals with no postings or debit/credit imbalance. These are investigation indicators only; the view does not create correcting entries or modify immutable journals.
- Added a paginated settlement policy review comparing historical snapshots against the approved Finder 33% / Agent 25% / Platform 42% split and the existing cent-rounding policy. It reports differences without changing stored settlement amounts or percentages.
- Added audit events for both reconciliation and settlement policy review reads.
- Extended approval history with expiry state and remaining minutes, including an explicit expired indicator; expired proposals remain unavailable for approval.
- Added Admin Finance UI panels for account summaries, journal exceptions and historical allocation differences.
- Added Batch 48 source guard (15 checks) and Node-native tests (5 tests). Full non-PostgreSQL `npm run verify:all` passed, including all prior guards/tests and the Batch 48 suite; source syntax check covered 156 TypeScript/TSX files with zero syntax diagnostics. Traceability/evidence validators still cover 166 requirements; 17 migration metadata entries checked.
- No schema migration was added or applied. No historical allocation was rewritten, no provider call or money movement occurred, and no production action was performed.
- Full semantic TypeScript check and production build remain blocked by missing `@types/node` and `vite/client`; Vitest remains unavailable. PostgreSQL/API runtime, browser/mobile/accessibility, financial professional and independent acceptance remain pending.
- Stage 11 remains PARTIAL. Stage 12 remains PARTIAL and money movement BLOCKED. Stages 14–17 remain PARTIAL. No stage is marked VERIFIED_COMPLETE.


## Batch 49 — Combined Finance Control Totals and Period-Close Preparation (16 November 2026)

- Added Admin/Owner-only grouped control totals for collection reconciliation, refund, payout, provider-operation and payment streams, without exposing row-level PII or provider references.
- Added an audited read-only period-close preparation report. It surfaces unresolved reconciliation, refund, payout, provider-operation and journal-integrity counts.
- Added Finance UI visibility for close blockers. `readyForClose` remains false and no close operation exists in this report; independent Finance approval and verified provider-to-ledger matching are still required.
- Batch 49 static source guard 14/14 and focused Node-native tests 5/5 passed. Full non-PostgreSQL `npm run verify:all` passed with 92/92 Node-native tests across 15 suites, 156 TS/TSX syntax files, 166 traceability/evidence rows and 17 ordered migration metadata entries.
- No migration was added/applied and no provider call, money movement or production operation occurred. Stage 12 remains PARTIAL; money movement and period-close execution remain blocked.


## Batch 50 — Finance evidence matching and completeness (16 November 2026)

- Added Admin/Owner-only read-only collection reconciliation candidate matching using the exact internal transaction UUID written by the exception writer, provider invoice binding, confirmed transaction, matching KES amount facts and balanced collection journal.
- Candidate states distinguish unlinked, invoice mismatch, unconfirmed payment, amount/currency mismatch, missing/duplicated journal, unbalanced/incomplete journal and evidence-supported candidate. Candidate-supported does not resolve or reconcile an item.
- Added Admin/Owner-only refund/payout evidence completeness indicators for provider references/outcomes, lifecycle timestamps, refund reconciliation evidence and payout journal presence.
- Both routes audit metadata-only reads. No migration, provider call, money movement, journal mutation, reconciliation decision, period close, deployment or publication occurred.
- Stage 12 remains PARTIAL and money movement BLOCKED. Original Stages 1–17 remain as recorded below; no stage is independently accepted complete.

### Original Stages 1–17 status after Batch 50

| Stage | Status |
|---|---|
| 1 Product/service model | PARTIAL |
| 2 Identity/accounts/roles | PARTIAL |
| 3 Reports/privacy/public notices | PARTIAL |
| 4 Matching | IMPLEMENTED_UNVERIFIED |
| 5 Claims/evidence/disputes/appeals | PARTIAL |
| 6 Agent lifecycle | PARTIAL |
| 7 Assignment/custody/handover | PARTIAL |
| 8 Organisations/tenancy | IMPLEMENTED_UNVERIFIED |
| 9 Trust & Safety/support | PARTIAL |
| 10 Public website/content | PARTIAL |
| 11 Admin/Owner governance | PARTIAL |
| 12 Finance/payments | PARTIAL — money movement BLOCKED |
| 13 Communications | PARTIAL — external publishing BLOCKED |
| 14 Security/privacy | PARTIAL |
| 15 UX/accessibility | PARTIAL |
| 16 Architecture/verification | PARTIAL |
| 17 Governance/evidence/release | PARTIAL |

Batch 50 source checks are not independent acceptance. PostgreSQL runtime/API, provider-statement reconciliation, accounting, concurrency, browser/mobile/accessibility, privacy/security and independent review remain pending. Production release remains NOT_AUTHORISED.
