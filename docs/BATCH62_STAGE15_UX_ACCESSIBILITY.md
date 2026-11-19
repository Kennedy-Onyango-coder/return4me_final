# Batch 62 — Stage 15 UX, organisation workspace and accessibility foundations

**Date:** 17 November 2026  
**Baseline:** Combined Batches 59–61  
**Source status:** New source implementation added; unverified  
**Stage status:** PARTIAL — not accepted  
**Database migration:** None required for this batch.

## 1. Organisation workspace

Added `src/components/OrganisationWorkspace.tsx` and mounted it from the existing organisation destination.

- Displays the signed-in user's organisation memberships and permits switching between organisations.
- Clearly locks case, member and invitation operations while organisation verification is pending.
- Displays organisation-linked reports and adds report creation for `org_admin` and `case_coordinator` memberships.
- Keeps private item description separate from optional public-safe description and requires separate consent before submitting a public listing.
- Adds an organisation administrator workspace for active members, invitations, permission changes and revocation.
- Adds pending invitation status and revocation, with explicit confirmation before consequential membership changes.
- Displays recent organisation activity without returning actor email, resource IDs or activity metadata.
- Adds a registration form for additional organisations and preserves the sign-in gate for signed-out visitors.
- UI permission visibility is only a usability layer; the existing server membership and permission checks remain authoritative.

Added `GET /api/organisations/:organisationId/activity`, requiring active approved organisation membership. It returns only the latest 50 action/resource-type/timestamp records and deliberately excludes actor identifiers, resource identifiers and metadata.

## 2. Responsive and accessibility foundations

- Added semantic CSS design tokens for the approved brand palette, spacing, radius, focus and surfaces.
- Added responsive organisation workspace layout, stacked mobile forms, touch-sized controls, table overflow handling and compact activity/invitation layouts.
- Added semantic table captions, column headers and row headers.
- Added accessible labels for organisation selector, member permission controls and form fields.
- Added live status/error feedback, empty states, pending-verification state and loading/retry through refresh.
- Added 12px minimum for legacy 10px/11px utility text, 44px minimum form controls, high-contrast preference enhancements and retained reduced-motion behavior.
- Added `aria-current` to global page navigation and Escape-to-close for the mobile navigation menu.
- Member/permission/invitation actions use confirmation prompts and prevent concurrent duplicate submissions through busy state.

## 3. Requirements advanced

UX-005, UX-011, UX-012, UX-013, UX-014, UX-015, UX-019, UX-022, UX-023, UX-024, UX-027, UX-030, UX-031, UX-034 and UX-038 have additional source evidence recorded in both requirement matrices.

All remain PARTIAL. In particular:

- Organisation settings editing, detailed case workspaces and organisation-level search are not complete.
- Report/member tables have semantic structure and horizontal mobile overflow, but do not yet provide full search, filters, sorting, pagination or alternate card views.
- Cross-role dashboards still need a consistent Needs Attention hierarchy and defined operational metrics.
- Draft persistence, offline/network-loss recovery, global component extraction and full interaction-state standardisation remain open.
- WCAG 2.2 AA has not been established. No contrast measurement, 200%/400% zoom review, screen-reader session, keyboard-only audit, Android/device testing or slow-network acceptance has been run.

## 4. Verification and safety

Per user instruction, no application tests, typecheck, build, lint, PostgreSQL tests, API tests, browser tests or accessibility tests were run. No database migration was added or applied. The new activity endpoint and UI are source changes only and are not yet runtime verified.

No production data, external provider, message dispatch, deployment, payment, refund, payout, wallet operation, item release, commit or push was performed.

## 5. Stage 15 remaining work

1. Complete claimant/finder/agent/admin/owner journeys and dashboard hierarchy against approved workflows.
2. Complete organisation settings, detailed case navigation, permission-aware search and robust table filtering/pagination/mobile alternatives.
3. Standardise shared form, dialog, loading, error, empty, confirmation and status components across the application.
4. Complete upload previews, safe form recovery, low-bandwidth behavior and offline/network-loss handling.
5. Review every interactive control, form label, heading order, landmark, status announcement, focus order and keyboard interaction.
6. Measure contrast and complete WCAG 2.2 AA automated/manual review including zoom and screen readers.
7. Test on desktop, tablet and low-cost Android devices after the implementation freeze.

**Acceptance:** Deferred until Batch 68 final implementation freeze and Batch 69 consolidated test/independent acceptance programme. No accessibility testing is run during implementation batches.
