# Gateway ↔ Leave Bridge staging (NOT LIVE)

The new `bridge-source-client.js` uses a short-lived Google-signed ID token with the internal bridge's Cloud Run URL as audience, sent only server-to-server. It filters one employee/date from the returned daily snapshot. A 403/timeout fails closed. This is a module, not yet invoked by a deployed gateway.

## Required topology

- Existing `leave-bridge` remains `--ingress internal --no-allow-unauthenticated`.
- Deploy any future HR gateway in the same Google Cloud project with appropriate internal connectivity to Cloud Run; this must be verified because Cloud Run internal ingress rules depend on network origin and routing.
- Create a dedicated gateway service account and grant `roles/run.invoker` on **only** `leave-bridge`. Do not use a static service account key. Use `GoogleAuth.getIdTokenClient(BRIDGE_URL)` within the gateway. Never pass tokens to browser JS.
- Browser-facing endpoint must verify Firebase ID tokens against `daily-attendance-structure` and enforce approved HR identities on every operation. CORS alone does not authorize callers.
- The gateway needs restricted Firestore IAM; production IAM permissions should be reviewed for least privilege. Use a separate service account instead of sharing the bridge runtime identity.

## Integration still required

The gateway HTTP adapter is not deployed or initialized. No public HTTPS endpoint is configured. The real Firebase login in GitHub Pages and its Note/Time, Reason, manual override and Reset to Sheet controls are not wired. Existing custom notes/reasons in anonymous-accessible `public` Firestore storage require remediation. Source log record mappings, edited/cancelled requests, and split entries need live non-sensitive validation. No automatic synchronization is active.

Run `npm test` before any further deployment, keep this PR in draft, and do not enable the private API feature gate until the entire request path has passed production authorization tests.
