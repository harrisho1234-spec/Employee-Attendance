import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateSheetSource} from './private-sheet-source.js';

test('private sheet source returns matching staff and date only', async()=>{
  const calls=[];
  const read=createPrivateSheetSource({spreadsheetId:'1npvICjymicRohQ6G16Ys3Rm9kp7f3XwREIXsnpBz8tM',sheets:{spreadsheets:{values:{get:async options=>{
    calls.push(options);
    return {data:{values:[['LPH-023','2026-08-30','Full Day','Sensitive reason','lpl-lph','254','','AL',''],['LPH-024','2026-08-30','Morning','Another','lpl-lph','255','','SL','']]}};
  }}}}});
  const entry=await read('LPH-023','2026-08-30');
  assert.equal(entry.noteTime,'Full Day');
  assert.equal(entry.reason,'Sensitive reason');
  assert.equal(calls[0].range,"'HR Leave Sync'!A2:I");
  assert.equal(await read('LPH-999','2026-08-30'),null);
});
test('private sheet source rejects invalid keys before making sheet calls',async()=>{
  let calls=0;
  const read=createPrivateSheetSource({spreadsheetId:'1npvICjymicRohQ6G16Ys3Rm9kp7f3XwREIXsnpBz8tM',sheets:{spreadsheets:{values:{get:async()=>{calls++;return {data:{values:[]}}}}}}});
  await assert.rejects(()=>read('../other','2026-08-30'),/INVALID_KEY/);
  assert.equal(calls,0);
});

test('identity matching handles sheet serial dates and normalized staff IDs without type filtering',async()=>{
 const serial=(Date.UTC(2026,9,30)-Date.UTC(1899,11,30))/86400000;
 const read=createPrivateSheetSource({spreadsheetId:'synthetic-private-sheet-id',sheets:{spreadsheets:{values:{get:async options=>{
  assert.equal(options.valueRenderOption,'UNFORMATTED_VALUE');assert.equal(options.dateTimeRenderOption,'SERIAL_NUMBER');
  return {data:{values:[[' test-031 ',serial,'Morning','Synthetic reason','test',1,'','SL']]}};
 }}}}});
 const row=await read('TEST-031','2026-10-30');
 assert.equal(row.noteTime,'Morning');assert.equal(row.reason,'Synthetic reason');assert.equal(row.leaveType,'SL');
 assert.equal(await read('TEST-031','2026-10-31'),null);assert.equal(await read('TEST-032','2026-10-30'),null);
});
test('date text is trimmed but invalid and ambiguous dates never match',async()=>{
 const read=createPrivateSheetSource({spreadsheetId:'synthetic-private-sheet-id',sheets:{spreadsheets:{values:{get:async()=>({data:{values:[
  ['TEST-1',' 2026-10-30 ','Morning'],['TEST-2','10/30/2026','Afternoon']
 ]}})}}}});
 assert.equal((await read('TEST-1','2026-10-30')).noteTime,'Morning');assert.equal(await read('TEST-2','2026-10-30'),null);
 await assert.rejects(read('TEST-1','2026-02-30'),/INVALID_KEY/);
});
test('duplicate identity fails closed rather than exposing an arbitrary reason',async()=>{
 const read=createPrivateSheetSource({spreadsheetId:'synthetic-private-sheet-id',sheets:{spreadsheets:{values:{get:async()=>({data:{values:[
  ['TEST-1','2026-10-30','Morning','One'],['test-1','2026-10-30','Afternoon','Two']
 ]}})}}}});
 await assert.rejects(read('TEST-1','2026-10-30'),/AMBIGUOUS_SOURCE_KEY/);
});
