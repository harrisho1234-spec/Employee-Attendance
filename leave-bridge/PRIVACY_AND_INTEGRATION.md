# Privacy gate for Employee Attendance integration

## Findings

The existing public GitHub Pages `index.html` creates anonymous Firebase sessions and its current `loadCustomNotes` / `saveCustomNotes` implementation synchronizes note and reason data using a `public/data/customNotes/records` collection. That is not acceptable for adding sensitive Telegram leave reasons.

The currently deployed private Cloud Run bridge has internal-only ingress and requires IAM; a public browser cannot legitimately connect to it. Do not disable ingress restrictions, assign `allUsers`, add shared secrets into GitHub Pages, or copy leave reasons to public Firebase records.

## Required implementation before activation

1. Establish a real HR/manager identity with enforced backend authorization. Anonymous Firebase authentication alone is insufficient. Define authorized HR/admin principals or claims and deny all other callers at the private-data boundary.
2. Have an authorized server-to-server component call the bridge (the public browser must **never** receive Cloud Run invocation credentials). Choose a secure route compatible with internal-only Cloud Run ingress; typical Apps Script web apps are **not** automatically considered internal Cloud Run traffic.
3. Make reason/override storage private and scoped per employee-date and user authorization. Migrate *only after* reviewing current Firebase rules and restricting access. Existing public notes/reasons must be audited; no broad migration to an unprotected collection.
4. Implement per-field manual overrides (`noteTime`, `reason`) using a boolean `present` so an intentional blank is preserved. `Reset to Sheet` deletes just the selected override, not any attendance cell or source log row. A trusted backend must authorize and atomically persist all edits/resets.
5. Verify dates/time zone, edited messages, day-off swaps, duplicates, 31-day pagination, staff-ID aliases, cancellations and source precedence. Current bridge unit tests don't cover all these scenarios.
6. Keep attendance codes, scanner results, and leave quota calculations unchanged. Validate against staged sample data with no real employee reasons in test logs.

## Deployment caution

The bridge exists and starts, with Sheets metadata access tested using the runtime identity. Real `Leave Requests Log` reads, IAM-only invocation, and end-to-end HR authorization are not yet tested. No sensitive production sync should be enabled until these gates pass.
