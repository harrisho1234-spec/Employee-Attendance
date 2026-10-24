import {createPrivateHrOperations,parseApprovedEmails} from './private-hr-operations.js';
import {createPrivateHrApi} from './private-hr-api.js';
import {firebaseAdminVerifier} from './firebase-admin-verifier.js';
import {firestoreOverrideStorage} from './firestore-override-storage.js';

/**
 * Builds HR API with server-side Google credentials only.
 * Requires an explicitly configured Firebase project, app ID, and HR allowlist.
 * Never enable private routes by default or initialize from browser-controlled values.
 */
export async function initializeHrRuntime({env,readSource,initializeFirebase}) {
  if (env.ENABLE_PRIVATE_HR_API !== 'true') return null;
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_APP_ID || !env.HR_APPROVED_EMAILS) {
    throw new Error('Private HR API configuration incomplete');
  }
  const allowlist=parseApprovedEmails(env.HR_APPROVED_EMAILS);
  if(allowlist.size===0) throw new Error('HR allowlist empty');
  const {auth,db,projectId}=await initializeFirebase(env.FIREBASE_PROJECT_ID);
  if(projectId!==env.FIREBASE_PROJECT_ID) throw new Error('Firebase project mismatch');
  const operations=createPrivateHrOperations({
    readSource,
    storage:firestoreOverrideStorage(db,env.FIREBASE_APP_ID),
    verifyIdToken:firebaseAdminVerifier(auth),
    approvedEmails:allowlist
  });
  return createPrivateHrApi(operations);
}

/** Called only in the trusted Cloud Run process, never on the client. */
export async function initializeFirebaseAdmin(projectId) {
  const {initializeApp,getApps,applicationDefault}=await import('firebase-admin/app');
  const {getAuth}=await import('firebase-admin/auth');
  const {getFirestore}=await import('firebase-admin/firestore');
  const app=getApps().find(a=>a.name==='leave-hr-backend') ||
    initializeApp({credential:applicationDefault(),projectId},'leave-hr-backend');
  return {auth:getAuth(app),db:getFirestore(app),projectId:app.options.projectId};
}
