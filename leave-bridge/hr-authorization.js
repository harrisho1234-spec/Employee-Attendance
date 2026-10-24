/**
 * Verify an identity supplied by a trusted server only.
 * NEVER trust a role, email, or identity supplied in a browser JSON body.
 * Actual token verification (OIDC/Firebase Admin) belongs before this gate.
 */
export function requireHrPrincipal(principal, approvedEmails) {
  if (!principal || principal.verified !== true || principal.anonymous === true) {
    throw new Error('UNAUTHENTICATED');
  }
  const email = String(principal.email || '').trim().toLowerCase();
  if (!email || principal.emailVerified !== true) throw new Error('UNAUTHENTICATED');
  if (!(approvedEmails instanceof Set) || !approvedEmails.has(email)) {
    throw new Error('PERMISSION_DENIED');
  }
  return {uid:String(principal.uid || ''), email};
}
export function approveHrOperation(principal, approvedEmails, operation) {
  const user = requireHrPrincipal(principal,approvedEmails);
  if (!['readLeave','saveOverride','resetToSheet'].includes(operation)) {
    throw new Error('INVALID_OPERATION');
  }
  return {user,operation};
}
