const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('let cVal=cell.toUpperCase()');
const end=html.indexOf('const recordDate =',start);
assert.ok(start>0&&end>start);
const parse=new Function('cell',html.slice(start,end)+'return {AL:al,SL:sl,SP:sp,UP:up,A:a,D:d,H:h,Late5m:l5,Late3m:l3,OT:ot,isPresent:pres};');
const ds=html.indexOf('const getDisplayCode = rec =>');
const de=html.indexOf('const cellClass =',ds);
const display=new Function(html.slice(ds,de)+'return getDisplayCode;')();
const kinds=['AL','SL','SP','UP','A','D','H','OT'];
test('reported L/H-SP retains lateness and half SP in monthly display and totals',()=>{
 const r=parse('L/H-SP'); assert.equal(r.SP,0.5);assert.equal(r.Late5m,1);
 assert.equal(display({leaves:r}),'L/H-SP');
 const totals=['L/H-SP','SP','SP','SP'].map(parse).reduce((a,r)=>({SP:a.SP+r.SP,L:a.L+r.Late5m}),{SP:0,L:0});
 assert.deepEqual(totals,{SP:3.5,L:1});
});
test('all standalone full and half codes',()=>{
 for(const k of kinds){assert.equal(parse(k)[k],1,k);assert.equal(parse('H-'+k)[k],0.5,'H-'+k);}
 for(const k of ['L',"L'"]){assert.equal(parse(k)[k==='L'?'Late5m':'Late3m'],1);}
 for(const k of ['P','PRESENT'])assert.equal(parse(k).isPresent,true);
});
test('every ordered pair of full/half leave, off, holiday and overtime slash codes',()=>{
 for(const a of kinds)for(const b of kinds)for(const ah of ['', 'H-'])for(const bh of ['', 'H-']){
  const code=ah+a+'/'+bh+b,r=parse(code);
  for(const k of kinds)assert.equal(r[k],(k===a?0.5:0)+(k===b?0.5:0),code+' '+k);
 }
});
test('both late codes and presence combine with every full/half code in either order',()=>{
 for(const marker of ['L',"L'",'P','PRESENT'])for(const k of kinds)for(const half of ['', 'H-'])for(const reverse of [false,true]){
  const code=(reverse?[half+k,marker]:[marker,half+k]).join('/'),r=parse(code);
  assert.equal(r[k],0.5,code);
  if(marker==='L'||marker==="L'")assert.equal(r[marker==='L'?'Late5m':'Late3m'],1,code);
  else assert.equal(r.isPresent,true,code);
 }
});
test('additional separators, whitespace, lowercase and note text preserve SP',()=>{
 for(const separator of ['+','&',',','\n']){
  const r=parse('L'+separator+'H-SP');assert.equal(r.SP,0.5);assert.equal(r.Late5m,1);
 }
 assert.equal(parse(' l / h-sp (Morning) ').SP,0.5);
 assert.equal(parse('AL/SP + L').SP,0.5);
});
test('day-off and holiday aliases work alone and in slash combinations',()=>{
 for(const [code,key,amount] of [['DAY OFF','D',1],['HALF DAY OFF','D',0.5],['H-DAYOFF','D',0.5],['HOLIDAY','H',1],['H-HOLIDAY','H',0.5],['HALF HOLIDAY','H',0.5],['H-Hol','H',0.5]]){
  assert.equal(parse(code)[key],amount,code);
  assert.equal(parse('L/'+code)[key],0.5,'L/'+code);
 }
});

