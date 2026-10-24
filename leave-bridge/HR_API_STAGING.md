# HR API staging status

The `private-hr-api.js` HTTP handler is **not wired to the deployed server yet**. It supplies IAM-internal-only GET /internal/hr/entry, POST /internal/hr/override and POST /internal/hr/reset semantics with a separate Firebase ID token supplied by a trusted intermediary; it does not grant access by itself.

The integration must still:
1. Initialize Firebase Admin SDK with the correct Firebase project identity and strictly verified ID tokens.
2. Enforce an explicit HR allowlist or admin-issued claims on the trusted server, not browser assertions.
3. Create the Firestore Admin database/storage adapter in a project where IAM permits access, and verify the right Firestore database, rules and cost limits.
4. Implement a Google-authenticated intermediary capable of reaching **internal-only** Cloud Run. A browser or ordinary Apps Script web app cannot directly invoke this endpoint; never add IAM tokens or secrets to GitHub Pages.
5. Implement a real source reader for spreadsheet logs, decide source precedence, and test edits, cancellations, date ranges and day-off swaps before live import.
6. Wire trusted routes into `server.js`, then deploy a new revision after staging tests.
7. Integrate the dashboard with verified login and per-field override/reset controls; preserve scanner attendance calculations. Audit and migrate existing publicly accessible custom notes/reasons separately.

Do not merge the draft PR or deploy this unfinished API. Unit tests use simulated authorization and persistence, not production Firebase or Cloud Run. 
