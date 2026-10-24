import { createPrivateHrApi } from './private-hr-api.js';

/**
 * Browser-facing gateway, to be deployed independently from the existing
 * IAM-protected, internal-only Leave Bridge.
 * The downstream operations MUST validate Firebase ID tokens and HR allowlist.
 * CORS limits browsers, but is not an authentication mechanism.
 */
export function createHrGateway(operations, allowedOrigin) {
  if (!/^https:\/\/[-a-z0-9.]+$/i.test(allowedOrigin || '')) {
    throw new Error('Explicit HTTPS origin required');
  }
  const api = createPrivateHrApi(operations);
  return async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Vary', 'Origin');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const origin = request.headers?.origin;
    if (origin && origin !== allowedOrigin) {
      response.writeHead(403); response.end(); return;
    }
    if (origin === allowedOrigin) {
      response.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Firebase-Id-Token');
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(origin === allowedOrigin ? 204 : 403);
      response.end(); return;
    }
    if (!request.url?.startsWith('/internal/hr/')) {
      response.writeHead(404); response.end(); return;
    }
    await api(request, response);
  };
}
