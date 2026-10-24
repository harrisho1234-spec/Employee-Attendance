import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createPrivateHrApi} from './private-hr-api.js';
function response() {
 return {headers:{},status:null,body:null,setHeader(k,v){this.headers[k]=v},writeHead(n){this.status=n},end(v){this.body=JSON.parse(v)}};
}
function request({method='GET',url='/internal/hr/entry?staffId=ITC-001&date=2026-10-24',token,body,contentType='application/json'}={}) {
 const r=Readable.from(body===undefined?[]:[JSON.stringify(body)]);
 r.method=method;r.url=url;r.headers={'content-type':contentType};
 if(token!==undefined) r.headers['x-firebase-id-token']=token;
 return r;
}
const ops={read:async()=>({reason:{value:'private'}}),update:async()=>({ok:true}),reset:async()=>({ok:true})};
test('no Firebase credential returns 401 without data',async()=>{
 const res=response();await createPrivateHrApi(ops)(request(),res);
 assert.equal(res.status,401);assert.equal(res.body.entry,undefined);
});
test('authorized read routes to operations and no CORS is sent',async()=>{
 const res=response();await createPrivateHrApi(ops)(request({token:'abc'}),res);
 assert.equal(res.status,200);assert.equal(res.body.entry.reason.value,'private');
 assert.equal(res.headers['Access-Control-Allow-Origin'],undefined);
});
test('write routes support override and reset',async()=>{
 for(const path of ['override','reset']){
  const res=response();await createPrivateHrApi(ops)(request({method:'POST',url:'/internal/hr/'+path,token:'abc',body:{staffId:'ITC-001',date:'2026-10-24',field:'reason',value:'edited'}}),res);
  assert.equal(res.status,200);
 }
});
test('invalid content type and oversized requests are rejected',async()=>{
 const r1=response();await createPrivateHrApi(ops)(request({method:'POST',url:'/internal/hr/reset',token:'abc',contentType:'text/plain',body:{}}),r1);
 assert.equal(r1.status,415);
 const r2=response();await createPrivateHrApi(ops)(request({method:'POST',url:'/internal/hr/reset',token:'abc',body:{value:'X'.repeat(6000)}}),r2);
 assert.equal(r2.status,413);
});
test('permission failures do not leak private data',async()=>{
 const res=response();await createPrivateHrApi({read:async()=>{throw new Error('PERMISSION_DENIED')}})(request({token:'abc'}),res);
 assert.equal(res.status,403);assert.equal(res.body.error,'permission_denied');
});
