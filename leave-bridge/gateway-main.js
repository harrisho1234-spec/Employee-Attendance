import http from 'node:http';
import {google} from 'googleapis';
import {initializeFirebaseAdmin} from './hr-runtime.js';
import {createBridgeSource} from './bridge-source-client.js';
import {firestoreOverrideStorage} from './firestore-override-storage.js';
import {firebaseAdminVerifier} from './firebase-admin-verifier.js';
import {createPrivateHrOperations,parseApprovedEmails} from './private-hr-operations.js';
import {createHrGateway} from './hr-gateway.js';

export async function createGatewayServer({env, googleAuth, initializeFirebase=initializeFirebaseAdmin, fetchImpl=fetch}) {
  if (env.ENABLE_HR_GATEWAY !== 'true') throw new Error('Gateway disabled');
  const keys=['LEAVE_BRIDGE_URL','FIREBASE_PROJECT_ID','FIREBASE_APP_ID','HR_APPROVED_EMAILS','HR_ALLOWED_ORIGIN'];
  for(const key of keys) if(!env[key]) throw new Error('Missing gateway configuration: '+key);
  const allowlist=parseApprovedEmails(env.HR_APPROVED_EMAILS);
  if(!allowlist.size) throw new Error('Empty HR allowlist');
  const {auth,db,projectId}=await initializeFirebase(env.FIREBASE_PROJECT_ID);
  if(projectId!==env.FIREBASE_PROJECT_ID) throw new Error('Firebase project mismatch');
  const source=createBridgeSource({
    url:env.LEAVE_BRIDGE_URL,
    getIdTokenClient:audience=>googleAuth.getIdTokenClient(audience),
    fetchImpl
  });
  const operations=createPrivateHrOperations({
    readSource:source,
    storage:firestoreOverrideStorage(db,env.FIREBASE_APP_ID),
    verifyIdToken:firebaseAdminVerifier(auth),
    approvedEmails:allowlist
  });
  return createHrGateway(operations,env.HR_ALLOWED_ORIGIN);
}

if(process.env.NODE_ENV!=='test' && process.argv[1]?.endsWith('gateway-main.js')) {
  try {
    const handler=await createGatewayServer({env:process.env,googleAuth:new google.auth.GoogleAuth()});
    http.createServer(handler).listen(Number(process.env.PORT||8080),'0.0.0.0',
      ()=>console.log('HR gateway initialized'));
  } catch(error) {
    // Never print tokens, request payloads, email allowlist or employee data.
    console.error('HR gateway startup configuration failed:',error.name);
    process.exitCode=1;
  }
}
