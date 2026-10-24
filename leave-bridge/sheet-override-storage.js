/**
 * Restricted Google Sheet override adapter. Shares the same columns as the
 * spreadsheet-bound HR Leave Workbench; no Firestore/public client access.
 * Requires Sheets read/write on the private HR spreadsheet for gateway identity.
 */
export function sheetOverrideStorage({sheets,spreadsheetId}) {
  if (!sheets?.spreadsheets?.values || !spreadsheetId) throw Error('Sheet adapter configuration missing');
  const range="'HR Leave Overrides'!A2:G";
  const keyParts=key=>{
    const match=/^([A-Za-z0-9_-]{1,48})_(20\d{2}-\d{2}-\d{2})$/.exec(key);
    if(!match)throw Error('Invalid override key');
    return {staffId:match[1],date:match[2]};
  };
  async function find(key){
    const {staffId,date}=keyParts(key);
    const response=await sheets.spreadsheets.values.get({spreadsheetId,range,valueRenderOption:'FORMATTED_VALUE'});
    const rows=response.data.values||[];
    const idx=rows.findIndex(r=>String(r[0]||'').trim()===staffId&&String(r[1]||'').trim()===date);
    return {staffId,date,row:idx<0?null:rows[idx],rowNumber:idx+2,length:rows.length};
  }
  const enabled=x=>/^(true|yes|1)$/i.test(String(x||''));
  const toOverrides=row=>{
    if(!row)return {};
    return {...(enabled(row[4])?{noteTime:{present:true,value:String(row[2]||'')}}:{}),
      ...(enabled(row[5])?{reason:{present:true,value:String(row[3]||'')}}:{})};
  };
  async function update(key,field,present,value){
    if(!['noteTime','reason'].includes(field))throw Error('Invalid field');
    const state=await find(key);
    if(!state.row){
      // Avoid append race by creating the row only once; the user's sync script
      // owns the staging data but does not delete override rows.
      await sheets.spreadsheets.values.append({spreadsheetId,range:"'HR Leave Overrides'!A:G",
        valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',
        requestBody:{values:[[state.staffId,state.date,'','',false,false,new Date().toISOString()]]}});
    }
    const fresh=state.row?state:await find(key);
    if(!fresh.row)throw Error('Override row creation did not complete');
    const col=field==='noteTime'?'C':'D',flag=field==='noteTime'?'E':'F',n=fresh.rowNumber;
    // Only touch the selected field, preserving the other manual override.
    if(present)await sheets.spreadsheets.values.update({spreadsheetId,range:`'HR Leave Overrides'!${col}${n}`,
      valueInputOption:'RAW',requestBody:{values:[[String(value??'')]]}});
    await sheets.spreadsheets.values.update({spreadsheetId,range:`'HR Leave Overrides'!${flag}${n}`,
      valueInputOption:'RAW',requestBody:{values:[[!!present]]}});
    await sheets.spreadsheets.values.update({spreadsheetId,range:`'HR Leave Overrides'!G${n}`,
      valueInputOption:'RAW',requestBody:{values:[[new Date().toISOString()]]}});
  }
  return {
    async get(key){return toOverrides((await find(key)).row);},
    async updateField(key,field,data){return update(key,field,!!data?.present,data?.value);},
    async deleteField(key,field){return update(key,field,false,'');}
  };
}
