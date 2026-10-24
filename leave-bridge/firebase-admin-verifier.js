/**
 * Trusted backend only; never put service credentials in the browser.
 * The caller must separately enforce HR allowlist/custom claims.
 */
export function firebaseAdminVerifier(adminAuth) {
  if(!adminAuth || typeof adminAuth.verifyIdToken!=='function')throw new Error('Firebase Admin Auth required');
  return async (token,checkRevoked=true) => {
    if(typeof token!=='string'||token.length===0||token.length>8192)throw new Error('UNAUTHENTICATED');
    if (!checkRevoked) return adminAuth.verifyIdToken(token,false);
    try {
      return await adminAuth.verifyIdToken(token,true);
    } catch (e) {
      if(e?.code==='auth/internal-error') {
        // Diagnostic only: validate signature and claims independently, then
        // fail CLOSED. Never return claims unless revoked-token check also passed.
        try {
          await adminAuth.verifyIdToken(token,false);
          const wrapped=new Error('HR_DIAGNOSTIC_REVOCATION_CHECK');
          wrapped.cause=e;
          // Only stable, allowlisted metadata is safe to log; never log SDK error messages or objects.
          const message=String(e?.message||'').toLowerCase();
          const hints=[['permission','permission'],['credential','credential'],['quota','quota'],['timeout','timeout'],['network','network'],['project','project'],['identitytoolkit','identitytoolkit']];
          const hint=hints.find(([term])=>message.includes(term))?.[1]||'unspecified';
          console.error('HR_REVOCATION_DETAIL','hint',hint);
          throw wrapped;
        } catch (probeError) {
          if(probeError?.message==='HR_DIAGNOSTIC_REVOCATION_CHECK') throw probeError;
          const wrapped=new Error('HR_DIAGNOSTIC_TOKEN_VERIFICATION');
          wrapped.cause=probeError;
          throw wrapped;
        }
      }
      throw e;
    }
  };
}
