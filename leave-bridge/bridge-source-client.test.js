import test from 'node:test';
import assert from 'node:assert/strict';
import {createBridgeSource} from './bridge-source-client.js';
const url='https://leave-bridge-916969515475.asia-southeast1.run.app';
test('authenticates privately using target audience and filters employee/date',async()=>{
 let audience,requested,authorization;
 const source=createBridgeSource({
  url,getIdTokenClient:async a=>{audience=a;return {getRequestHeaders:async()=>({Authorization:'Bearer private-id-token'})};},
  fetchImpl:async(u,opt)=>{requested=u;authorization=opt.headers.Authorization;return {ok:true,json:async()=>({records:[
   {staffId:'OTHER',date:'2026-10-24',reason:'other'},
   {staffId:'ITC-001',date:'2026-10-24',reason:'private'}]})};}
 });
 const row=await source('ITC-001','2026-10-24');
 assert.equal(audience,url);assert.equal(authorization,'Bearer private-id-token');
 assert.equal(new URL(requested).searchParams.get('from'),'2026-10-24');
 assert.equal(row.reason,'private');
});
test('rejects unsafe URL schemes and query credentials',()=>{
 assert.throws(()=>createBridgeSource({url:'http://example.com'}),/Invalid/);
 assert.throws(()=>createBridgeSource({url:url+'?key=secret'}),/Invalid/);
});
test('never returns failed private upstream responses',async()=>{
 const source=createBridgeSource({url,getIdTokenClient:async()=>({getRequestHeaders:async()=>({Authorization:'Bearer x'})}),fetchImpl:async()=>({ok:false,status:403})});
 await assert.rejects(source('ITC-001','2026-10-24'),/BRIDGE_UNAVAILABLE/);
});
test('rejects invalid staff identifiers before external call',async()=>{
 const source=createBridgeSource({url,getIdTokenClient:async()=>{throw Error('SHOULD_NOT_CALL')}});
 await assert.rejects(source('../other','2026-10-24'),/INVALID_KEY/);
});

test('Google Auth Headers object is supported without exposing token',async()=>{
 let seen;
 const source=createBridgeSource({
   url,
   getIdTokenClient:async()=>({getRequestHeaders:async()=>new Headers({authorization:'Bearer signed-id-token'})}),
   fetchImpl:async(_url,options)=>{seen=options.headers.Authorization;return {ok:true,json:async()=>({records:[]})};}
 });
 await source('ITC-001','2026-10-24');
 assert.equal(seen,'Bearer signed-id-token');
});
test('missing Google service identity token fails closed',async()=>{
 const source=createBridgeSource({url,getIdTokenClient:async()=>({getRequestHeaders:async()=>({})}),fetchImpl:async()=>{throw new Error('should not fetch')}});
 await assert.rejects(source('ITC-001','2026-10-24'),/BRIDGE_CREDENTIALS_UNAVAILABLE/);
});
