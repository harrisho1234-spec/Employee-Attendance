/**
 * Private Telegram leave values in the EXISTING Daily Attendance controls.
 * Firebase Auth is separate from legacy anonymous attendance auth.
 * Never persist private values to customNotes/customReasons or public Firestore.
 */
import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
const app=initializeApp({apiKey:'AIzaSyB4fUTVdVt9cjKjIzj63a0KJ3bEaIXRzWY',authDomain:'daily-attendance-structure.firebaseapp.com',projectId:'daily-attendance-structure',appId:'1:321384539910:web:c81475cd6d4d8cedcea087'},'attendance-private-hr');
const auth=getAuth(app), endpoint='https://leave-hr-browser-gateway-916969515475.asia-southeast1.run.app';
const entries=new Map(), TTL=120000;
let authorized=false, loading=false, generation=0, queued=false;
function parseKey(key) {
 const m=/^([A-Za-z0-9_-]{1,48})_([A-Za-z]+)_(\d{1,2})_(20\d{2})$/.exec(key||'');
 if(!m)return null;
 const mon=['january','february','march','april','may','june','july','august','september','october','november','december'].indexOf(m[2].toLowerCase());
 return mon<0?null:{staffId:m[1],date:m[4]+'-'+String(mon+1).padStart(2,'0')+'-'+m[3].padStart(2,'0')};
}
async function api(path,options={}) {
 const user=auth.currentUser;
 if(!user||user.isAnonymous)throw Error('HR authentication required');
 const response=await fetch(endpoint+path,{...options,credentials:'omit',cache:'no-store',headers:{'X-Firebase-Id-Token':await user.getIdToken(),...options.headers}});
 if(response.status===403){authorized=false;entries.clear();throw Error('HR access denied');}
 if(!response.ok)throw Error('Private HR connection error ('+response.status+')');
 return response.json();
}
const getEntry=key=>entries.get(key)?.entry;
async function fetchEntry(key) {
 const identity=parseKey(key);if(!identity)return null;
 const value=(await api('/internal/hr/entry?'+new URLSearchParams(identity))).entry;
 entries.set(key,{entry:value,loaded:Date.now()});
 return value;
}
async function write(key,field,value,reset=false){
 const identity=parseKey(key);if(!identity)throw Error('Invalid employee/date');
 const data={...identity,field};
 if(!reset)data.value=value;
 await api('/internal/hr/'+(reset?'reset':'override'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 entries.delete(key);
 await fetchEntry(key);
 renderCells();
}
function findFields() {
 const map=new Map();
 document.querySelectorAll('[data-hr-note],[data-hr-reason]').forEach(el=>{
  const key=el.getAttribute('data-hr-note')||el.getAttribute('data-hr-reason');
  if(!parseKey(key))return;
  const item=map.get(key)||{};
  item[el.hasAttribute('data-hr-note')?'note':'reason']=el;
  map.set(key,item);
 });
 return map;
}
function renderCells(){
 if(!authorized)return;
 for(const [key,els] of findFields()){
  const entry=getEntry(key);if(!entry)continue;
  const note=els.note?.querySelector('span.truncate');
  if(note){note.textContent=entry.noteTime?.value||'—';note.title='Private HR: '+(entry.noteTime?.origin||'sheet');}
  if(els.reason){
   if(document.activeElement!==els.reason)els.reason.value=entry.reason?.value||'';
   els.reason.title='Private HR: '+(entry.reason?.origin||'sheet');
   if(!els.reason.nextElementSibling?.classList.contains('hr-reset-reason')){
    const reset=document.createElement('button');
    reset.type='button';reset.className='hr-reset-reason';reset.textContent='↺';
    reset.title='Reset Reason to Telegram Sheet';reset.setAttribute('aria-label','Reset Reason to Sheet');
    reset.style.cssText='font-size:14px;padding:2px 5px;color:#475569';
    reset.addEventListener('click',async e=>{e.preventDefault();e.stopPropagation();
      if(!confirm('Reset reason to the Telegram Sheet value?'))return;
      try{await write(key,'reason','',true);}catch(err){alert(err.message);}
    });
    els.reason.insertAdjacentElement('afterend',reset);
   }
  }
 }
}
async function synchronize(){
 if(!authorized||loading)return;loading=true;const run=++generation;
 try{
  const keys=[...findFields().keys()].filter(k=>!entries.has(k)||Date.now()-entries.get(k).loaded>TTL);
  let next=0;
  async function worker(){while(next<keys.length&&authorized&&generation===run){
   const key=keys[next++];
   try{await fetchEntry(key);if(generation===run)renderCells();}catch(e){setStatus(e.message);return;}
  }}
  await Promise.all(Array.from({length:Math.min(4,keys.length)},worker));
 }finally{loading=false;}
}
function schedule(){if(queued||!authorized)return;queued=true;queueMicrotask(()=>{queued=false;synchronize();renderCells();});}
let statusButton;
function setStatus(text){if(statusButton)statusButton.textContent=text;}
function installStatus(){
 if(statusButton)return;
 const refresh=[...document.querySelectorAll('button')].find(b=>/^\s*Refresh\s*$/.test(b.textContent));
 if(!refresh)return;
 statusButton=document.createElement('button');statusButton.type='button';
 statusButton.className=refresh.className;
 statusButton.style.cssText='background:#e2e8f0;color:#334155';
 refresh.insertAdjacentElement('afterend',statusButton);
 statusButton.addEventListener('click',async()=>{
  if(authorized){await signOut(auth);return;}
  try{await signInWithPopup(auth,new GoogleAuthProvider());}catch(e){setStatus('HR sign-in unavailable');}
 });
 setStatus('Connect HR');
}
function installResetNote(){
 const save=document.querySelector('#noteEditModal button[onclick*="saveNoteEdit"]');
 if(!save||document.getElementById('hrResetNote'))return;
 const b=document.createElement('button');b.id='hrResetNote';b.type='button';b.textContent='Reset to Sheet';
 b.className=save.className;b.style.cssText='background:#475569;color:white;margin-left:8px';
 b.addEventListener('click',async()=>{
  const key=document.getElementById('editNoteId')?.value;
  if(!authorized||!getEntry(key))return;
  if(!confirm('Reset Note/Time to the Telegram Sheet value?'))return;
  try{await write(key,'noteTime','',true);window.closeNoteEdit();}catch(e){alert(e.message);}
 });
 save.insertAdjacentElement('afterend',b);
}
function installNativeEditing(){
 if(typeof window.saveReason!=='function'||typeof window.saveNoteEdit!=='function'||typeof window.openNoteEdit!=='function')return false;
 if(window.__privateHrInlineInstalled)return true;
 window.__privateHrInlineInstalled=true;
 const originalReason=window.saveReason;
 window.saveReason=function(key,value){
  if(authorized&&!entries.has(key)){alert('Please allow HR synchronization to finish before editing.');return;}
  if(authorized&&getEntry(key)){
   write(key,'reason',value).catch(err=>{alert(err.message);renderCells();});
   return;
  }
  return originalReason.apply(this,arguments);
 };
 const originalNoteOpen=window.openNoteEdit;
 window.openNoteEdit=function(event,key,value){
  const entry=authorized&&getEntry(key);
  const result=originalNoteOpen.call(this,event,key,entry?entry.noteTime?.value||'':value);
  const reset=document.getElementById('hrResetNote');
  if(reset)reset.hidden=!entry;
  return result;
 };
 const originalNoteSave=window.saveNoteEdit;
 window.saveNoteEdit=function(){
  const key=document.getElementById('editNoteId')?.value;
  if(authorized&&!entries.has(key)){alert('Please allow HR synchronization to finish before editing.');return;}
  if(authorized&&getEntry(key)){
   const val=document.getElementById('editNoteText')?.value?.trim()||'';
   write(key,'noteTime',val).then(()=>window.closeNoteEdit()).catch(e=>alert(e.message));
   return;
  }
  return originalNoteSave.apply(this,arguments);
 };
 installResetNote();return true;
}
onAuthStateChanged(auth,async user=>{
 generation++;authorized=false;entries.clear();
 installStatus();installNativeEditing();
 if(!user||user.isAnonymous){setStatus('Connect HR');return;}
 setStatus('Checking HR access…');
 try{
  await api('/internal/hr/entry?staffId=PERMISSIONCHECK&date=2026-01-01');
  authorized=true;setStatus('HR Sync connected');schedule();
 }catch(e){setStatus(e.message);}
});
const boot=setInterval(()=>{installStatus();if(installNativeEditing())clearInterval(boot);},500);
// Observe attendance row replacements only; private UI insertions must not trigger full rescans.
const attendanceObserver=new MutationObserver(mutations=>{
 if(!authorized)return;
 if(mutations.some(m=>[...m.addedNodes].some(n=>n.nodeType===1 && (n.matches?.('[data-hr-note],[data-hr-reason],tr')||n.querySelector?.('[data-hr-note],[data-hr-reason]')))))schedule();
});
const attendanceTable=document.querySelector('#dailyTableBody');
if(attendanceTable)attendanceObserver.observe(attendanceTable,{childList:true,subtree:true});
setInterval(()=>{if(authorized){entries.clear();schedule();}},5*60*1000);
