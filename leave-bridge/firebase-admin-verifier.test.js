import test from 'node:test';
import assert from 'node:assert/strict';
import {firebaseAdminVerifier} from './firebase-admin-verifier.js';
test('delegates token validation and revocation check to Firebase Admin',async()=>{
 let checked;
 const verify=firebaseAdminVerifier({verifyIdToken:async(t,revoked)=>{checked={t,revoked};return {uid:'hr1'};}});
 assert.deepEqual(await verify('valid.token'),{uid:'hr1'});
 assert.deepEqual(checked,{t:'valid.token',revoked:true});
});
test('rejects missing credentials',async()=>{
 const verify=firebaseAdminVerifier({verifyIdToken:async()=>({})});
 await assert.rejects(verify(''),/UNAUTHENTICATED/);
});
