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
  assert.equal(calls[0].range,\"'HR Leave Sync'!A2:I\");
  assert.equal(await read('LPH-999','2026-08-30'),null);
});
test('private sheet source rejects invalid keys before making sheet calls',async()=>{
  let calls=0;
  const read=createPrivateSheetSource({spreadsheetId:'1npvICjymicRohQ6G16Ys3Rm9kp7f3XwREIXsnpBz8tM',sheets:{spreadsheets:{values:{get:async()=>{calls++;return {data:{values:[]}}}}}}});
  await assert.rejects(()=>read('../other','2026-08-30'),/INVALID_KEY/);
  assert.equal(calls,0);
});
