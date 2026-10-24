# Private Telegram Leave Bridge (deployment preparation)

This service is **not** the public GitHub Pages attendance app. It reads the structured `Leave Requests Log` from three existing tracker spreadsheets using the Cloud Run **runtime service account**, normalizes per-day note/time and reason records, and exposes the results **only** on a Cloud Run endpoint requiring Google Cloud IAM authentication.

No bot tokens, leave reasons, keys or request data belong in this repository. No attendance code / quota calculations are changed.

## Status and remaining integration

The server source and unit tests are prepared on a feature branch. **Do not enable production sync yet.** IAM-authenticated Cloud Run is *not* directly callable from a public GitHub Pages browser, and browser-side embedding of the shared secret is forbidden. An authenticated server-side Apps Script or separate backend caller must be implemented, and the dashboard must enforce user authorization for private leave reasons, manual override precedence, and Reset to Sheet. This server does not itself update Daily Attendance.

## Deployment prerequisites

- Cloud project `attendance-leave-sync`, Cloud Run and Sheets APIs enabled.
- Service account `leave-bridge-runtime@attendance-leave-sync.iam.gserviceaccount.com`.
- Grant the **runtime account** Viewer access on all three tracker spreadsheets (Google Sheets Share); only read access is needed. Do not grant public link access.
- Build account `leave-bridge-build@attendance-leave-sync.iam.gserviceaccount.com` has Cloud Run builder role.
- Runtime Secret Manager access already configured; this **read-only** server does not yet consume the shared secret. Do not inject the secret until its backend-caller handshake is implemented.
- Install and test: `cd leave-bridge && npm install && npm test`.

## Configuration (environment values, not secret tokens)

`LEAVE_TRACKER_LPL_LPH_ID`, `LEAVE_TRACKER_ITC_LPT_ID`, `LEAVE_TRACKER_TTC_ID` are the Google Sheets spreadsheet IDs for the three structured tracker logs.

For deployment, set `--no-allow-unauthenticated`; grant `roles/run.invoker` only to a specific trusted service identity. Do not put auth credentials into GitHub Pages.

The Cloud Run `/internal/leave-snapshot?from=YYYY-MM-DD&to=YYYY-MM-DD` endpoint is limited to a 31-day range; Cloud Run IAM must protect it. The health check returns no personal data. Day-off swaps and edited messages need additional integration tests before syncing real leave data.

## Privacy

Cloud Run IAM authorization is essential: absence of a CORS header **does not** secure an endpoint. Avoid logging the response body; it includes private employee reasons.
