# Private HR attendance synchronization fix

## Behavior
- Requests use Staff ID + ISO date only. Leave type never filters a match or changes attendance totals/codes.
- Both desktop and mobile copies are filled. The former single-element map silently replaced desktop controls with mobile controls.
- Explicit legacy manual fields stay intact. Private manual overrides (including intentionally blank values) take precedence. Reset to Sheet releases a field for this HR session; it never deletes legacy public data. If a legacy override also exists, that legacy value is preserved on the next sign-in unless HR updates it separately.
- A private type mismatch badge compares the HR source type with that date's attendance type, ignoring the H- half-day prefix. Missing metadata in older gateways does not fabricate a warning.
- Private values remain only in the authenticated DOM and memory. Sign-out or 401/403 restores original public display values and clears the modal. In-flight responses cannot repopulate a revoked session. Imported values never enter public attendance persistence or exports.

## Tests
Run `pnpm install --frozen-lockfile --ignore-scripts`, then `pnpm test` (or `node --test tests/*.test.cjs`). Fixtures are synthetic; no actual employee health information is included.

## Deployment order
1. Apply the companion gateway fix on branch `fix/private-hr-sheet-matching` (based on `feature/private-leave-bridge-20261024`). Deploy the updated existing Cloud Run **leave-hr-browser-gateway** service using its existing runtime identity, approved HR allowlist, private spreadsheet setting, origin, and authentication settings. The changed backend files are `leave-bridge/private-sheet-source.js` and `leave-bridge/override-policy.js`.
2. Merge this frontend branch into `main` and let the repository's GitHub Pages deployment finish. This updates `index.html`, `hr-leave-inline.js`, and service-worker cache v71.
3. Reopen the installed app while online, connect the approved HR account, select the affected date, and press Refresh. Verify desktop and mobile Note/Time and Reason; verify the type mismatch warning, while the existing H-UP 0.5 remains unchanged.
4. Verify private manual edit, Refresh, field-specific Reset to Sheet, and sign-out. Verify a non-HR account cannot retrieve private records. Do not paste responses or employee reasons into public issues or logs.

No Apps Script change/redeployment is required for this patch: the HR sheet already contains the source row. The gateway reads true Sheets date cells as serial dates and ISO text cells as ISO dates, avoiding locale-dependent formatted-date matching. Ambiguous free-text dates fail closed.

Repository tests use mocked authenticated responses and Sheets data. They do not establish that the live gateway has this revision or that the real HR record is accessible. A signed-in production check is still required after deployment. The backend branch is a source baseline, so compare it with the deployed gateway revision before replacing production. Do not run the old deployment helper unchanged: it contains historical environment configuration.
