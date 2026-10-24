/**
 * Trusted backend only; never put service credentials in the browser.
 * The caller must separately enforce HR allowlist/custom claims.
 */
export function firebaseAdminVerifier(adminAuth) {
  if(!adminAuth || typeof adminAuth.verifyIdToken!=='function')throw new Error('Firebase Admin Auth required');
  return async (token,checkRevoked=true) => {
    if(typeof token!=='string'||token.length>8192)throw new Error('UNAUTHENTICATED');
    return adminAuth.verifyIdToken(token,checkRevoked);
  };
}
