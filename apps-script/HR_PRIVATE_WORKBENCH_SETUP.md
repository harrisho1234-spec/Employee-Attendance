# Private HR Leave Workbench — next-stage integration

The 217 synced tracker records are already available in the separate restricted HR spreadsheet. This implementation provides a **private, spreadsheet-bound HR workbench**, not a public dashboard integration.

## Why the existing public dashboard cannot display these records safely yet

The GitHub Pages dashboard currently uses Firebase anonymous login and `artifacts/{appId}/public/data/customNotes/records` for reasons. With its current Firestore permissions, putting private leave reasons there exposes them to other authenticated (including anonymous) clients. **Do not import or sync the private HR sheet into that collection**, and do not publish Apps Script as an 'execute as me / anyone' web app.

## Install the private HR workbench

1. Open the **restricted destination HR Leave Sync Google Sheet**, and verify sharing is Restricted and every viewer/editor is authorized for the leave reasons.
2. In that spreadsheet, choose **Extensions > Apps Script** to open its **bound** script project. This is separate from the standalone Apps Script that runs the hourly import.
3. Add a script file `hr-private-workbench.gs` with the contents of the matching repository file; add an HTML file named **HRLeaveWorkbench** (Apps Script creates its `.html` extension) from `HRLeaveWorkbench.html`.
4. In **Project settings > Script properties** of **this bound project**, set `HR_ATTENDANCE_SPREADSHEET_ID` to the ID of the restricted spreadsheet and `HR_SYNC_ADMIN_EMAILS` to the approved Google accounts. These properties are project-specific: they are **not inherited** from the standalone sync project.
5. Save, refresh the Google Sheet, then open **Private HR Leave > Open HR Leave Workbench**. The authorized user may be prompted to grant spreadsheet permissions.
6. Look up one staff ID and YYYY-MM-DD date, confirm the expected Note/Time and Reason. Edit one field, click **Save manual override**, and confirm the override is retained after hourly sync.
7. Click **Reset to Sheet** on that same field. Reset clears the override flag; the original source value is restored by the **next scheduled sync**. The other field's manual override is preserved.

No deployment as a public Apps Script Web App is necessary. The sidebar runs within the spreadsheet's existing access boundary; its server functions enforce an account allowlist and a destination spreadsheet ID match.

## Security and availability limitations

- The `HR Leave Sync` and `HR Leave Overrides` sheets both contain sensitive details. Editing or distributing this spreadsheet gives access to those details; approve users and sharing carefully. Sheet protection is not a confidentiality mechanism against editors.
- The sidebar intentionally does **not** expose leave details to the GitHub Pages dashboard. That dashboard still needs verified staff identities and a backend/private Firestore rules redesign, including migration and remediation of its existing public notes/reasons, before an in-dashboard HR-only view is safe.
- This feature preserves attendance calculations by never modifying the existing public dashboard or attendance source sheets.
- Reset is eventual: it takes effect in the private output after the next hourly sync, not immediately. Override creation writes both the override tab and the displayed value; the next sync reconciles them.
- Workbench code is staged in the existing draft branch and has **not** been installed in the user's private bound Apps Script project or run against their live private sheet by this commit.
