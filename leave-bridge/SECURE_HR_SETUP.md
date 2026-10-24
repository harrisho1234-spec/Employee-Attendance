# Restricted HR authentication — prerequisites

**Status:** draft-only; not deployed and not linked to live Employee Attendance.

The Firebase project `daily-attendance-structure` now has Google Sign-In enabled and `harrisho1234-spec.github.io` authorized. Existing dashboard signs in anonymously and its current Firestore rules allow any authenticated user to read/write the `public` subtree. Existing reasons stored there may already be exposed to any anonymous Firebase user.

## Proposed privacy work

- Keep `privateHrLeave` separate from `public`; deny all client writes, require verified non-anonymous user with trusted Firebase custom claim `hr_access`, or verified super-admin email, for reads.
- Deploy Firestore rules **only after merging with all current deployed rules**. `firestore.private-hr.rules` is a reference snippet, NOT a replacement ruleset; replacing the rules blindly would break unrelated app features.
- An authorized Firebase Admin SDK backend must verify each ID token, issue HR custom claims from a server-only allowlist, and enforce permission to read/edit/reset per employee-date. A browser-provided role is never authoritative.
- Expose only an authenticated private-data API; Cloud Run internal ingress cannot be invoked directly by GitHub Pages nor by an ordinary Apps Script web app. Do not relax ingress and do not put cloud service credentials in the browser.
- Resolve live `public/data/customNotes/records` exposure through a migration plan and verified Firestore rules; don't move sensitive data until rules are active. Avoid writing any new confidential leave reasons there.
- Protect data with per-field manual overrides, enforce backend authorization on writes and Reset to Sheet, and test duplicate/edit semantics before enabling production.
- Recheck how Firestore anonymous users see existing notes; don't assume a disabled browser control enforces access.
