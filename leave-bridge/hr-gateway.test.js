import test from 'node:test';
import assert from 'node:assert/strict';
import { createHrGateway } from './hr-gateway.js';
function response() {
  return {headers:{}, status:0, body:'',setHeader(k,v){this.headers[k]=v;},
    writeHead(n){this.status=n;},end(v=''){this.body=v;}};
}
function request(method='GET',origin='https://harrisho1234-spec.github.io') {
  return {method,url:'/internal/hr/entry?staffId=TEST-1&date=2026-10-24',
    headers:{origin}};
}
test('rejects cross-origin requests without opening CORS',async()=>{
  const res=response();
  await createHrGateway({},'https://harrisho1234-spec.github.io')(request('GET','https://evil.example'),res);
  assert.equal(res.status,403);
  assert.equal(res.headers['Access-Control-Allow-Origin'],undefined);
});
test('allows only expected origin during browser preflight',async()=>{
  const gateway=createHrGateway({},'https://harrisho1234-spec.github.io');
  const ok=response(); await gateway(request('OPTIONS'),ok);
  assert.equal(ok.status,204);
  const deny=response();await gateway(request('OPTIONS','https://evil.example'),deny);
  assert.equal(deny.status,403);
});
test('rejects missing Firebase token before calling operations',async()=>{
  const res=response();
  await createHrGateway({read:async()=>{throw new Error('SHOULD_NOT_RUN');}},
    'https://harrisho1234-spec.github.io')(request(),res);
  assert.equal(res.status,401);
});
test('requires an explicit HTTPS origin',()=>{
  assert.throws(()=>createHrGateway({},'*'),/HTTPS origin/);
});
