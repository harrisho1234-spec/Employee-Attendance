import { createServer } from 'node:http';
import { createHmac, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { OAuth2Client } from 'google-auth-library';

export function createHandler(config, verify, upstream = fetch) {
    const allowed = new Set(config.allowedEmails.split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
    if (!config.clientId || !allowed.size || !config.origin?.startsWith('https://') ||
        !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(config.scriptUrl) ||
        config.secret?.length < 32 || !config.secret) throw new Error('Incomplete bridge configuration');
    return async (req, res) => {
        res.setHeader('Cache-Control', 'no-store, private');
        res.setHeader('Vary', 'Origin');
        res.setHeader('Content-Type', 'application/json');
        const reply = (status, body) => { res.writeHead(status); res.end(JSON.stringify(body)); };
        if (req.headers.origin !== config.origin) return reply(403, { error: 'Access denied' });
        res.setHeader('Access-Control-Allow-Origin', config.origin);
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        if (req.url !== '/leave') return reply(404, { error: 'Not found' });
        if (req.method === 'OPTIONS') return reply(204, {});
        if (req.method !== 'POST') return reply(405, { error: 'Method not allowed' });
        let user;
        try {
            const token = /^Bearer ([^\s]+)$/.exec(req.headers.authorization || '')?.[1];
            if (!token || token.length > 10000) throw new Error();
            user = await verify(token, config.clientId);
            if (user.email_verified !== true || !allowed.has(user.email?.toLowerCase()) ||
                !(user.email.endsWith('@gmail.com') || user.hd)) throw new Error();
        } catch { return reply(401, { error: 'Sign in with an authorized Google account' }); }
        let input;
        try {
            let body = '';
            for await (const chunk of req) {
                body += chunk;
                if (Buffer.byteLength(body) > 16384) return reply(413, { error: 'Request too large' });
            }
            input = JSON.parse(body);
            if (!['read', 'override', 'reset'].includes(input.action) || !Number.isInteger(input.year) || input.year < 2020 || input.year > 2100) throw new Error();
            if (input.action !== 'read' && (!/^[A-Z0-9-]+_[A-Za-z]+_\d{1,2}_\d{4}$/.test(input.key) || !['note', 'reason'].includes(input.field))) throw new Error();
            if (input.action === 'override' && (typeof input.value !== 'string' || input.value.length > 2000)) throw new Error();
        } catch { return reply(400, { error: 'Invalid request' }); }
        // Only these fields may cross into Apps Script. Identity comes from verified Google claims.
        const payload = JSON.stringify({ action: input.action, year: input.year, key: input.key,
            field: input.field, value: input.value, actor: user.email, timestamp: Date.now(), nonce: randomUUID() });
        const signature = createHmac('sha256', config.secret).update(payload).digest('hex');
        try {
            const response = await upstream(config.scriptUrl, { method: 'POST', redirect: 'follow',
                headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payload, signature }),
                signal: AbortSignal.timeout(30000) });
            const result = await response.json();
            if (!response.ok || !result.ok) throw new Error();
            return reply(200, result);
        } catch { return reply(502, { error: 'Private tracker connection unavailable. Changes were not confirmed.' }); }
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const client = new OAuth2Client();
    const handler = createHandler({ clientId: process.env.GOOGLE_CLIENT_ID, allowedEmails: process.env.ALLOWED_EMAILS || '',
        origin: process.env.APP_ORIGIN, scriptUrl: process.env.APPS_SCRIPT_URL, secret: process.env.BRIDGE_SECRET },
    async (idToken, audience) => (await client.verifyIdToken({ idToken, audience })).getPayload());
    createServer(handler).listen(process.env.PORT || 8080);
}
