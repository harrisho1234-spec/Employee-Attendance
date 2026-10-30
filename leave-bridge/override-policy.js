/**
 * Private backend merge policy for Daily Attendance presentation.
 * IMPORTANT: Only execute after user authorization on trusted backend.
 * Do NOT pass Telegram reasons into public Firebase collections,
 * unauthenticated GitHub Pages endpoints, browser localStorage, or logs.
 */
export function resolvedAttendanceField(sourceValue, override) {
  // "present" distinguishes a deliberate empty manual override from no override.
  if (override && override.present === true) {
    return { value: String(override.value ?? ''), origin: 'manual' };
  }
  return { value: String(sourceValue ?? ''), origin: 'sheet' };
}
export function resolveAttendanceRow(sourceRow, manual) {
  return {
    staffId: sourceRow.staffId,
    date: sourceRow.date,
    // Private validation metadata only; never an attendance-code update.
    leaveType: String(sourceRow.leaveType ?? ''),
    noteTime: resolvedAttendanceField(sourceRow.noteTime, manual?.noteTime),
    reason: resolvedAttendanceField(sourceRow.reason, manual?.reason),
    // Do not change any attendance code, leave quota, or scanned time.
  };
}
/**
 * Reset to Sheet is a deletion of one override entry, not a write to the
 * master attendance grid. Caller must enforce HR authorization and persist
 * the deletion in a private backend transaction.
 */
export function resetFieldToSheet(manual, field) {
  if (!['noteTime','reason'].includes(field)) throw new Error('Invalid field');
  const next = { ...(manual || {}) };
  delete next[field];
  return next;
}
