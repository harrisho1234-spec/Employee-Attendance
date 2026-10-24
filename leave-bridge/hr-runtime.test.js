import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeHrRuntime} from './hr-runtime.js';
const fakeFirebase=async projectId=>({
  projectId,auth:{verifyIdToken:async()=>({uid:'u',email:'hr@example.org',email_verified:true,firebase:{sign_in_provider:'google.com'}})},
  db:{collection:()=>({doc:()=>({collection:()=>({doc:()=>({})})})})}
});
test('private HR API stays off by default',async()=>{
 const result=await initializeHrRuntime({env:{},readSource:async()=>null,initializeFirebase:()=>{throw Error('should not run')}});
 assert.equal(result,null);
});
test('private HR API refuses incomplete configuration',async()=>{
 await assert.rejects(initializeHrRuntime({env:{ENABLE_PRIVATE_HR_API:'true'},readSource:async()=>null,initializeFirebase:fakeFirebase}),/incomplete/);
});
test('private HR API checks Firebase project identity',async()=>{
 await assert.rejects(initializeHrRuntime({
 env:{ENABLE_PRIVATE_HR_API:'true',FIREBASE_PROJECT_ID:'actual',FIREBASE_APP_ID:'app',HR_APPROVED_EMAILS:'hr@example.org'},
 readSource:async()=>null,
 initializeFirebase:async()=>({...await fakeFirebase('wrong'),projectId:'wrong'})
 }),/mismatch/);
});
test('existing bridge route remains closed when private API disabled',async()=>{
 const {createHandler}=await import('./server.js');
 const headers={};
 const response={setHeader(k,v){headers[k]=v},writeHead(code){this.code=code},end(body){this.body=JSON.parse(body)}};
 await createHandler(async()=>[] )({method:'GET',url:'/internal/hr/entry'},response);
 assert.equal(response.code,404);
 assert.equal(headers['Access-Control-Allow-Origin'],undefined);
});

test('enabled HR API enforces Super Admin allowlist for live request',async()=>{
 const env={ENABLE_PRIVATE_HR_API:'true',FIREBASE_PROJECT_ID:'daily-attendance-structure',FIREBASE_APP_ID:'1:321384539910:web:c81475cd6d4d8cedcea087',HR_APPROVED_EMAILS:'harris.ho1234@gmail.com'};
 const identity=async()=>({projectId:env.FIREBASE_PROJECT_ID,auth:{verifyIdToken:async()=>({uid:'test',email:'not-authorized@example.com',email_verified:true,firebase:{sign_in_provider:'google.com'}})},db:{collection:()=>({doc:()=>({collection:()=>({doc:()=>({})})})})}});
 const api=await initializeHrRuntime({env,readSource:async()=>{throw Error('must not reach source')},initializeFirebase:identity});
 const response={setHeader(){},writeHead(code){this.code=code},end(body){this.body=JSON.parse(body)}};
 await api({method:'GET',url:'/internal/hr/entry?staffId=ITC-001&date=2026-10-24',headers:{'x-firebase-id-token':'testing.token'}},response);
 assert.equal(response.code,403);
 assert.equal(response.body.entry,undefined);
});
