import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { createHmac, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { createHandler } from '../bridge/server.mjs';
const require = createRequire(import.meta.url);
const { resolve, escape } = require('../leave-sync.js');
const code = fs.readFileSync(new URL('../apps-script/LeaveBridge.gs', import.meta.url), 'utf8');
const context = vm.createContext({ Date });
vm.runInContext(code, context);
const header = ['Timestamp','Date of Leave','Staff ID','Staff Name','Company','Department','Period / Duration','Requested Leave Type','Master Sheet Quota Status','Verified Leave Type','Attendance Code','Reason','Extension Status','Sync Status'];
const row = (date = '2026-10-24', period = 'Half Day Morning', reason = 'Synthetic fixture', extra = {}) =>
    Object.assign(['2026-10-24 08:00:00', date, 'TEST-001', 'Test Employee', 'TEST', '', period, 'SL', '', 'SL', 'H-SL', reason, 'Original Request', 'Synced'], extra);
const key = 'TEST-001_October_24_2026';

test('three trackers, header row eight, staff ID normalization, inclusive date ranges and year boundary', () => {
    const result = context.leaveParseSources_([
        [...Array.from({length:7}, () => []), header, row()],
        [header, row('2026-12-31 to 2027-01-02', '3 Days', 'Range', {2:'test-002'})],
        [header, row('2026-10-24', 'Half Day Afternoon', 'Third tracker', {2:'TEST-003'})]
    ], 2026);
    assert.equal(result.records[key].note, 'Morning');
    assert.equal(result.records.TEST002, undefined);
    assert.equal(result.records['TEST-002_December_31_2026'].note, 'Full Day');
    assert.equal(result.records['TEST-002_January_1_2027'], undefined);
    assert.equal(result.records['TEST-003_October_24_2026'].note, 'Afternoon');
});
test('latest timestamp wins even if rows sorted; later row breaks ties; conversion and P clear metadata', () => {
    let result = context.leaveParseSources_([[header, row(undefined, 'Afternoon Extension', 'New', {0:'2026-10-24 12:00:00'}), row()]], 2026);
    assert.equal(result.records[key].note, 'Full Day'); assert.equal(result.records[key].reason, 'New');
    result = context.leaveParseSources_([[header, row(), row(undefined, 'Full Day', 'Edited')]], 2026);
    assert.equal(result.records[key].reason, 'Edited');
    result = context.leaveParseSources_([[header, row(), row(undefined, 'Presence Override', 'Manual Override', {7:'P'})]], 2026);
    assert.equal(result.records[key].note, ''); assert.equal(result.records[key].reason, '');
});
test('invalid dates, unknown staff, unsynced rows and unexpected layouts fail safely', () => {
    assert.equal(context.leaveDates_('2026-02-30').length, 0);
    assert.equal(context.leaveDates_('2026-10-25 to 2026-10-24').length, 0);
    const result = context.leaveParseSources_([[header, row(undefined, undefined, undefined, {2:'UNKNOWN'}), row(undefined, undefined, undefined, {13:'Failed'}), row('ambiguous')]],2026);
    assert.equal(result.skipped,3); assert.equal(Object.keys(result.records).length,0);
    assert.throws(() => context.leaveParseSources_([[['Wrong headers']]],2026));
    assert.equal(context.leaveValidKey_('TEST-1_February_30_2026',2026),false);
});
test('field overrides including blank survive refresh, legacy values take priority, reset follows Sheet', () => {
    const snap = {records:{[key]:{note:'Morning',reason:'Sheet'}},overrides:{[key]:{note:'',reason:'Manual'}}};
    assert.equal(resolve(key,'note',snap,{}),'');
    assert.equal(resolve(key,'reason',snap,{}),'Manual');
    snap.records[key].reason = 'Changed source';
    assert.equal(resolve(key,'reason',snap,{}),'Manual');
    snap.overrides[key] = {reasonReset:true};
    assert.equal(resolve(key,'reason',snap,{[key]:'Old manual'}),'Changed source');
    assert.equal(resolve(key,'note',snap,{[key]:'Old manual'}),'Old manual');
    assert.equal(resolve(key,'reason',null,{},'Fallback'),'Fallback');
    assert.equal(escape(`<img onerror="bad">'&`),'&lt;img onerror=&quot;bad&quot;&gt;&#39;&amp;');
});

const config = {clientId:'test-client',allowedEmails:'test@example.com',origin:'https://example.com',scriptUrl:'https://script.google.com/macros/s/test/exec',secret:'x'.repeat(64)};
async function call(handler, body, headers = {}, method = 'POST') {
    const req = Readable.from([typeof body === 'string' ? body : JSON.stringify(body)]);
    Object.assign(req, {headers:{origin:config.origin,authorization:'Bearer test-token',...headers},method,url:'/leave'});
    const res = {headers:{},setHeader(k,v){this.headers[k]=v;},writeHead(s){this.status=s;},end(b){this.body=b ? JSON.parse(b):null;}};
    await handler(req,res); return res;
}
test('bridge denies missing/invalid/disallowed/unverified identity before calling Apps Script', async () => {
    for (const user of [null,{email:'other@example.com',email_verified:true,hd:'example.com'}, {email:'test@example.com',email_verified:false,hd:'example.com'}, {email:'test@example.com',email_verified:true}]) {
        let calls=0;
        const handler=createHandler(config,async()=>{if(!user)throw Error();return user;},async()=>{calls++;});
        assert.equal((await call(handler,{action:'read',year:2026})).status,401);
        assert.equal(calls,0);
    }
});
test('bridge validates audience, signs body with verified actor, uses no-store and restricts origin', async () => {
    let upstreamBody;
    const handler=createHandler(config,async(token,audience)=>{
        assert.equal(audience,config.clientId);return {email:'test@example.com',email_verified:true,hd:'example.com'};
    },async(url,options)=>{upstreamBody=JSON.parse(options.body);return {ok:true,json:async()=>({ok:true,records:{},overrides:{}})};});
    const result=await call(handler,{action:'read',year:2026,actor:'spoofed'});
    assert.equal(result.status,200);assert.match(result.headers['Cache-Control'],/no-store/);
    assert.equal(JSON.parse(upstreamBody.payload).actor,'test@example.com');
    assert.equal(upstreamBody.signature,createHmac('sha256',config.secret).update(upstreamBody.payload).digest('hex'));
    assert.equal((await call(handler,{},{origin:'https://attacker.test'})).status,403);
    assert.equal((await call(handler,{action:'delete',year:2026})).status,400);
    assert.equal((await call(handler,{action:'override',year:2026,key,field:'reason',value:'x'.repeat(2001)})).status,400);
});
test('Apps Script refuses unsigned/stale/replayed requests; signed overrides and resets persist privately', () => {
    const rows=[['Key','JSON']], nonces=new Map();let sourceReads=0;
    const sheet={getDataRange:()=>({getValues:()=>rows}),getRange:(r)=>({setValues:v=>{rows[r-1]=v[0];}})};
    const props={BRIDGE_SECRET:config.secret,TRACKER_IDS:'["one","two","three"]',OVERRIDES_SHEET_ID:'private'};
    const ctx=vm.createContext({Date,PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]})},
        Utilities:{computeHmacSha256Signature:(p,s)=>[...createHmac('sha256',s).update(p).digest()]},
        LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
        CacheService:{getScriptCache:()=>({get:k=>nonces.get(k),put:(k,v)=>nonces.set(k,v)})},
        ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})},
        SpreadsheetApp:{openById:id=>id==='private'?{getSheetByName:()=>sheet}:{getSpreadsheetTimeZone:()=>'Asia/Bangkok',getSheetByName:()=>{sourceReads++;return {getDataRange:()=>({getValues:()=>[header,row()]})};}}}});
    vm.runInContext(code,ctx);
    const signed=(action,extra={})=>{
        const payload=JSON.stringify({action,year:2026,key,field:'reason',value:'=SYNTHETIC()',actor:'test@example.com',timestamp:Date.now(),nonce:randomUUID(),...extra});
        return {postData:{contents:JSON.stringify({payload,signature:createHmac('sha256',config.secret).update(payload).digest('hex')})}};
    };
    assert.equal(ctx.doPost({postData:{contents:'{}'}}).ok,false);assert.equal(sourceReads,0);
    assert.equal(ctx.doPost(signed('read',{timestamp:1})).ok,false);assert.equal(sourceReads,0);
    const request=signed('override');assert.equal(ctx.doPost(request).ok,true);
    assert.equal(ctx.doPost(request).ok,false);
    assert.equal(JSON.parse(rows[1][1]).reason,'=SYNTHETIC()'); assert.ok(rows[1][1].startsWith('{'));
    let result=ctx.doPost(signed('read'));assert.equal(result.overrides[key].reason,'=SYNTHETIC()');
    result=ctx.doPost(signed('reset'));assert.equal(result.overrides[key].reasonReset,true);assert.equal(result.overrides[key].reason,undefined);
});
test('all inline dashboard scripts still parse; private client never writes localStorage or Firebase', () => {
    const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
    for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
        if(!match[1].includes('type="module"')) new vm.Script(match[2]);
    }
    const client=fs.readFileSync(new URL('../leave-sync.js',import.meta.url),'utf8');
    assert.doesNotMatch(client,/localStorage|sessionStorage|fbSetDoc|indexedDB/);
});
