/**
 * HR Leave Workbench - PRIVATE spreadsheet-bound Apps Script.
 *
 * Install in Extensions > Apps Script of the restricted HR Leave Sync spreadsheet.
 * This file is intentionally separate from the existing hourly sync script.
 * Access is constrained by spreadsheet permissions and the Script Property allowlist.
 * It does not expose a web endpoint or put leave reasons in public Firestore.
 */
const HR_WORKBENCH = Object.freeze({
  syncTab:'HR Leave Sync',
  overrideTab:'HR Leave Overrides',
  syncHeader:['Staff ID','Date','Note/Time','Reason','Tracker','Source Row','Source Timestamp','Leave Type','Synced At'],
  overrideHeader:['Staff ID','Date','Override Note/Time','Override Reason','Override Note Enabled','Override Reason Enabled','Updated At']
});

function hrWorkbenchAssert_() {
  const email=(Session.getEffectiveUser().getEmail()||'').trim().toLowerCase();
  const allowed=(PropertiesService.getScriptProperties().getProperty('HR_SYNC_ADMIN_EMAILS')||'')
    .toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
  if (!email || !allowed.includes(email)) throw Error('Your Google account is not approved for private HR access');
  const book=SpreadsheetApp.getActiveSpreadsheet();
  const expected=PropertiesService.getScriptProperties().getProperty('HR_ATTENDANCE_SPREADSHEET_ID');
  if (!expected || book.getId()!==expected) throw Error('This workbench is not linked to its approved private spreadsheet');
  return book;
}

function hrWorkbenchValidate_(staffId, day) {
  const id=String(staffId||'').trim();
  if (!id || !/^20\d{2}-\d{2}-\d{2}$/.test(day) ||
      new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)
    throw Error('Enter a valid Staff ID and a date in YYYY-MM-DD format');
  return {id,day};
}

function hrWorkbenchRows_(sheet, count) {
  if (!sheet) throw Error('Required HR sheet tab is missing');
  return sheet.getLastRow()>1 ? sheet.getRange(2,1,sheet.getLastRow()-1,count).getDisplayValues() : [];
}

function hrWorkbenchCurrent(staffId, day) {
  const book=hrWorkbenchAssert_();
  const key=hrWorkbenchValidate_(staffId,day);
  const row=hrWorkbenchRows_(book.getSheetByName(HR_WORKBENCH.syncTab),9)
    .find(r=>r[0]===key.id&&r[1]===key.day);
  const override=hrWorkbenchRows_(book.getSheetByName(HR_WORKBENCH.overrideTab),7)
    .find(r=>r[0]===key.id&&r[1]===key.day);
  if (!row) return {found:false,staffId:key.id,date:key.day};
  return {found:true,staffId:row[0],date:row[1],note:row[2],reason:row[3],
    tracker:row[4],syncedAt:row[8],
    overriddenNote:!!override&&String(override[4]).toLowerCase()==='true',
    overriddenReason:!!override&&String(override[5]).toLowerCase()==='true'};
}

function hrWorkbenchChange(staffId, day, field, action, value) {
  const book=hrWorkbenchAssert_();
  const key=hrWorkbenchValidate_(staffId,day);
  if (!['note','reason'].includes(field)||!['override','reset'].includes(action))
    throw Error('Invalid field or action');
  const src=hrWorkbenchRows_(book.getSheetByName(HR_WORKBENCH.syncTab),9)
    .find(r=>r[0]===key.id&&r[1]===key.day);
  if (!src) throw Error('No synchronized tracker record found for this staff/date');
  const lock=LockService.getDocumentLock()||LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw Error('Another HR change is being saved');
  try {
    const tab=book.getSheetByName(HR_WORKBENCH.overrideTab);
    if (!tab) throw Error('Override tab missing');
    const rows=hrWorkbenchRows_(tab,7);
    const i=rows.findIndex(r=>r[0]===key.id&&r[1]===key.day);
    const idx=i>=0?i+2:tab.getLastRow()+1;
    if (i<0) tab.getRange(idx,1,1,7).setValues([[key.id,key.day,'','',false,false,'']]);
    if (action==='override') tab.getRange(idx,field==='note'?3:4).setValue(String(value??''));
    tab.getRange(idx,field==='note'?5:6).setValue(action==='override');
    tab.getRange(idx,7).setValue(new Date());
    // Optimistic local display update; hourly independent sync reconciles the private tab.
    const syncTab=book.getSheetByName(HR_WORKBENCH.syncTab);
    const records=hrWorkbenchRows_(syncTab,9);
    const matched=records.findIndex(r=>r[0]===key.id&&r[1]===key.day);
    if (matched>=0 && action==='override') {
      syncTab.getRange(matched+2,field==='note'?3:4).setValue(String(value??''));
    }
    return {saved:true,requiresSync:action==='reset',
      message:action==='reset'?'Reset recorded. Run the hourly sync to restore the tracker value.':'Override saved. Hourly sync will preserve it.'};
  } finally {lock.releaseLock();}
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Private HR Leave')
    .addItem('Open HR Leave Workbench','hrWorkbenchShow')
    .addToUi();
}

function hrWorkbenchShow() {
  hrWorkbenchAssert_();
  const template=HtmlService.createHtmlOutputFromFile('HRLeaveWorkbench')
    .setTitle('HR Leave Workbench').setWidth(440);
  SpreadsheetApp.getUi().showSidebar(template);
}
