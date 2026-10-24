# Simpler Google Apps Script leave synchronization (STAGING ONLY)

This replaces the proposed Cloud Run network dependency **for the tracker-to-sheet leg**. It does not deploy a web API, expose a bot token, update the public dashboard, or modify attendance calculations.

## What has been implemented

- Reads the three existing Telegram tracker spreadsheets, tab `Leave Requests Log`, columns A:N.
- Accepts only rows with status `Synced`, nonempty staff ID, and valid ISO leave dates. Skips day-off swap records rather than treating them as leave.
- Expands up to 31 days of a valid date range; latest timestamp wins for the same staff/date.
- Writes the resulting effective Note/Time and Reason into `HR Leave Sync` in a **restricted destination spreadsheet**.
- Preserves per-field overrides held in a separate `HR Leave Overrides` tab. Overrides are **not** edits to the automatically generated `HR Leave Sync` tab.
- Supports `resetPrivateLeaveFieldToSheet(staffId, day, 'note'|'reason')` and an hourly scheduled sync. The setup function removes older copies of *its own* trigger only.
- Fails before writing when any tracker cannot be read; it does not silently publish partially synchronized data.
- Source spreadsheet IDs are file configuration, **not credentials**. Do not paste OAuth tokens or Telegram bot secrets into GitHub.

## Required manual setup in Google Apps Script

1. Create a **new standalone Apps Script project** at https://script.google.com/ under the Google account that can view all three tracker sheets.
2. Create a **private destination spreadsheet dedicated to HR leave detail** and share it only with approved HR personnel. Keep it out of public/shared dashboard datasets. You may reuse an existing spreadsheet only when every editor/viewer is approved to see the leave reasons, and all downstream scripts and sharing are reviewed.
3. Paste the content of `apps-script/private-telegram-leave-sync.gs` into the Apps Script editor.
4. Go to **Project Settings → Script properties** and add:
   - `HR_ATTENDANCE_SPREADSHEET_ID`: the private destination spreadsheet ID from its URL.
   - `HR_SYNC_ADMIN_EMAILS`: the exact authorized script administrator Google email(s), comma separated. Include the Google account used to authorize/run the hourly trigger.
5. Run `setupPrivateTelegramLeaveSync` once from the Apps Script editor and approve the Google permissions. It will immediately try a sync and install one hourly trigger. If it fails due to sharing or a missing tab, correct access and rerun. The function requires Apps Script Spreadsheet, Triggers and Script Properties permissions.
6. Review the `HR Leave Sync` tab for matching staff/date and Note/Time + Reason. Check at least one test row from each tracker and one edited/cancelled request, using only approved HR personnel.
7. Set manual overrides through `setPrivateLeaveOverride` (in `private-telegram-leave-overrides.gs`), or by entering rows in `HR Leave Overrides` with explicit override flags. Do not edit the generated sync sheet directly.

## Manual override / reset semantics

`setPrivateLeaveOverride('STAFF123','2026-10-24','reason','Manager-approved change')` updates just the Reason. An empty string with the override flag enabled intentionally blanks that field. Existing Note/Time values are unaffected.

`resetPrivateLeaveFieldToSheet('STAFF123','2026-10-24','reason')` clears that field's override flag and refreshes from the tracker. The other field stays overridden. Both functions require an approved script administrator identity.

## Not yet connected

**This is staging, not a completed application integration.** The existing public GitHub Pages dashboard uses anonymous Firebase authentication and stores notes/reasons in broadly accessible Firestore paths. Do **not** copy the HR Leave Sync tab to those paths or expose this spreadsheet with a publicly accessible Apps Script web app.

To make Note/Time + Reason available inside the dashboard with an actual **Reset to Sheet** button, the dashboard must first support verified Google HR sign-in and a server-validated restricted read/write path. Until then, use the private HR spreadsheet.

The existing Cloud Run jobs/services can remain idle; removal should be done only after validating the replacement and reviewing dependent services. There is no longer a need to continue debugging private ingress for this Apps Script sync.
