// Standalone project. Do NOT replace the Telegram bot or attendance engine.
// Script Properties: BRIDGE_SECRET, TRACKER_IDS (JSON array of exactly three IDs),
// OVERRIDES_SHEET_ID (separate private spreadsheet).
function doGet() { return leaveJson_({ ok: false }); }
function leaveJson_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }

function doPost(e) {
  try {
    const properties = PropertiesService.getScriptProperties();
    const secret = properties.getProperty('BRIDGE_SECRET');
    const envelope = JSON.parse(e.postData.contents);
    if (!secret || secret.length < 32 || typeof envelope.payload !== 'string' || envelope.payload.length > 16384) throw new Error();
    const signature = Utilities.computeHmacSha256Signature(envelope.payload, secret)
      .map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
    let different = signature.length ^ String(envelope.signature).length;
    for (let i = 0; i < signature.length; i++) different |= signature.charCodeAt(i) ^ String(envelope.signature).charCodeAt(i);
    if (different) throw new Error();
    const request = JSON.parse(envelope.payload);
    if (Math.abs(Date.now() - request.timestamp) > 60000 || !/^[\w-]{36}$/.test(request.nonce) || !request.actor) throw new Error();
    if (!Number.isInteger(request.year) || request.year < 2020 || request.year > 2100) throw new Error();
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) throw new Error();
    try {
      const cache = CacheService.getScriptCache();
      if (cache.get(request.nonce)) throw new Error();
      cache.put(request.nonce, 'used', 120);
      if (!['read', 'override', 'reset'].includes(request.action)) throw new Error();
      const ids = JSON.parse(properties.getProperty('TRACKER_IDS'));
      if (!Array.isArray(ids) || ids.length !== 3 || new Set(ids).size !== 3) throw new Error();
      // All-or-nothing read: a missing tracker must not look like deleted leave.
      const sources = ids.map(id => {
        const book = SpreadsheetApp.openById(id);
        const sheet = book.getSheetByName('Leave Requests Log');
        if (!sheet) throw new Error();
        const values = sheet.getDataRange().getValues();
        return values.map(row => row.map((value, column) => value instanceof Date
          ? Utilities.formatDate(value, book.getSpreadsheetTimeZone(), column === 0 ? 'yyyy-MM-dd HH:mm:ss' : 'yyyy-MM-dd') : value));
      });
      const snapshot = leaveParseSources_(sources, request.year);
      const book = SpreadsheetApp.openById(properties.getProperty('OVERRIDES_SHEET_ID'));
      let sheet = book.getSheetByName('Leave Overrides');
      if (!sheet) { sheet = book.insertSheet('Leave Overrides'); sheet.appendRow(['Key', 'JSON']); }
      const values = sheet.getDataRange().getValues();
      const overrides = {};
      values.slice(1).forEach(row => { if (row[0]) overrides[row[0]] = JSON.parse(row[1]); });
      if (request.action !== 'read') {
        if (!leaveValidKey_(request.key, request.year) || !['note', 'reason'].includes(request.field)) throw new Error();
        if (request.action === 'override' && (typeof request.value !== 'string' || request.value.length > 2000)) throw new Error();
        const entry = overrides[request.key] || {};
        if (request.action === 'reset') {
          delete entry[request.field];
          // Persist a reset marker so old public/manual values cannot reappear.
          entry[request.field + 'Reset'] = true;
        } else {
          entry[request.field] = request.value;
          delete entry[request.field + 'Reset'];
        }
        entry.updatedAt = new Date().toISOString(); entry.updatedBy = request.actor;
        const index = values.findIndex(row => row[0] === request.key);
        sheet.getRange(index < 0 ? values.length + 1 : index + 1, 1, 1, 2).setValues([[request.key, JSON.stringify(entry)]]);
        overrides[request.key] = entry;
      }
      const visible = {};
      Object.keys(overrides).forEach(key => {
        if (leaveValidKey_(key, request.year)) {
          const entry = overrides[key];
          visible[key] = {};
          ['note', 'reason', 'noteReset', 'reasonReset'].forEach(field => {
            if (Object.prototype.hasOwnProperty.call(entry, field)) visible[key][field] = entry[field];
          });
        }
      });
      return leaveJson_({ ok: true, records: snapshot.records, skipped: snapshot.skipped,
        overrides: visible, syncedAt: new Date().toISOString() });
    } finally { lock.releaseLock(); }
  } catch (_) { return leaveJson_({ ok: false, error: 'Private bridge request failed' }); }
}

