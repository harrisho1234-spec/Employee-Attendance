/**
 * Restricted HR sign-in client utilities (module; not wired into public UI).
 * Secure *only when* backend validates Firebase ID tokens and private rules.
 * Never put Cloud Run identity tokens or leave-bridge shared secret in client JS.
 */
export async function requireVerifiedHrLogin(auth, signInWithPopup, GoogleAuthProvider) {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  const user = result?.user;
  if (!user || user.isAnonymous || !user.emailVerified) {
    throw new Error('Verified Google sign-in required');
  }
  // Login alone is NOT HR authorization. Server-side custom claims are required.
  const token = await user.getIdTokenResult(true);
  if (token.claims.hr_access !== true &&
      user.email?.toLowerCase() !== 'harris.ho1234@gmail.com') {
    throw new Error('HR access not granted');
  }
  return { uid:user.uid, email:user.email };
}
