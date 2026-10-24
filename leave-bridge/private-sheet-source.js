/**
 * Server-side Google Sheets HR source. Never expose spreadsheet credentials to browsers.
 * Only backend callers that passed verified Firebase HR allowlisting may use this.
 */
export function createPrivateSheetSource({sheets, spreadsheetId}) {
  if (!sheets?.spreadsheets?.values?.get || !/^[\w-]{20,}$/.test(spreadsheetId||''))
    throw new Error('Private sheet source not configured');
  return async (staffId,date) => {
    if (!/^[A-Za-z0-9_-]{1,48}$/.test(String(staffId)) || !/^20\d{2}-\d{2}-\d{2}$/.test(date))
      throw new Error('INVALID_KEY');
    const result=await sheets.spreadsheets.values.get({
      spreadsheetId,
      range:"'HR Leave Sync'!A2:I",
      valueRenderOption:'FORMATTED_VALUE'
    });
    const row=(result.data.values||[]).find(r=>String(r[0]||'').trim()===staffId&&String(r[1]||'').trim()===date);
    return row ? {
      staffId,date,noteTime:String(row[2]||''),reason:String(row[3]||''),
      tracker:String(row[4]||''),sourceRow:Number(row[5]||0),
      sourceTimestamp:String(row[6]||''),leaveType:String(row[7]||'')
    } : null;
  };
}
