import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRow,mergeRecords,createHandler} from './server.js';
test('normalizes one half-day leave without modifying attendance codes',()=>{
 const row=['2026-10-24 09:00:00','2026-10-25','ITC-001','Example','ITC','Sales','Half Day Morning','AL','','H-AL','H-AL','personal','Original Request','Synced'];
 const result=normalizeRow(row,'itc-lpt',0);
 assert.equal(result.length,1);
 assert.equal(result[0].date,'2026-10-25');
 assert.equal(result[0].noteTime,'Morning');
 assert.equal(result[0].reason,'personal');
 assert.equal(result[0].staffId,'ITC-001');
});
test('ignores unknown and unsynced rows',()=>{
 const row=['','2026-10-25','UNKNOWN','','','','','','','','','','','Synced'];
 assert.deepEqual(normalizeRow(row,'ttc',0),[]);
});
test('expands date range and rejects oversized ranges',()=>{
 const row=['','2026-10-25 to 2026-10-27','TTC-001','','','','Full Day','SL','','','','sick','','Synced'];
 assert.equal(normalizeRow(row,'ttc',0).length,3);
 row[1]='2026-01-01 to 2026-12-31';
 assert.equal(normalizeRow(row,'ttc',0).length,0);
});
test('newer events win per employee-date',()=>{
 const a={staffId:'X',date:'2026-10-25',sourceTimestamp:'2026-10-24 09:00:00',reason:'before'};
 const b={...a,sourceTimestamp:'2026-10-24 09:05:00',reason:'after'};
 assert.equal(mergeRecords([a,b])[0].reason,'after');
});
test('only supports explicit routes and never sets public CORS headers',async()=>{
 const h=createHandler(async()=>[]);
 const headers={};
 const response={setHeader:(k,v)=>headers[k]=v,writeHead(code){this.code=code},end(x){this.body=x}};
 await h({method:'GET',url:'/unknown'},response);
 assert.equal(response.code,404);
 assert.equal(headers['Access-Control-Allow-Origin'],undefined);
});

test('day-off swaps are quarantined rather than misreported as full-day leave',()=>{
 const row=['2026-10-24 10:00:00','Off: 2026-10-25 | Work: 2026-10-26','TTC-001','','','','Day-Off Swap','D','','','','Day off','','Synced'];
 assert.deepEqual(normalizeRow(row,'ttc',0),[]);
});
test('invalid calendar day does not become another day',()=>{
 const row=['2026-10-24 10:00:00','2026-02-30','TTC-001','','','','Full Day','SL','','','','Private','','Synced'];
 assert.deepEqual(normalizeRow(row,'ttc',0),[]);
});
