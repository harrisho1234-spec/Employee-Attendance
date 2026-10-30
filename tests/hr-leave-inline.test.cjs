const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync('hr-leave-inline.js','utf8').replace(/^import .*;\r?\n/gm,'');
const key='TEST-031_Oct_30_2026';
const row=(manual=false)=>`<div><span data-hr-note="${key}" data-hr-manual="${manual}" data-hr-types="H-UP"><span class="truncate">${manual?'Manual note':'Add Note'}</span></span><input data-hr-reason="${key}" data-hr-manual="${manual}" value="${manual?'Manual reason':''}"></div>`;
function setup({manual=false}={}){
 const dom=new JSDOM(`<div id="dailyView"><button title="Refresh Daily Attendance"></button><div id="dailyTableBody">${row(manual)}</div><div id="dailyMobileCards">${row(manual)}</div></div><div id="noteEditModal"><input id="editNoteId"><textarea id="editNoteText"></textarea><select id="editNoteDropdown"></select><button onclick="saveNoteEdit()"></button></div>`,{runScripts:'outside-only',url:'https://example.test'});
 const w=dom.window,calls=[],publicWrites=[];
 let entry={staffId:'TEST-031',date:'2026-10-30',leaveType:'SL',noteTime:{value:'Morning',origin:'sheet'},reason:{value:'Synthetic private reason',origin:'sheet'}};
 w.initializeApp=()=>({});w.getAuth=()=>w.authStub;w.authStub={currentUser:{getIdToken:async()=> 'test'}};
 w.onAuthStateChanged=()=>{};w.setInterval=()=>1;w.clearInterval=()=>{};w.GoogleAuthProvider=function(){};w.signOut=async()=>{};w.signInWithPopup=async()=>{};
 w.alert=()=>{};w.confirm=()=>true;w.closeNoteEdit=()=>{};
 w.saveReason=(...args)=>publicWrites.push(args);w.saveNoteEdit=()=>publicWrites.push('note');w.openNoteEdit=()=>{};
 w.fetch=async(url,opts)=>{calls.push({url,opts});return {ok:true,status:200,json:async()=>({entry})};};
 w.eval(source+'\nwindow.harness={parseKey,findFields,fetchEntry,renderCells,revoke,synchronize,write,leaveWarning,installNativeEditing,installStatus,activate(){authorized=true;},entry(key){return getEntry(key);}};');
 const h=w.harness;h.activate();h.installNativeEditing();h.installStatus();
 return {w,h,calls,publicWrites,setEntry(value){entry=value;},close:()=>w.close()};
}
test('Staff ID/date match fills desktop AND mobile, warns, leaves code unchanged',async()=>{
 const t=setup();try{
  await t.h.synchronize();
  assert.equal(t.calls.length,1);const url=new URL(t.calls[0].url);
  assert.deepEqual([...url.searchParams.keys()],['staffId','date']);
  assert.equal(url.searchParams.get('staffId'),'TEST-031');assert.equal(url.searchParams.get('date'),'2026-10-30');
  for(const scope of ['dailyTableBody','dailyMobileCards']){
   const el=t.w.document.getElementById(scope);
   assert.equal(el.querySelector('.truncate').textContent,'Morning');assert.equal(el.querySelector('input').value,'Synthetic private reason');
   assert.equal(el.querySelector('[data-hr-types]').dataset.hrTypes,'H-UP');assert.match(el.querySelector('.hr-leave-warning').title,/HR SL \/ attendance H-UP/);
  }
  assert.match(t.w.document.querySelector('#dailyView > button + button').textContent,/1 matched \/ 1 checked • 1 reasons displayed • 1 type warnings/);
  assert.equal(t.w.localStorage.length,0);assert.deepEqual(t.publicWrites,[]);
 }finally{t.close();}
});
test('explicit legacy overrides survive sync; non-manual sheet notes can update',async()=>{
 const t=setup({manual:true});try{
  await t.h.synchronize();assert.equal(t.w.document.querySelector('.truncate').textContent,'Manual note');assert.equal(t.w.document.querySelector('[data-hr-reason]').value,'Manual reason');
  t.w.document.querySelector('[data-hr-note]').dataset.hrManual='false';t.h.renderCells();assert.equal(t.w.document.querySelector('.truncate').textContent,'Morning');
 }finally{t.close();}
});
test('private manual blank values take priority and reset restores sheet values in both views',async()=>{
 const t=setup({manual:true});try{
  t.setEntry({staffId:'TEST-031',date:'2026-10-30',leaveType:'SL',noteTime:{value:'',origin:'manual'},reason:{value:'',origin:'manual'}});
  await t.h.synchronize();assert.equal(t.w.document.querySelector('.truncate').textContent,'—');assert.equal(t.w.document.querySelector('[data-hr-reason]').value,'');
  t.setEntry({staffId:'TEST-031',date:'2026-10-30',leaveType:'SL',noteTime:{value:'Morning',origin:'sheet'},reason:{value:'Reset value',origin:'sheet'}});
  await t.h.write(key,'reason','',true);
  assert.ok(t.calls.some(x=>x.url.endsWith('/reset')));assert.ok([...t.w.document.querySelectorAll('[data-hr-reason]')].every(x=>x.value==='Reset value'));
 }finally{t.close();}
});
test('sign-out scrubs both views and modal; stale blur never writes private text publicly',async()=>{
 const t=setup();try{
  await t.h.synchronize();t.w.document.getElementById('editNoteText').value='Private note';t.h.revoke();
  assert.ok([...t.w.document.querySelectorAll('[data-hr-reason]')].every(x=>x.value===''));assert.equal(t.w.document.querySelector('.truncate').textContent,'Add Note');
  assert.equal(t.w.document.querySelectorAll('.hr-leave-warning,.hr-reset-reason').length,0);assert.equal(t.w.document.getElementById('editNoteText').value,'');
  t.w.saveReason(key,'Synthetic private reason');assert.deepEqual(t.publicWrites,[]);
 }finally{t.close();}
});
test('response arriving after sign-out cannot repopulate cache or DOM',async()=>{
 const t=setup();try{
  let release;t.w.fetch=()=>new Promise(resolve=>{release=resolve;});const pending=t.h.fetchEntry(key);await new Promise(resolve=>setImmediate(resolve));
  t.h.revoke();release({ok:true,status:200,json:async()=>({entry:{staffId:'TEST-031',date:'2026-10-30'}})});
  await assert.rejects(pending,/session changed/);assert.equal(t.h.entry(key),undefined);assert.equal(t.w.document.querySelector('[data-hr-reason]').value,'');
 }finally{t.close();}
});
test('access denial clears previously visible private values',async()=>{
 const t=setup();try{
  await t.h.synchronize();t.w.fetch=async()=>({status:403,ok:false});await assert.rejects(t.h.fetchEntry(key),/access denied/);
  assert.equal(t.w.document.querySelector('[data-hr-reason]').value,'');assert.equal(t.h.entry(key),undefined);
 }finally{t.close();}
});
test('abbreviated/full month keys match; invalid/historical dates and wrong identity are rejected',async()=>{
 const t=setup();try{
  assert.equal(t.h.parseKey('TEST-031_October_30_2026').date,'2026-10-30');assert.equal(t.h.parseKey('TEST-031_Oct_24_2026'),null);assert.equal(t.h.parseKey('TEST-031_Feb_30_2027'),null);
  t.setEntry({staffId:'OTHER',date:'2026-10-30'});await assert.rejects(t.h.fetchEntry(key),/identity mismatch/);
  assert.equal(t.h.entry(key),undefined);
 }finally{t.close();}
});
test('half-day equivalent type does not warn; unchanged blur does not create override',async()=>{
 const t=setup();try{
  assert.equal(t.h.leaveWarning({leaveType:'SL'},'H-SL'),'');assert.equal(t.h.leaveWarning({},'H-UP'),'');
  await t.h.synchronize();t.w.saveReason(key,'Synthetic private reason');assert.equal(t.calls.length,1);assert.deepEqual(t.publicWrites,[]);
 }finally{t.close();}
});
