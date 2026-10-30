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
const originals=new Map(), privateKeys=new Set(), resetFields=new Set();
const FIRST_AUTO_LEAVE_DATE='2026-10-25';
let authorized=false, loading=false, generation=0, queued=false, syncError='';
let statusButton;
function parseKey(key) {
 const m=/^([A-Za-z0-9_-]{1,48})_([A-Za-z]+)_(\d{1,2})_(20\d{2})$/.exec(key||'');
 if(!m)return null;
 const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
 const mon=months.findIndex(x=>x===m[2].toLowerCase()||x.slice(0,3)===m[2].toLowerCase());
 const date=m[4]+'-'+String(mon+1).padStart(2,'0')+'-'+m[3].padStart(2,'0');
 const day=new Date(date+'T00:00:00Z');
 if(mon<0||date<FIRST_AUTO_LEAVE_DATE||Number.isNaN(day.getTime())||day.toISOString().slice(0,10)!==date)return null;
 return {staffId:m[1].toUpperCase(),date};
}
function findFields() {
 const map=new Map();
 document.querySelectorAll('[data-hr-note],[data-hr-reason]').forEach(el=>{
  const key=el.getAttribute('data-hr-note')||el.getAttribute('data-hr-reason');
  if(!parseKey(key))return;
  const item=map.get(key)||{notes:[],reasons:[]};
  item[el.hasAttribute('data-hr-note')?'notes':'reasons'].push(el);
  map.set(key,item);
 });
 return map;
}
const getEntry=key=>entries.get(key)?.entry;
function remember(el,field){
 if(!originals.has(el))originals.set(el,{field,value:field==='reason'?el.value:el.textContent,title:el.getAttribute('title')});
}
function restore(el,original){
 if(original.field==='reason')el.value=original.value;else el.textContent=original.value;
 if(original.title===null)el.removeAttribute('title');else el.title=original.title;
}
function clearPrivateDisplay(){
 for(const [el,original] of originals)restore(el,original);
 originals.clear();
 document.querySelectorAll('.hr-reset-reason,.hr-leave-warning').forEach(el=>el.remove());
 const input=document.getElementById('editNoteText');if(input)input.value='';
 const dropdown=document.getElementById('editNoteDropdown');if(dropdown)dropdown.value='custom';
 window.closeNoteEdit?.();
 const reset=document.getElementById('hrResetNote');if(reset)reset.hidden=true;
}
function revoke(){
 authorized=false;generation++;entries.clear();resetFields.clear();clearPrivateDisplay();
}
async function api(path,options={}) {
 const user=auth.currentUser, run=generation;
 if(!user||user.isAnonymous)throw Error('HR authentication required');
 const token=await user.getIdToken();
 if(run!==generation||user!==auth.currentUser)throw Error('HR session changed');
 const response=await fetch(endpoint+path,{...options,credentials:'omit',cache:'no-store',headers:{'X-Firebase-Id-Token':token,...options.headers}});
 if(run!==generation||user!==auth.currentUser)throw Error('HR session changed');
 if(response.status===401||response.status===403){revoke();throw Error('HR access denied');}
 if(!response.ok)throw Error('Private HR connection error ('+response.status+')');
 const data=await response.json();
 if(run!==generation||user!==auth.currentUser)throw Error('HR session changed');
 return data;
}
async function fetchEntry(key,run=generation){
 const identity=parseKey(key);if(!identity)return null;
 const value=(await api('/internal/hr/entry?'+new URLSearchParams(identity))).entry;
 if(!authorized||run!==generation)return null;
 // Reject an unexpected identity; leave type is validation metadata, never a match key.
 if(value&&(value.staffId?.toUpperCase()!==identity.staffId||value.date!==identity.date))throw Error('HR record identity mismatch');
 entries.set(key,{entry:value,loaded:Date.now()});
 if(value)privateKeys.add(key);
 return value;
}
function fieldValue(key,field,entry,el){
 if(entry[field]?.origin==='manual'||resetFields.has(key+'|'+field)||el.dataset.hrManual!=='true')return entry[field]?.value??'';
 return null; // Keep explicit legacy manual overrides; sheet notes are not overrides.
}
function leaveWarning(entry,types){
 const raw=typeof entry.leaveType==='string'?entry.leaveType.trim().toUpperCase():'';
 const source=raw.replace(/^H-/,'');
 const attendance=(types||'').split(',').filter(Boolean);
 if(!source||!attendance.length||attendance.some(x=>x.replace(/^H-/,'')===source))return '';
 return 'Leave type mismatch: HR '+raw+' / attendance '+attendance.join(', ')+' — review; attendance unchanged.';
}
function renderCells(){
 if(!authorized)return;
 // Drop detached DOM references, retaining no obsolete private controls in memory.
 for(const el of originals.keys())if(!el.isConnected)originals.delete(el);
 let checked=0,matched=0,reasons=0,warnings=0;
 for(const [key,els] of findFields()){
  if(entries.has(key))checked++;
  const entry=getEntry(key);
  if(!entry){
   for(const el of [...els.notes.map(n=>n.querySelector('span.truncate')),...els.reasons])if(el&&originals.has(el)){restore(el,originals.get(el));originals.delete(el);}
   for(const el of els.notes)el.querySelector('.hr-leave-warning')?.remove();
   for(const el of els.reasons)if(el.nextElementSibling?.classList.contains('hr-reset-reason'))el.nextElementSibling.remove();
   continue;
  }
  matched++;let hasReason=false,hasWarning=false;
  for(const host of els.notes){
   const note=host.querySelector('span.truncate');
   const val=fieldValue(key,'noteTime',entry,host);
   if(note&&val!==null){remember(note,'noteTime');note.textContent=val||'—';note.title='Private HR: '+(entry.noteTime?.origin||'sheet');}
   const warning=leaveWarning(entry,host.dataset.hrTypes);hasWarning ||= !!warning;
   let badge=host.querySelector('.hr-leave-warning');
   if(warning){
    if(!badge){badge=document.createElement('span');badge.className='hr-leave-warning';badge.style.cssText='color:#92400e;font-weight:600';host.appendChild(badge);}
    badge.textContent='⚠ Type mismatch';badge.title=warning;badge.setAttribute('aria-label',warning);
   }else badge?.remove();
  }
  for(const reason of els.reasons){
   const val=fieldValue(key,'reason',entry,reason);
   if(val!==null){remember(reason,'reason');if(document.activeElement!==reason)reason.value=val;reason.title='Private HR: '+(entry.reason?.origin||'sheet');hasReason ||= !!val&&reason.value===val;}
   if(!reason.nextElementSibling?.classList.contains('hr-reset-reason')){
    const reset=document.createElement('button');reset.type='button';reset.className='hr-reset-reason';reset.textContent='↺';reset.title='Reset Reason to Sheet';reset.setAttribute('aria-label',reset.title);
    reset.addEventListener('click',async e=>{e.preventDefault();e.stopPropagation();if(!confirm('Reset reason to the Telegram Sheet value?'))return;try{await write(key,'reason','',true);}catch(err){alert(err.message);}});
    reason.insertAdjacentElement('afterend',reset);
   }
  }
  if(hasReason)reasons++;if(hasWarning)warnings++;
 }
 setStatus(syncError||`HR connected • ${matched} matched / ${checked} checked • ${reasons} reasons displayed • ${warnings} type warnings`);
}
async function write(key,field,value,reset=false){
 const identity=parseKey(key);if(!identity||!authorized)throw Error('HR authentication required');
 const run=generation,data={...identity,field};if(!reset)data.value=value;
 await api('/internal/hr/'+(reset?'reset':'override'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 if(run!==generation||!authorized)return;
 if(reset)resetFields.add(key+'|'+field);
 entries.delete(key);await fetchEntry(key,run);renderCells();
}
async function synchronize(){
 if(!authorized||loading)return;loading=true;const run=generation;syncError='';
 try{
  const keys=[...findFields().keys()].filter(k=>!entries.has(k)||Date.now()-entries.get(k).loaded>TTL);
  let next=0;
  async function worker(){while(next<keys.length&&authorized&&generation===run){
   try{await fetchEntry(keys[next++],run);if(run===generation)renderCells();}
   catch(e){if(run===generation){syncError=e.message;setStatus(syncError);}else if(!authorized)setStatus('HR access unavailable');return;}
  }}
  await Promise.all(Array.from({length:Math.min(2,keys.length)},worker));
 }finally{loading=false;if(authorized){renderCells();if(run!==generation)schedule();}}
}
function schedule(){if(queued||!authorized)return;queued=true;queueMicrotask(()=>{queued=false;synchronize();renderCells();});}
function setStatus(text){if(statusButton)statusButton.textContent=text;}
function installStatus(){
 if(statusButton?.isConnected)return;
 const refresh=document.querySelector('#dailyView button[title="Refresh Daily Attendance"]');if(!refresh)return;
 statusButton=document.createElement('button');statusButton.type='button';statusButton.className=refresh.className;statusButton.style.cssText='background:#e2e8f0;color:#334155';
 refresh.insertAdjacentElement('afterend',statusButton);
 refresh.addEventListener('click',()=>{if(authorized){generation++;entries.clear();syncError='';setTimeout(schedule,350);}}, {passive:true});
 statusButton.addEventListener('click',async()=>{if(authorized){revoke();setStatus('Connect HR');await signOut(auth);return;}try{await signInWithPopup(auth,new GoogleAuthProvider());}catch(e){setStatus('HR sign-in unavailable');}});
 setStatus('Connect HR');
}
function installResetNote(){
 const save=document.querySelector('#noteEditModal button[onclick*="saveNoteEdit"]');if(!save||document.getElementById('hrResetNote'))return;
 const b=document.createElement('button');b.id='hrResetNote';b.type='button';b.textContent='Reset to Sheet';b.hidden=true;b.className=save.className;
 b.addEventListener('click',async()=>{const key=document.getElementById('editNoteId')?.value;if(!authorized||!getEntry(key))return;if(!confirm('Reset Note/Time to the Telegram Sheet value?'))return;try{await write(key,'noteTime','',true);window.closeNoteEdit();}catch(e){alert(e.message);}});
 save.insertAdjacentElement('afterend',b);
}
function installNativeEditing(){
 if(typeof window.saveReason!=='function'||typeof window.saveNoteEdit!=='function'||typeof window.openNoteEdit!=='function')return false;
 if(window.__privateHrInlineInstalled)return true;window.__privateHrInlineInstalled=true;
 const originalReason=window.saveReason, originalNoteOpen=window.openNoteEdit, originalNoteSave=window.saveNoteEdit;
 function blocked(key){return (authorized&&parseKey(key)&&!entries.has(key))||(!getEntry(key)&&privateKeys.has(key));}
 window.saveReason=function(key,value){
  if(blocked(key)){alert('Connect HR and refresh before editing this private record.');return;}
  if(authorized&&getEntry(key)){
   // Blur without a change must not turn the imported value into a manual override.
   const fields=findFields().get(key)?.reasons||[];
   const displayed=fields[0]&&fieldValue(key,'reason',getEntry(key),fields[0]);
   if(value===displayed)return;
   write(key,'reason',value).catch(err=>{alert(err.message);renderCells();});return;
  }
  return originalReason.apply(this,arguments);
 };
 window.openNoteEdit=function(event,key,value){
  const entry=authorized&&getEntry(key),host=findFields().get(key)?.notes[0];
  const resolved=entry&&host?fieldValue(key,'noteTime',entry,host):null;
  const result=originalNoteOpen.call(this,event,key,resolved===null?value:resolved);
  const reset=document.getElementById('hrResetNote');if(reset)reset.hidden=!entry;return result;
 };
 window.saveNoteEdit=function(){
  const key=document.getElementById('editNoteId')?.value;
  if(blocked(key)){alert('Connect HR and refresh before editing this private record.');return;}
  if(authorized&&getEntry(key)){write(key,'noteTime',document.getElementById('editNoteText')?.value?.trim()||'').then(()=>window.closeNoteEdit()).catch(e=>alert(e.message));return;}
  return originalNoteSave.apply(this,arguments);
 };
 installResetNote();return true;
}
onAuthStateChanged(auth,async user=>{
 revoke();const run=generation;installStatus();installNativeEditing();
 if(!user||user.isAnonymous){setStatus('Connect HR');return;}
 setStatus('Checking HR access…');
 try{await api('/internal/hr/entry?staffId=PERMISSIONCHECK&date=2026-01-01');if(run!==generation)return;authorized=true;setStatus('HR connected • checking records…');schedule();}
 catch(e){if(run===generation)setStatus(e.message);}
});
const boot=setInterval(()=>{installStatus();if(installNativeEditing())clearInterval(boot);},500);
setInterval(()=>{
 if(!authorized||document.hidden)return;
 const view=document.getElementById('dailyView');if(!view||view.classList.contains('hidden'))return;
 schedule();
},10000);
