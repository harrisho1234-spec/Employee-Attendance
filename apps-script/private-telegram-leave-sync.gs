/**
 * Private Telegram Leave Tracker -> Attendance staging sheet.
 * Run under a Google account with Viewer access to all 3 tracker sheets and
 * Editor access to the destination sheet. Do not deploy as a public web app.
 *
 * This does NOT write into the dashboard's public Firestore or alter attendance
 * calculations. The HR-only output must remain in a restricted spreadsheet.
 */
const LEAVE_SYNC = Object.freeze({
  trackerIds: {
    'lpl-lph': '1uBjsdHfsnOJxs0Y6xUlmEPRnim8KMLPiqX_OClHLz2M',
    'itc-lpt': '1C9VjWbYWo3edKDc-37-Q0zElLR0CfZirVAQDr46ztB0',
    'ttc': '1971ecyEfSde-1OWM2jsFgOE0wHdZ7p-1tpQLYHxbPPo'
  },
  sourceTab: 'Leave Requests Log',
  outputTab: 'HR Leave Sync',
  overrideTab: 'HR Leave Overrides',
  timezone: 'Asia/Phnom_Penh',
  header: ['Staff ID','Date','Note/Time','Reason','Tracker','Source Row','Source Timestamp','Leave Type','Synced At'],
  overrideHeader: ['Staff ID','Date','Override Note/Time','Override Reason','Override Note Enabled','Override Reason Enabled','Updated At']
});

function hrSyncProperties_() {
  const props = PropertiesService.getScriptProperties();
  const destination = props.getProperty('HR_ATTENDANCE_SPREADSHEET_ID');
  if (!destination) throw new Error('Set HR_ATTENDANCE_SPREADSHEET_ID in Script Properties');
  return destination;
}

function hrRequireOwner_() {
  const current = (Session.getEffectiveUser().getEmail() || '').toLowerCase();
  const allowed = (PropertiesService.getScriptProperties().getProperty('HR_SYNC_ADMIN_EMAILS') || '')
    .split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  if (!current || !allowed.length || !allowed.includes(current)) {
    throw new Error('Sync administrator is not configured or authorized');
  }
}

function hrValidDay_(s) {
  const text = String(s || '').trim();
  if (!/^20\d\d-\d\d-\d\d$/.test(text)) return false;
  const date = new Date(text + 'T00:00:00Z');
  return !isNaN(date.getTime()) && date.toISOString().slice(0,10) === text;
}

function hrDays_(input) {
  const raw = String(input || '').trim();
  // Swaps are deliberately excluded by hrParseRow_.
  const matches = raw.match(/20\d\d-\d\d-\d\d/g) || [];
  if (!matches.length || !matches.every(hrValidDay_)) return [];
  if (matches.length === 1) return matches;
  if (matches.length !== 2) return [];
  const start = Date.parse(matches[0] + 'T00:00:00Z');
  const end = Date.parse(matches[1] + 'T00:00:00Z');
  if (end < start || end - start > 31*86400000) return [];
  const days = [];
  for (let t=start; t<=end; t+=86400000) days.push(new Date(t).toISOString().slice(0,10));
  return days;
}

function hrParseRow_(row, tracker, rowNumber) {
  const id = String(row[2] || '').trim();
  const status = String(row[13] || '').trim().toLowerCase();
  const rawDate = String(row[1] || '');
  const type = String(row[7] || '').trim();
  if (!id || id === 'UNKNOWN' || status !== 'synced') return [];
  if (type === 'D' || /^Off:\s*/i.test(rawDate)) return [];
  const period = String(row[6] || '');
  const note = /morning/i.test(period) ? 'Morning' :
    /afternoon/i.test(period) ? 'Afternoon' :
    /half\s*day/i.test(period) ? 'Half Day' : 'Full Day';
  const rawReason = String(row[11] || '').trim();
  const reason = /^(N\/A|Direct Shortcut)$/i.test(rawReason) ? '' : rawReason;
  return hrDays_(rawDate).map(day => ({
    id, day, note, reason, tracker, rowNumber,
    timestamp: String(row[0] || ''), type
  }));
}

function hrTab_(book, name, header) {
  let sheet = book.getSheetByName(name);
  if (!sheet) sheet = book.insertSheet(name);
  if (sheet.getMaxColumns() < header.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), header.length-sheet.getMaxColumns());
  sheet.getRange(1,1,1,header.length).setValues([header]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  return sheet;
}

function hrRows_(sheet, columns) {
  const count = sheet.getLastRow()-1;
  return count > 0 ? sheet.getRange(2,1,count,columns).getDisplayValues() : [];
}

