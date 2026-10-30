/** Server-only restricted HR sheet reader. Never expose this data without HR authorization. */
function validDay(value) {
 if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+'T00:00:00Z');
 return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function sheetDay(value) {
 // Sheets serial values represent local calendar dates, not UTC timestamps.
 // Requesting unformatted serials avoids locale-dependent display strings.
 if(typeof value==='number'){
  if(!Number.isFinite(value)||value<36526||value>=73051)return '';
  const date=new Date(Date.UTC(1899,11,30)+Math.floor(value)*86400000).toISOString().slice(0,10);
  return validDay(date)?date:'';
 }
 const date=String(value??'').trim();
 return validDay(date)?date:''; // Never guess ambiguous text such as 10/11/2026.
}
const staffKey=value=>String(value??'').trim().toUpperCase();
export function createPrivateSheetSource({sheets, spreadsheetId}) {
 if(!sheets?.spreadsheets?.values?.get||!/^[\w-]{20,}$/.test(spreadsheetId||''))throw new Error('Private sheet source not configured');
 return async(staffId,date)=>{
  if(!/^[A-Za-z0-9_-]{1,48}$/.test(String(staffId))||!validDay(date))throw new Error('INVALID_KEY');
  const result=await sheets.spreadsheets.values.get({
   spreadsheetId,range:"'HR Leave Sync'!A2:I",
   valueRenderOption:'UNFORMATTED_VALUE',dateTimeRenderOption:'SERIAL_NUMBER'
  });
  // Leave type is metadata only. A discrepancy must never suppress the match.
  const matches=(result.data.values||[]).filter(r=>staffKey(r[0])===staffKey(staffId)&&sheetDay(r[1])===date);
  if(matches.length>1)throw new Error('AMBIGUOUS_SOURCE_KEY');
  const row=matches[0];
  return row?{
   staffId,date,noteTime:String(row[2]??''),reason:String(row[3]??''),
   tracker:String(row[4]??''),sourceRow:Number(row[5]||0),
   sourceTimestamp:String(row[6]??''),leaveType:String(row[7]??'').trim().toUpperCase()
  }:null;
 };
}
