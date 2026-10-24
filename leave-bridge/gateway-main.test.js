import test from 'node:test';
import assert from 'node:assert/strict';
import {createGatewayServer} from './gateway-main.js';

test('gateway refuses to start without explicit enablement',async()=>{
 await assert.rejects(createGatewayServer({env:{}}),/Gateway disabled/);
});
test('gateway rejects incomplete configuration without initializing credentials',async()=>{
 await assert.rejects(createGatewayServer({env:{ENABLE_HR_GATEWAY:'true'},googleAuth:{}}),/Missing gateway configuration/);
});
test('gateway rejects mismatched Firebase project',async()=>{
 const env={
  ENABLE_HR_GATEWAY:'true',
  LEAVE_BRIDGE_URL:'https://leave-bridge-916969515475.asia-southeast1.run.app',
  FIREBASE_PROJECT_ID:'daily-attendance-structure',
  FIREBASE_APP_ID:'test-app',
  HR_APPROVED_EMAILS:'hr@example.org',
  HR_ALLOWED_ORIGIN:'https://harrisho1234-spec.github.io'
 };
 await assert.rejects(createGatewayServer({
  env,googleAuth:{},
  initializeFirebase:async()=>({projectId:'different-project'})
 }),/Firebase project mismatch/);
});
