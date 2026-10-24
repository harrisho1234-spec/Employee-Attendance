/**
 * Server-only client for IAM-protected Leave Bridge.
 * The target service must retain internal ingress and Cloud Run Invoker IAM.
 * Never ship this module or Google-issued ID tokens to GitHub Pages clients.
 */
export function createBridgeSource({url, getIdTokenClient, fetchImpl=fetch}) {
  const root = new URL(url);
  if (root.protocol !== 'https:' || !root.hostname.endsWith('.run.app') ||
      root.username || root.password || root.search || root.hash) {
    throw new Error('Invalid private bridge URL');
  }
  const origin = root.origin;
  const audience = origin;
  return async (staffId,date) => {
    if (!/^[A-Za-z0-9_-]{1,48}$/.test(String(staffId)) ||
        !/^20\d{2}-\d{2}-\d{2}$/.test(String(date))) {
      throw new Error('INVALID_KEY');
    }
    // Google Auth generates a short-lived service ID token for the target audience.
    const client = await getIdTokenClient(audience);
    const headers = await client.getRequestHeaders(origin);
    const idToken = typeof headers.get === 'function'
      ? headers.get('authorization')
      : (headers.Authorization || headers.authorization);
    if (typeof idToken !== 'string' || !idToken.startsWith('Bearer ')) {
      throw new Error('BRIDGE_CREDENTIALS_UNAVAILABLE');
    }
    const requestUrl = new URL('/internal/leave-snapshot',origin);
    requestUrl.searchParams.set('from',date);
    requestUrl.searchParams.set('to',date);
    const response = await fetchImpl(requestUrl.toString(),{
      method:'GET',headers:{Authorization:idToken},
      redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error('BRIDGE_UNAVAILABLE');
    const body=await response.json();
    if (!Array.isArray(body.records)) throw new Error('INVALID_BRIDGE_RESPONSE');
    const matched=body.records.find(row=>row?.staffId===staffId && row?.date===date);
    return matched || null;
  };
}
