# Secure HR Leave panel integration — DEPLOYMENT REQUIRED

## Code state
The existing Employee Attendance dashboard now links to `hr-leave.html`. This page signs into Firebase using **Google** in a separate named Firebase app instance, so it does not change the dashboard's existing anonymous session. The page remains unusable while `hr-leave-config.js` has an empty gateway URL.

The Node HR gateway now supports directly reading the **restricted** HR Leave Sync spreadsheet via `HR_PRIVATE_SHEET_ID`, bypassing the internal Cloud Run bridge and its 404 network issue. Every HR API call checks a verified Firebase ID token and an approved-email allowlist **on the server**. No spreadsheet ID token, Google Cloud service account key, or private reason is embedded in the static site.

### REQUIRED BEFORE USE (not done by committing code)
1. Grant **Editor** access on the restricted HR spreadsheet `1npvICjymicRohQ6G16Ys3Rm9kp7f3XwREIXsnpBz8tM` to `leave-hr-gateway@attendance-leave-sync.iam.gserviceaccount.com`. Keep sharing Restricted.
2. Deploy the updated `leave-bridge/gateway-main.js` as a *separate* Cloud Run service. Add `HR_PRIVATE_SHEET_ID=1npvICjymicRohQ6G16Ys3Rm9kp7f3XwREIXsnpBz8tM` and retain `ENABLE_HR_GATEWAY=true`, `FIREBASE_PROJECT_ID=daily-attendance-structure`, `FIREBASE_APP_ID=1:321384539910:web:c81475cd6d4d8cedcea087`, `HR_APPROVED_EMAILS` with approved HR Google emails, `HR_ALLOWED_ORIGIN=https://harrisho1234-spec.github.io`. The gateway runtime service account needs a Google Sheets Editor share and only the necessary Firebase Authentication verification access; the private Sheet path stores overrides in Sheets.
3. To be reachable from GitHub Pages, the gateway requires a publicly routable HTTPS endpoint with **application-level authentication**. This means Cloud Run ingress `all` and allowing platform-level unauthenticated requests **only** for this gateway. The application rejects missing/invalid Firebase tokens and non-allowlisted HR users on every data operation. **Never change the separate `leave-bridge` internal service to public.** Security review and live access-control tests are required before setting this.
4. After verifying unauthenticated and non-HR requests return 401/403 with no data, set `window.HR_LEAVE_GATEWAY_URL` in `hr-leave-config.js` to the tested gateway URL. Only then merge/deploy the branch to GitHub Pages.
5. In Firebase Authentication verify Google provider is enabled and `harrisho1234-spec.github.io` is an authorized domain. Test with approved HR Google account.
6. Run `npm test` in `leave-bridge`; test real Sheets read, override/reset, refused access and CORS origin handling before production. Do not log employee reasons.

## Shared overrides
When `HR_PRIVATE_SHEET_ID` is configured, the gateway now reads and writes the **same HR Leave Overrides tab** used by the restricted spreadsheet workbench. The hourly Apps Script sync applies the override flags to the materialized HR Leave Sync sheet. Test save and reset from both interfaces, and inspect access-control rules, before production. The gateway's Sheet update operations are not transactionally atomic, so concurrent HR edits of the same record should be prevented operationally or handled with a future lock service.

The public dashboard still saves legacy notes/reasons under its broadly readable public Firebase collection. No new private leave reasons are placed there, but existing legacy reasons need their own privacy remediation. Neither this new integration nor the prior Apps Script sync has changed attendance calculations.

This is staged code, **not a fully live end-to-end integration**.
