import http from 'node:http';
import { google } from 'googleapis';

const TZ = 'Asia/Phnom_Penh';
const PORT = Number(process.env.PORT || '8080');
const SHEETS = [
  ['lpl-lph', process.env.LEAVE_TRACKER_LPL_LPH_ID],
  ['itc-lpt', process.env.LEAVE_TRACKER_ITC_LPT_ID],
  ['ttc', process.env.LEAVE_TRACKER_TTC_ID]
];
const TAB = 'Leave Requests Log';
const validDay = value => /^20\d{2}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value + 'T00:00:00Z')) &&
  new Date(value + 'T00:00:00Z').toISOString().slice(0,10) === value;
function parseDays(raw) {
  const text = String(raw || '').trim();
  const swap = text.match(/^Off:\s*(\d{4}-\d{2}-\d{2})\s*\|\s*Work:\s*(\d{4}-\d{2}-\d{2})/i);
  if (swap) return validDay(swap[1]) ? [swap[1]] : [];
  const matches = text.match(/20\d{2}-\d{2}-\d{2}/g) || [];
  if (!matches.length || !matches.every(validDay)) return [];
  if (matches.length === 1) return matches;
  const start = Date.parse(matches[0] + 'T00:00:00Z');
  const end = Date.parse(matches[1] + 'T00:00:00Z');
  if (end < start || end - start > 31 * 86400000) return [];
  const days = [];
  for (let t = start; t <= end; t += 86400000) {
    days.push(new Date(t).toISOString().slice(0,10));
  }
  return days;
}
export function normalizeRow(row, tracker, index) {
  const staffId = String(row[2] || '').trim();
  const dateText = String(row[1] || '');
  const period = String(row[6] || '').trim();
  const reason = String(row[11] || '').trim();
  const status = String(row[13] || '').trim();
  if (!staffId || staffId === 'UNKNOWN' || status.toLowerCase() !== 'synced') return [];
  // A day-off swap requires dedicated off/work semantics; do not render as leave.
  if (String(row[7] || '').trim() === 'D' || /^Off:\\s*/i.test(dateText)) return [];
  const noteTime = /morning/i.test(period) ? 'Morning' :
    /afternoon/i.test(period) ? 'Afternoon' :
    /half\s*day/i.test(period) ? 'Half Day' : 'Full Day';
  return parseDays(dateText).map(date => ({
    staffId, date, noteTime, reason: /^(?:N\/A|Direct Shortcut)$/i.test(reason) ? '' : reason,
    tracker, sourceRow: index + 2, sourceTimestamp: String(row[0] || ''),
    leaveType: String(row[7] || '')
  }));
}
export function mergeRecords(records) {
  const map = new Map();
  for (const item of records) {
    const key = item.staffId + '|' + item.date;
    const previous = map.get(key);
    // A newer tracker entry is authoritative. Stable tie-breaker is row order.
    if (!previous || (item.sourceTimestamp >= previous.sourceTimestamp)) map.set(key, item);
  }
  return [...map.values()].sort((a,b) => (a.date+a.staffId).localeCompare(b.date+b.staffId));
}
export async function readLeaveSnapshot(sheetsClient, from, to) {
  if (!validDay(from) || !validDay(to) || from > to) throw new Error('Invalid date range');
  if ((Date.parse(to)-Date.parse(from)) > 31*86400000) throw new Error('Date range exceeds 31 days');
  const entries = [];
  for (const [tracker, spreadsheetId] of SHEETS) {
    if (!spreadsheetId) throw new Error('Missing tracker sheet configuration');
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId, range: `'${TAB}'!A2:N`
    });
    const rows = response.data.values || [];
    rows.forEach((row, index) => entries.push(...normalizeRow(row, tracker, index)));
  }
  return mergeRecords(entries.filter(v => v.date >= from && v.date <= to));
}
export function createHandler(readSnapshot) {
  return async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/healthz') {
      response.writeHead(200); response.end(JSON.stringify({status:'ok'})); return;
    }
    if (request.method !== 'GET' || url.pathname !== '/internal/leave-snapshot') {
      response.writeHead(404); response.end(JSON.stringify({error:'not found'})); return;
    }
    try {
      const data = await readSnapshot(url.searchParams.get('from'), url.searchParams.get('to'));
      response.writeHead(200); response.end(JSON.stringify({timezone:TZ,records:data}));
    } catch (error) {
      // Do not leak private row data or spreadsheet IDs in error responses.
      const badRequest = /Invalid date range|Date range exceeds/.test(error.message);
      console.error('Leave snapshot request failed:', error.name);
      response.writeHead(badRequest ? 400 : 503);
      response.end(JSON.stringify({error: badRequest ? 'invalid date range' : 'leave source unavailable'}));
    }
  };
}
if (process.env.NODE_ENV !== 'test') {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });
  const sheetsClient = google.sheets({version:'v4',auth});
  http.createServer(createHandler((from,to) => readLeaveSnapshot(sheetsClient,from,to)))
    .listen(PORT, '0.0.0.0', () => console.log('Private leave bridge listening'));
}
