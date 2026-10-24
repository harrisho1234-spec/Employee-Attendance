/**
 * Called by an authorized HR script administrator, not by anonymous dashboard clients.
 * Changes one override field; the other field is preserved.
 * Setting value to '' intentionally overrides with blank text.
 */
function setPrivateLeaveOverride(staffId, day, field, value) {
  hrRequireOwner_();
  const id = String(staffId || '').trim();
  if (!id || !hrValidDay_(day) || !['note','reason'].includes(field))
    throw new Error('Provide staff ID, YYYY-MM-DD and note/reason field');
  const book = SpreadsheetApp.openById(hrSyncProperties_());
  const tab = hrTab_(book, LEAVE_SYNC.overrideTab, LEAVE_SYNC.overrideHeader);
  const rows = hrRows_(tab,7);
  let rowNumber = rows.findIndex(row=>row[0]===id && row[1]===day)+2;
  if (rowNumber < 2) {
    rowNumber = tab.getLastRow()+1;
    tab.getRange(rowNumber,1,1,7).setValues([[id,day,'','',false,false,'']]);
  }
  tab.getRange(rowNumber,field==='note'?3:4).setValue(String(value == null ? '' : value));
  tab.getRange(rowNumber,field==='note'?5:6).setValue(true);
  tab.getRange(rowNumber,7).setValue(new Date());
  return syncPrivateTelegramLeaveTrackers();
}
