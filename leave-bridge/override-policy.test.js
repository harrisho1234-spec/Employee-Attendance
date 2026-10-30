import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvedAttendanceField, resolveAttendanceRow, resetFieldToSheet } from './override-policy.js';
const source = { staffId:'TEST-1',date:'2026-10-25',noteTime:'Morning',reason:'Source reason', attendanceCode:'H-SL' };
test('sheet values displayed when no manual overrides exist',()=>{
 const row=resolveAttendanceRow(source,{});
 assert.equal(row.noteTime.value,'Morning');
 assert.equal(row.reason.value,'Source reason');
 assert.equal(row.reason.origin,'sheet');
 assert.equal(row.attendanceCode,undefined);
});
test('manual note and reason take priority independently',()=>{
 const row=resolveAttendanceRow(source,{noteTime:{present:true,value:'Afternoon'}});
 assert.equal(row.noteTime.value,'Afternoon');
 assert.equal(row.reason.value,'Source reason');
});
test('deliberately blank override remains authoritative',()=>{
 const row=resolveAttendanceRow(source,{reason:{present:true,value:''}});
 assert.equal(row.reason.value,'');
 assert.equal(row.reason.origin,'manual');
});
test('reset to sheet clears only requested override',()=>{
 const manual={noteTime:{present:true,value:'Full Day'},reason:{present:true,value:'Corrected'}};
 const reset=resetFieldToSheet(manual,'reason');
 assert.equal(reset.reason,undefined);
 assert.equal(reset.noteTime.value,'Full Day');
 assert.equal(resolveAttendanceRow(source,reset).reason.value,'Source reason');
 assert.equal(manual.reason.value,'Corrected');
});
test('invalid reset is rejected',()=>assert.throws(()=>resetFieldToSheet({},'staffId')));

test('source leave type survives private resolution without copying attendance code or mutating source',()=>{
 const src={...source,leaveType:'SL',attendanceCode:'H-UP'};
 const row=resolveAttendanceRow(src,{reason:{present:true,value:''}});
 assert.equal(row.leaveType,'SL');assert.equal(row.reason.value,'');assert.equal(row.reason.origin,'manual');
 assert.equal(row.attendanceCode,undefined);assert.equal(src.attendanceCode,'H-UP');
});