function hrOverrides_(sheet) {
  const map = new Map();
  for (const cells of hrRows_(sheet, 7)) {
    const [id, day, note, reason, noteEnabled, reasonEnabled] = cells;
    if (!id || !hrValidDay_(day)) continue;
    map.set(id + '|' + day, {
      note, reason,
      noteEnabled: /^(true|yes|1)$/i.test(noteEnabled),
      reasonEnabled: /^(true|yes|1)$/i.test(reasonEnabled)
    });
  }
  return map;
}

/**
 * Safe: copies only tracker records to a restricted staging sheet.
 * NEVER calls an endpoint, publishes private data, or modifies attendance totals.
 */
function syncPrivateTelegramLeaveTrackers() {
  hrRequireOwner_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Another leave sync is still running');
  try {
    const book = SpreadsheetApp.openById(hrSyncProperties_());
    const output = hrTab_(book, LEAVE_SYNC.outputTab, LEAVE_SYNC.header);
    const overrides = hrTab_(book, LEAVE_SYNC.overrideTab, LEAVE_SYNC.overrideHeader);
    const manual = hrOverrides_(overrides);
    const map = new Map();
    Object.keys(LEAVE_SYNC.trackerIds).forEach(tracker => {
      const source = SpreadsheetApp.openById(LEAVE_SYNC.trackerIds[tracker])
        .getSheetByName(LEAVE_SYNC.sourceTab);
      if (!source) throw new Error('Leave Requests Log tab missing for ' + tracker);
      const last = source.getLastRow();
      if (last < 2) return;
      const records = source.getRange(2,1,last-1,14).getDisplayValues();
      records.forEach((row,i) => hrParseRow_(row,tracker,i+2).forEach(record => {
        const key = record.id + '|' + record.day;
        const previous = map.get(key);
        if (!previous || record.timestamp >= previous.timestamp) map.set(key,record);
      }));
    });
    const now = Utilities.formatDate(new Date(),LEAVE_SYNC.timezone,'yyyy-MM-dd HH:mm:ss');
    const rows = Array.from(map.values())
      .sort((a,b) => (a.day+a.id).localeCompare(b.day+b.id))
      .map(record => {
        const manualValue = manual.get(record.id + '|' + record.day) || {};
        return [record.id,record.day,
          manualValue.noteEnabled ? manualValue.note : record.note,
          manualValue.reasonEnabled ? manualValue.reason : record.reason,
          record.tracker,record.rowNumber,record.timestamp,record.type,now];
      });
    // Read all three sources successfully before replacing any previous output.
    const existing = output.getLastRow();
    if (existing > 1) output.getRange(2,1,existing-1,LEAVE_SYNC.header.length).clearContent();
    if (rows.length) {
      if (output.getMaxRows() < rows.length+1) output.insertRowsAfter(output.getMaxRows(),rows.length+1-output.getMaxRows());
      output.getRange(2,1,rows.length,LEAVE_SYNC.header.length).setValues(rows);
    }
    PropertiesService.getScriptProperties().setProperty('HR_SYNC_LAST_OK_AT',now);
    console.log('Private leave sync succeeded; record count: ' + rows.length);
    return {records:rows.length, syncedAt:now};
  } finally {
    lock.releaseLock();
  }
}

/** One-time setup: run manually after setting Script Properties. */
function setupPrivateTelegramLeaveSync() {
  hrRequireOwner_();
  SpreadsheetApp.openById(hrSyncProperties_()); // Fail early if destination isn't accessible.
  ScriptApp.getProjectTriggers()
    .filter(t=>t.getHandlerFunction()==='syncPrivateTelegramLeaveTrackers')
    .forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncPrivateTelegramLeaveTrackers')
    .timeBased().everyHours(1).create();
  return syncPrivateTelegramLeaveTrackers();
}

/**
 * Explicit HR reset: removes a manual override for only one field.
 * The tracker value appears on the next sync. Does not erase source requests.
 */
function resetPrivateLeaveFieldToSheet(staffId, day, field) {
  hrRequireOwner_();
  if (!staffId || !hrValidDay_(day) || !['note','reason'].includes(field))
    throw new Error('Provide a valid staff ID, YYYY-MM-DD and note/reason field');
  const book = SpreadsheetApp.openById(hrSyncProperties_());
  const sheet = hrTab_(book, LEAVE_SYNC.overrideTab, LEAVE_SYNC.overrideHeader);
  const rows = hrRows_(sheet,7);
  const index = rows.findIndex(r=>r[0]===String(staffId) && r[1]===day);
  if (index >= 0) sheet.getRange(index+2,field==='note'?5:6).setValue(false);
  return syncPrivateTelegramLeaveTrackers();
}
