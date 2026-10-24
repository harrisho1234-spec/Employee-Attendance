/**
 * HR-only Daily Attendance display overlay.
 * Never copy private notes/reasons into public Firestore, customNotes/customReasons,
 * LocalStorage, exports, or the unauthenticated DOM.
 */
import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
const ENDPOINT='https://leave-hr-browser-gateway-lckdfbndra-as.a.run.app';
const app=initializeApp({apiKey:'AIzaSyB4fUTVdVt9cjKjIzj63a0KJ3bEaIXRzWY',authDomain:'daily-attendance-structure.firebaseapp.com',projectId:'daily-attendance-structure',appId:'1:321384539910:web:c81475cd6d4d8cedcea087'},'daily-private-hr');
const auth=getAuth(app);
const root=document.createElement('div');
root.id='dailyHrLeaveControls';
root.style.cssText='position:fixed;bottom:70px;right:14px;z-index:75;background:white;border:1px solid #cbd5e1;border-radius:10px;padding:8px 12px;box-shadow:0 2px 12px #0002;font:12px system-ui';
root.innerHTML='<span id="hrState">Private HR synchronization: off</span> <button id="hrToggle" type="button" style="padding:5px 9px;border-radius:5px;background:#1d4ed8;color:white">Sign in to HR</button>';
document.body.appendChild(root);
const state=root.querySelector('#hrState'),toggle=root.querySelector('#hrToggle');
let approved=false, busy=false, previousToken=0;
let rows=new Map();
const cache=new Map();
const CACHE_MS=2*60*1000;
let refreshQueued=false;
const escapeText=x=>String(x??'');
function keyInfo(raw) {
 const m=/^([A-Za-z0-9_-]{1,48})_([A-Za-z]+)_(\d{1,2})_(20\d{2})$/.exec(raw||'');
 if(!m)return null;
 const month=['january','february','march','april','may','june','july','august','september','october','november','december'].indexOf(m[2].toLowerCase());
 if(month<0)return null;
 const date=`${m[4]}-${String(month+1).padStart(2,'0')}-${m[3].padStart(2,'0')}`;
 return {staffId:m[1],date,key:raw};
}
async function request(path,opts={}) {
 const user=auth.currentUser;
 if(!user||user.isAnonymous)throw Error('HR sign-in required');
 const token=await user.getIdToken();
 const res=await fetch(ENDPOINT+path,{...opts,cache:'no-store',credentials:'omit',headers:{'X-Firebase-Id-Token':token,...opts.headers}});
 if(res.status===403){approved=false;window.hrLeaveEnabled=false;if(typeof window.renderDailyAttendance==='function')window.renderDailyAttendance();throw Error('This Google account is not approved for HR leave access');}
 if(!res.ok)throw Error(res.status===503?'Private HR service unavailable':'HR request failed ('+res.status+')');
 return res.json();
}
async function read(staffId,date) {
 const data=await request('/internal/hr/entry?'+new URLSearchParams({staffId,date}));
 return data.entry;
}
function renderCell(note,reason,entry) {
 const noteEl=note?.querySelector('span.truncate');
 if(noteEl) {
   if(entry){noteEl.textContent=entry.noteTime?.value||'—';noteEl.title='Tracker: '+(entry.noteTime?.origin||'sheet')+' • Click to override or reset';}
 }
 if(reason) {
   if(entry){reason.value=entry.reason?.value||'';reason.title='Private HR: '+(entry.reason?.origin||'sheet')+' • Click to override';reason.readOnly=true;}
 }
}
async function refresh() {
 if(!approved||busy)return;
 const noteEls=[...document.querySelectorAll('[data-hr-note]')];
 const reasonEls=[...document.querySelectorAll('input[data-hr-reason]')];
 if(!noteEls.length&&!reasonEls.length)return;
 const next=new Map();
 for(const el of noteEls) {const info=keyInfo(el.dataset.hrNote);if(info){const row=next.get(info.key)||{...info};row.note=el;next.set(info.key,row);}}
 for(const el of reasonEls){const info=keyInfo(el.dataset.hrReason);if(info){const row=next.get(info.key)||{...info};row.reason=el;next.set(info.key,row);}}
 rows=next;
 busy=true;const generation=++previousToken;
 try {
   const pending=[];
   for(const row of rows.values()) {
     const cached=cache.get(row.key);
     if(cached && Date.now()-cached.time<CACHE_MS) {
       row.entry=cached.entry;renderCell(row.note,row.reason,row.entry);
     } else pending.push(row);
   }
   let cursor=0;
   const worker=async()=>{
     while(cursor<pending.length && approved && generation===previousToken) {
       const row=pending[cursor++];
       try {
         const entry=await read(row.staffId,row.date);
         if(!approved||generation!==previousToken)break;
         cache.set(row.key,{entry,time:Date.now()});
         row.entry=entry;renderCell(row.note,row.reason,entry);
       } catch(e) {
         state.textContent=e.message;
         break;
       }
     }
   };
   await Promise.all(Array.from({length:Math.min(4,pending.length)},worker));
 } finally {busy=false;}
}
function scheduleRefresh(){
 if(refreshQueued||!approved)return;
 refreshQueued=true;
 queueMicrotask(()=>{refreshQueued=false;refresh();});
}
const dialog=document.createElement('dialog');
dialog.style.cssText='border:1px solid #cbd5e1;border-radius:12px;padding:22px;max-width:420px;width:calc(100% - 32px);box-shadow:0 10px 60px #0004';
dialog.innerHTML='<h3 style="font-weight:700;font-size:18px">Private HR Leave</h3><p id="hrRecordLabel" style="margin:12px 0;color:#64748b"></p><label style="display:block;margin-bottom:6px" for="hrEditValue">Manual value</label><textarea id="hrEditValue" style="width:100%;min-height:90px;border:1px solid #cbd5e1;border-radius:6px;padding:9px"></textarea><p id="hrEditStatus" style="margin-top:8px;color:#64748b"></p><div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:12px"><button id="hrSave" style="background:#1d4ed8;color:white;padding:8px;border-radius:6px">Save override</button><button id="hrReset" style="background:#475569;color:white;padding:8px;border-radius:6px">Reset to Sheet</button><button id="hrCancel" style="padding:8px">Cancel</button></div>';
document.body.appendChild(dialog);
let editing=null;
function openEditor(raw,field){const row=rows.get(raw);if(!approved||!row||!row.entry)return;
 editing={row,field};dialog.querySelector('#hrRecordLabel').textContent=row.staffId+' • '+row.date+' • '+(field==='noteTime'?'Note/Time':'Reason');
 dialog.querySelector('#hrEditValue').value=row.entry[field]?.value||'';
 dialog.querySelector('#hrEditStatus').textContent='Source: '+(row.entry[field]?.origin==='manual'?'Manual override':'Telegram tracker');
 dialog.showModal();
}
dialog.querySelector('#hrCancel').onclick=()=>dialog.close();
async function edit(action){if(!editing)return;
 const {row,field}=editing;
 if(action==='reset'&&!confirm('Reset this field to the tracker value?'))return;
 const body={staffId:row.staffId,date:row.date,field};
 if(action==='override')body.value=dialog.querySelector('#hrEditValue').value;
 try{
  await request('/internal/hr/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  cache.delete(row.key);
  row.entry=await read(row.staffId,row.date);
  cache.set(row.key,{entry:row.entry,time:Date.now()});
  renderCell(row.note,row.reason,row.entry);dialog.close();
 }catch(e){dialog.querySelector('#hrEditStatus').textContent=e.message;}
}
dialog.querySelector('#hrSave').onclick=()=>edit('override');
dialog.querySelector('#hrReset').onclick=()=>edit('reset');
document.addEventListener('click',e=>{
 if(!approved)return;
 const note=e.target.closest?.('[data-hr-note]');
 if(note){e.preventDefault();e.stopPropagation();openEditor(note.dataset.hrNote,'noteTime');return;}
 const reason=e.target.closest?.('input[data-hr-reason]');
 if(reason){e.preventDefault();e.stopPropagation();openEditor(reason.dataset.hrReason,'reason');}
},true);
toggle.onclick=async()=>{
 if(auth.currentUser&&!auth.currentUser.isAnonymous){await signOut(auth);return;}
 try{await signInWithPopup(auth,new GoogleAuthProvider());}
 catch(e){state.textContent=e.message;}
};
onAuthStateChanged(auth,async user=>{
 approved=false;window.hrLeaveEnabled=false;previousToken++;
 rows.clear();cache.clear();if(dialog.open)dialog.close();if(typeof window.renderDailyAttendance==='function')window.renderDailyAttendance();toggle.textContent=user?'Sign out of HR':'Sign in to HR';
 state.textContent=user?'Checking HR permission…':'Private HR synchronization: off';
 if(!user||user.isAnonymous)return;
 try{await request('/internal/hr/entry?staffId=INVALIDHRPERMISSIONCHECK&date=2026-01-01');
 approved=true;window.hrLeaveEnabled=true;state.textContent='Private HR sync enabled';refresh();}
 catch(e){state.textContent=e.message;}
});
// Update private overlay only, never the public attendance store.
const observer=new MutationObserver(mutations=>{if(approved && mutations.some(m=>m.addedNodes.length||m.removedNodes.length))scheduleRefresh();});
observer.observe(document.body,{subtree:true,childList:true});
setInterval(()=>{if(approved){cache.clear();scheduleRefresh();}},5*60*1000);
