# Super Admin-only HR API staging

Current Firebase project: `daily-attendance-structure`. Existing Firebase app ID: `1:321384539910:web:c81475cd6d4d8cedcea087`. Initial allowlisted identity: `harris.ho1234@gmail.com`.

**Do not deploy/enable until an IAM-authenticated trusted server-to-server caller is configured and Firestore security rules are reviewed.** The public GitHub Pages dashboard remains anonymous and cannot directly call the internal-only Cloud Run service.

The backend feature gate is `ENABLE_PRIVATE_HR_API=true`. The other required environment keys are:
- `FIREBASE_PROJECT_ID=daily-attendance-structure`
- `FIREBASE_APP_ID=1:321384539910:web:c81475cd6d4d8cedcea087`
- `HR_APPROVED_EMAILS=harris.ho1234@gmail.com`

Do not set the feature gate in the currently deployed Cloud Run service until an authenticated caller and tests are ready. The server validates each Firebase ID token with Firebase Admin SDK and checks the explicitly configured allowlist. Client role flags are never sufficient.

The Cloud Run service must retain `--ingress internal` and `--no-allow-unauthenticated`, and must not grant `allUsers` or `allAuthenticatedUsers` invoke rights. The runtime identity currently has read access to all three tracker spreadsheets and `roles/datastore.user` on the Firebase project. Review this broad Firestore role before production.

**Security blockers:** Firestore `public/data/customNotes/records` is accessible to anonymous Firebase users under the current deployed rules. Do not save or mirror sensitive leave reasons there. The private API handler is IAM-only and not browser-accessible; a trusted user-facing broker/proxy that validates Firebase users is still needed. Real log schema and edited-request behavior have not been end-to-end tested.

Safe staging acceptance checks:
1. Unit tests all pass; npm audit clean.
2. IAM/ingress restrictions still intact; unauthorized browser cannot reach Cloud Run.
3. Missing, anonymous, unverified and unapproved Firebase identities receive 401/403.
4. An approved test identity can retrieve only authorized records; private values never appear in logs or public collections.
5. Override persistence, reset behavior and cross-user access checks pass with disposable test records.
6. No changes to attendance calculations or source tracker sheets.
