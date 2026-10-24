# Private Telegram leave synchronization

This feature fills **Daily Attendance → Note/Time and Reason** from the three private Telegram trackers. It does not change attendance codes, balances, totals, scanner processing, or Telegram bot behavior. The integration is disabled until the configuration below is completed.

## How it works

The browser signs in with Google. A Node server verifies the Google ID token (signature, audience and expiration) with Google's authentication library and checks an explicit email allowlist. It sends a timestamped HMAC-signed request to a separate Apps Script project. Apps Script reads the three private trackers and stores manual overrides in a separate private spreadsheet. No private reasons are added to published CSVs, Firebase, repository files, browser storage or service-worker caches.

Sync runs after sign-in, when the selected year changes, every minute while the page is visible, and when **Sync leave details** is clicked. Keep the existing attendance refresh running as before. A new leave appears in Daily Attendance when the existing attendance feed includes that day; this metadata integration does not create attendance records.

Only accounts on the allowlist can read or edit these details. Every allowed account can access all three trackers' metadata; this is an HR/operator allowlist, not employee self-service. Gmail and Google Workspace accounts are supported. Non-Google-hosted email identities are rejected.

## 1. Create the private Apps Script project

1. Sign in as an account that can read all three trackers. Create a **new standalone** Apps Script project and paste `apps-script/LeaveBridge.gs`. Do not replace any existing bot `doPost`, scanner script, or attendance engine.
2. Create a separate, restricted Google spreadsheet for overrides. Keep it out of published workbooks. The script creates the `Leave Overrides` tab on first use.
3. In **Project Settings → Script properties**, add:

   | Property | Value |
   | --- | --- |
   | `TRACKER_IDS` | JSON array containing exactly the three tracker spreadsheet IDs, in a stable order |
   | `OVERRIDES_SHEET_ID` | ID of the new restricted override spreadsheet |
   | `BRIDGE_SECRET` | Random secret, at least 32 bytes; use the same value in the server's secret manager |

   Generate a secret locally with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Do not paste it into GitHub or frontend configuration.
4. Deploy **Web app**, **Execute as: Me**, **Who has access: Anyone**. This exposes a signed-request endpoint, not spreadsheet data: GET, unsigned POST, invalid signatures, expired requests, and replayed requests are rejected. Copy the `/exec` URL for the server. Approve the owner's Sheets and script permissions. Keep the Sheets themselves restricted and never use Publish to web.
5. No Apps Script time trigger or bot modification is needed. When changing the script, deploy a new version through Manage deployments.

## 2. Configure Google sign-in and the server

1. In Google Cloud, configure an OAuth consent screen and a **Web application OAuth client**. Add your dashboard origin (for the current GitHub Pages host, `https://harrisho1234-spec.github.io`) to Authorized JavaScript origins. Add authorized operators as test users if the consent screen is in testing mode. Do not include the repository path in the origin.
2. Deploy the `bridge/` folder as a Node 22+ HTTPS service. A Dockerfile is included for Cloud Run or another container host. Cloud Run may require billing. The service must accept browser traffic at the platform layer; the application itself enforces Google authentication and the allowlist on every data request.
3. Configure these server environment values using `bridge/.env.example` as the reference:

   | Setting | Value |
   | --- | --- |
   | `GOOGLE_CLIENT_ID` | OAuth Web client ID |
   | `ALLOWED_EMAILS` | Comma-separated exact email addresses of authorized operators |
   | `APP_ORIGIN` | Exact HTTPS dashboard origin; no trailing slash |
   | `APPS_SCRIPT_URL` | The Apps Script `/exec` URL |
   | `BRIDGE_SECRET` | Secret-manager value matching the Script Property |
   | `PORT` | Provided by the host; defaults to 8080 |

   Do not log request bodies or Authorization headers. The server returns `Cache-Control: no-store, private` and never returns its secret. Missing configuration prevents startup. The container installs from the committed dependency lockfile.
4. In `leave-sync-config.js`, set only `apiUrl` (the server HTTPS URL ending in `/leave`) and `googleClientId`. These two values are public configuration. Deploy the frontend update to GitHub Pages after the backend is ready.

## 3. Verify and use

1. Open Daily Attendance, sign in with an allowlisted account, and click **Sync leave details**. Check one known request from each tracker. Headers must include Date of Leave, Staff ID, Period / Duration, Reason and Sync Status; the script detects the header row rather than assuming row 1.
2. Requests match normalized staff ID plus calendar date, never fuzzy names. Multi-day ISO date ranges are inclusive. The latest timestamp wins; equal timestamps use stable tracker order then later row. Only `Synced` AL/SL/SP/UP requests and presence overrides are used. OT and day-off swap logs are intentionally outside this leave-metadata sync. Invalid rows are skipped with a visible count; a missing tracker or changed header layout fails the whole sync.
3. Morning, Afternoon, Half Day and Full Day are normalized. Extensions/conversions become Full Day. A later presence override clears the source metadata. Deleting a source row removes its values on the next successful refresh; it does not delete manual overrides.
4. Edit Note/Time or Reason normally. Each field has a separate private override. An empty edit intentionally stays blank. A future Sheet update cannot overwrite it. **Reset to Sheet** clears that field's override and suppresses any older legacy override, restoring the latest Sheet value.
5. Existing manual entries remain higher priority than Sheet data until reset. They are not silently deleted or copied into tracker cells. Newly edited values go exclusively to the private override sheet. Existing historical notes/reasons may already be in the old public Firebase/local-storage path; this change does not purge that historical data. Review that legacy data separately before removing it so existing manual entries are not lost.
6. Disconnect or token expiration clears private in-memory values. Failed refreshes clear the private snapshot and show an error rather than presenting it as current. Offline private editing is disabled. Sign in again to reconnect.

## Validation and rollout

Run `pnpm install --frozen-lockfile --ignore-scripts` in `bridge/`, then `node --test tests/*.test.mjs` from the repository root. Fixtures are synthetic. Tests cover three trackers, date ranges, corrections, overrides, resets, authentication, HMAC requests, replay rejection, safe text rendering and unchanged attendance calculations.

For the browser smoke test, install Playwright in your test environment and run `node tests/browser-smoke.cjs`. Set `PLAYWRIGHT_MODULE` to its absolute package path if it is not on Node's module search path, and optionally `CHROME_PATH` to an installed Chrome executable. It uses intercepted synthetic responses (no live Sheets or Firebase), checks sync/edit/refresh/reset/disconnect behavior and confirms the same attendance totals before and after. Google sign-in is mocked for this test.

Before production rollout, test a non-allowlisted account (must see no private details), an anonymous request (must be rejected), each tracker, blank overrides, refresh after edits, reset, disconnect, and both desktop/mobile layouts. Live Google sign-in and Apps Script authorization require the deployment above and are not exercised by local tests.

Official references: [Verify Google ID tokens](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [Apps Script web apps](https://developers.google.com/apps-script/guides/web), [Cloud Run deployment](https://docs.cloud.google.com/run/docs/deploying), and [Cloud Run secrets](https://docs.cloud.google.com/run/docs/configuring/services/secrets).
