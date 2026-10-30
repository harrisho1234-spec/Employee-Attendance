# Staff/date matching gateway update

This patch is based on `feature/private-leave-bridge-20261024`, where the existing gateway source lives. Do not merge that entire historical branch into the current frontend `main`.

Changed runtime files:
- `private-sheet-source.js`: match normalized Staff ID plus calendar date; request unformatted Sheets serial dates so sheet display formatting cannot break matching; accept ISO text dates; fail closed for ambiguous text and duplicate identities. Leave type is never a match filter.
- `override-policy.js`: include source `leaveType` in the already-authorized private response so the frontend can warn without modifying attendance codes. Existing override and reset semantics remain intact.

Validation: `NODE_ENV=test node --test` inside `leave-bridge` (PowerShell: `$env:NODE_ENV='test'; node --test`). All 56 tests pass, including anonymous/non-HR rejection, CORS, override/reset, source matching, and the metadata regression. Tests contain synthetic data and do not read a live employee record.

Deployment:
1. Compare the current deployed gateway revision with this branch. Apply these two runtime files to the currently deployed source baseline if it has newer changes.
2. Build using `Dockerfile.gateway` (not the internal bridge Dockerfile), then deploy the image to the existing `leave-hr-browser-gateway` service in `attendance-leave-sync`, region `asia-southeast1`. Retain its existing runtime service account, private sheet setting, HR email allowlist, Firebase settings, origin, ingress and authentication configuration. Do not reuse the historical deployment helper's hardcoded configuration.
3. Verify the new private response contains `staffId`, ISO `date`, `leaveType`, and resolved note/reason fields for an approved account; missing/invalid tokens and unapproved accounts must still receive 401/403 with no employee data.
4. Deploy the companion frontend branch `fix/private-hr-attendance-sync` to Pages and verify both screen layouts, mismatch badge, unchanged H-UP 0.5, overrides/reset and sign-out. No Apps Script change is required; the source sheet already has the record.

Production deployment and signed-in live verification were not performed by these repository tests. This source commit alone does not update Cloud Run.
