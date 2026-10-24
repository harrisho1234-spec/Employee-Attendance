import test from 'node:test';
import assert from 'node:assert/strict';
import {authenticateHr,createPrivateHrOperations,validateKey} from './private-hr-operations.js';
const allow=new Set(['hr@example.org']);
const verify=async token=>{
 if(token==='valid')return {uid:'u1',email:'hr@example.org',email_verified:true,firebase:{sign_in_provider:'google.com'}};
 if(token==='anonymous')return {uid:'u2',firebase:{sign_in_provider:'anonymous'}};
 return {uid:'u3',email:'other@example.org',email_verified:true,firebase:{sign_in_provider:'google.com'}};
};
const source={staffId:'ITC-001',date:'2026-10-24',noteTime:'Morning',reason:'private'};
function setup(){
 const mem=new Map();
 const storage={
  get:async key=>mem.get(key)||{},
  updateField:async (key,field,v)=>mem.set(key,{...(mem.get(key)||{}),[field]:v}),
  deleteField:async (key,field)=>{const next={...(mem.get(key)||{})}; delete next[field];mem.set(key,next);}
 };
 return createPrivateHrOperations({readSource:async()=>source,storage,verifyIdToken:verify,approvedEmails:allow});
}
test('missing ID token rejects private read',async()=>assert.rejects(setup().read({staffId:'ITC-001',date:'2026-10-24'}),/UNAUTHENTICATED/));
test('anonymous token denies HR',async()=>assert.rejects(authenticateHr('Bearer anonymous',verify,allow),/UNAUTHENTICATED/));
test('unapproved user cannot read',async()=>assert.rejects(authenticateHr('Bearer other',verify,allow),/PERMISSION_DENIED/));
test('approved Google account can read source',async()=>{
 const x=await setup().read({authorization:'Bearer valid',staffId:'ITC-001',date:'2026-10-24'});
 assert.equal(x.reason.value,'private');
});
test('private manual override and reset produce expected source value',async()=>{
 const ops=setup(),args={authorization:'Bearer valid',staffId:'ITC-001',date:'2026-10-24'};
 await ops.update({...args,field:'reason',value:'manual'});
 assert.equal((await ops.read(args)).reason.value,'manual');
 await ops.reset({...args,field:'reason'});
 assert.equal((await ops.read(args)).reason.value,'private');
});
test('deny invalid field and malformed date',async()=>{
 const ops=setup(),args={authorization:'Bearer valid',staffId:'ITC-001',date:'2026-10-24'};
 await assert.rejects(ops.update({...args,field:'leaveQuota',value:'0'}),/INVALID_FIELD/);
 assert.throws(()=>validateKey('ITC-001','2026-02-30'),/INVALID_KEY/);
});