function leaveValidKey_(key, year) {
  const m = /^([A-Z0-9-]+)_([A-Za-z]+)_(\d{1,2})_(\d{4})$/.exec(key || '');
  if (!m || Number(m[4]) !== year) return false;
  const month = LEAVE_MONTHS_.indexOf(m[2]);
  return month >= 0 && Number(m[3]) >= 1 && Number(m[3]) <= new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}
const LEAVE_MONTHS_ = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function leaveDates_(text) {
  const match = /^(\d{4}-\d{2}-\d{2})(?:\s+to\s+(\d{4}-\d{2}-\d{2}))?$/.exec(String(text).trim());
  if (!match) return [];
  const start = new Date(match[1] + 'T00:00:00Z'), end = new Date((match[2] || match[1]) + 'T00:00:00Z');
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || start.toISOString().slice(0,10) !== match[1] ||
      end.toISOString().slice(0,10) !== (match[2] || match[1]) || end < start || end - start > 366 * 86400000) return [];
  const result = [];
  for (let day = +start; day <= +end; day += 86400000) result.push(new Date(day));
  return result;
}

function leaveParseSources_(sources, year) {
  const records = {}, winners = {};
  let skipped = 0;
  sources.forEach((rows, source) => {
    const header = rows.findIndex(row => row[1] === 'Date of Leave' && row[2] === 'Staff ID' && row[6] === 'Period / Duration' && row[11] === 'Reason' && row[13] === 'Sync Status');
    if (header < 0) throw new Error('Tracker layout mismatch');
    rows.slice(header + 1).forEach((row, index) => {
      if (!row.some(v => v !== '')) return;
      const id = String(row[2] || '').replace(/[^a-zA-Z0-9-]/g, '').toUpperCase();
      const type = String(row[7] || '').trim().toUpperCase();
      if (!/^(?:H-)?(?:AL|SL|SP|UP|P)$/.test(type)) return; // Leave metadata only; no OT/day-off changes.
      const dates = leaveDates_(row[1]);
      const stamp = /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})$/.exec(String(row[0]).trim());
      if (!id || id === 'UNKNOWN' || !dates.length || !stamp || String(row[13]).trim().toLowerCase() !== 'synced') { skipped++; return; }
      const rank = stamp[1] + ' ' + stamp[2].padStart(2, '0') + ':' + stamp[3] + ':' + stamp[4] + ':' + source + ':' + String(index).padStart(8, '0');
      const period = String(row[6] || '');
      const extension = String(row[12] || '');
      let note = /extension|converted/i.test(period + ' ' + extension) ? 'Full Day'
        : /morning/i.test(period) ? 'Morning' : /afternoon/i.test(period) ? 'Afternoon'
        : /half/i.test(period) ? 'Half Day' : /full|\d+ Days/i.test(period) ? 'Full Day' : period;
      let reason = String(row[11] || '').trim();
      if (/^(N\/A|Direct Shortcut|Manual Override)$/i.test(reason)) reason = '';
      if (type === 'P') { note = ''; reason = ''; }
      dates.forEach(date => {
        if (date.getUTCFullYear() !== year) return;
        const key = id + '_' + LEAVE_MONTHS_[date.getUTCMonth()] + '_' + date.getUTCDate() + '_' + year;
        if (!winners[key] || rank > winners[key]) {
          winners[key] = rank;
          records[key] = { note, reason };
        }
      });
    });
  });
  return { records, skipped };
}
