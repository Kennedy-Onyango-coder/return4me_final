# Batch 15 — UX, themes and accessibility foundations

**Source status:** PARTIAL / SOURCE ADDED  
**Acceptance status:** NOT ACCEPTED  
**Production status:** BLOCKED; no release authorisation

## Implemented

1. Persistent light/dark theme preference using the browser's local storage where available. If no saved preference exists, the initial theme follows the operating-system colour preference. If storage is unavailable, the application safely falls back to light mode.
2. A visible theme control in the global header with a changing accessible name and title.
3. A keyboard skip-to-main-content link and focusable main-content target.
4. Mobile navigation control exposes an accessible name, `aria-expanded` state and `aria-controls` relationship.
5. Global notices distinguish assertive error announcements from polite informational status announcements.
6. Dark-theme styling for core page backgrounds, surfaces, text, borders, form fields, navigation and secondary controls.

## Scope deliberately not claimed complete

- Every authenticated role does not yet have a fully complete, independently accepted workspace and all requested record/document details.
- Dark-theme overrides are a foundation, not a proven semantic design-token system.
- No contrast ratios have been measured; no claim of WCAG 2.2 AA conformance is made.
- No keyboard-only, screen-reader, browser zoom, Android, tablet, low-bandwidth or real-device review has been completed.
- No approved authentic imagery has been integrated or licensed through this batch.
- No user acceptance testing has been performed.

## Verification required

1. Run full TypeScript check, test suite and production build after installing dependencies.
2. Test theme persistence, operating-system default, private-browsing/storage failure and all primary pages in both themes.
3. Measure text/control contrast and review focus visibility, focus order, keyboard traps, labels, headings, landmarks, status announcements and zoom at 200%/400%.
4. Test mobile navigation with keyboard and screen reader on desktop and Android.
5. Test on low-cost Android and throttled/slow network; document layout, loading and form-state failures.
6. Complete WCAG 2.2 AA automated and manual review, then independently accept the results.

## Safeguards

No payment/provider calls, live email/SMS, external publishing, production data, database migrations or deployment were performed or authorised by Batch 15.
