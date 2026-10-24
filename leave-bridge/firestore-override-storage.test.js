import test from 'node:test';
import assert from 'node:assert/strict';
import {firestoreOverrideStorage} from './firestore-override-storage.js';
function fakeDb(){
 const data=new Map();
 const db={
  collection:()=>({doc:()=>({collection:()=>({doc:key=>({key,get:async()=>({exists:data.has(key),data:()=>data.get(key)})})})})}),
  runTransaction:async fn=>fn({
    get:async ref=>({exists:data.has(ref.key),data:()=>data.get(ref.key)}),
    set:(ref,value)=>data.set(ref.key,value)
  })
 };
 return {db,data};
}
test('private overrides persist without changing independent fields',async()=>{
 const {db}=fakeDb(),s=firestoreOverrideStorage(db,'app-id'),key='ITC-001_2026-10-24';
 await s.updateField(key,'noteTime',{present:true,value:'Morning'},'hr1');
 await s.updateField(key,'reason',{present:true,value:'Corrected'},'hr1');
 assert.equal((await s.get(key)).noteTime.value,'Morning');
 assert.equal((await s.get(key)).reason.value,'Corrected');
 await s.deleteField(key,'reason','hr1');
 assert.equal((await s.get(key)).noteTime.value,'Morning');
 assert.equal((await s.get(key)).reason,undefined);
});
test('rejects unexpected fields and path keys',async()=>{
 const {db}=fakeDb(),s=firestoreOverrideStorage(db,'app-id');
 await assert.rejects(s.updateField('bad/path','reason',{value:'x'},'hr'),/Invalid override key/);
 await assert.rejects(s.deleteField('ITC-001_2026-10-24','quota','hr'),/Invalid field/);
});
