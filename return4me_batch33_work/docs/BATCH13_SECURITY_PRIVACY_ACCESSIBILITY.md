# Batch 13 — security, privacy and accessibility hardening

**Source status:** PARTIAL / IMPLEMENTED_UNVERIFIED  
**Migration:** `0010_data_rights_requests.sql`  
**External security assessment:** NOT PERFORMED  
**Production readiness:** NOT APPROVED

## Implemented

### Payment PII key versioning and rotation

- AES-256-GCM envelopes now identify the encryption key version (`v1`, `v2`, etc.). Existing legacy `v1` envelopes remain decryptable through the original environment key fallback.
- New encryption uses `PAYMENT_PII_ACTIVE_KEY_VERSION` and its matching `PAYMENT_PII_ENCRYPTION_KEY_Vn`.
- A controlled Admin-only, feature-flagged rotation endpoint re-encrypts batches of payment payer phones, payout beneficiary destinations and payout-request destination snapshots.
- Rotation returns only row counts and active key version; plaintext is never returned or logged.
- The HMAC fingerprint key is deliberately stable. Changing it requires a separate complete re-index of refund/payout destination fingerprints and is not part of this rotation endpoint.
- Old encryption keys must remain configured until all rows using them have been rotated and independently checked. A failed decrypt aborts the batch.

### Personal data rights

- Authenticated users can export a scoped JSON copy of their profile, roles, own reports, claims, payment/refund/payout records, masked payout destinations, notifications and rights requests.
- The export excludes raw KYC/identity files, ciphertext, encryption keys, internal HMAC fingerprints, other users' data and internal fraud/security investigation notes.
- Users can submit access, rectification, restriction and erasure requests. Admin can review and record a documented decision.
- No automatic erasure occurs. Financial, fraud, safety, dispute and legal retention obligations must be reviewed before any deletion or anonymisation. No retention periods are invented by this batch.

### Access and application controls

- Existing server-enforced authentication, role checks, record ownership checks, Origin/CSRF checks, secure cookies, Helmet security headers, JSON body limits and global/auth rate limits remain active.
- Sensitive financial endpoints require server-side roles; hiding a UI button is not treated as an access-control boundary.
- Finance lists omit raw ciphertext and beneficiary phone numbers; payout destination displays remain masked.
- Payout creator, approver and executor are distinct; reward funding verifier is independent of creator; payment/refund/payout outcomes remain fail-closed.
- PII rotation is feature-flagged and Admin-only. Provider execution remains sandbox-only and disabled by default.

### Accessibility refinements

- Focus-visible styles, visible labels/ARIA labels for new finance/privacy/payment controls, semantic alert/live regions and reduced-motion handling are present.
- New payment and payout states use text labels in addition to colour.
- No automated axe/Playwright accessibility scan or manual assistive-technology review has been run.

## Remaining / blocked

- Retention schedule and legal basis for each data class require Kenyan privacy counsel/controller approval. No automated purge/anonymisation job is enabled.
- No Data Protection Impact Assessment, controller/processor agreement, cross-border transfer review or ODPC legal determination is included.
- No MFA/step-up authentication was introduced; privileged actions rely on the existing authenticated session plus maker-checker separation. A privileged MFA policy and recovery process require explicit product/security approval before enforcement.
- Rate limiting uses the existing process-local store; multi-instance deployments need a shared distributed store and load-tested limits.
- HMAC fingerprint key rotation, database encryption-at-rest verification, encrypted backup restore tests, key escrow/rotation drills and secrets-manager integration remain pending.
- Fraud models/signals, risk scoring, automated restrictions and abuse review remain pending; no automated suspicion-to-guilt decision is introduced.
- Incident response playbooks, breach notification decision tree, exercises, RPO/RTO, disaster recovery and independent penetration testing remain pending.

## Acceptance still required

- Full typecheck/build/Vitest and migration 0010 application on disposable PostgreSQL.
- Key-rotation tests with v1/v2 keys, partial batches, concurrent workers, malformed envelopes, interrupted rotation and key-retirement proof.
- Privacy export/rights-request permission, completeness, data minimisation and audit tests.
- API fuzzing, IDOR/tenant isolation, CSRF, rate-limit, session revocation, file access, webhook replay, payout concurrency and dependency scans.
- WCAG 2.2 AA manual and automated review across mobile, tablet and desktop, including keyboard, screen reader, zoom, contrast, focus order and reduced motion.
- Independent security, privacy, payments, accounting and Kenyan legal review. No production deployment or live provider operation is authorised.
