const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.join(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || undefined,headless:true});
 const page=await browser.newPage();
 const key='TEST-001_October_24_2026';
 let records={[key]:{note:'Morning',reason:'Synthetic private reason'}},overrides={};
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='private.test'){
   const body=route.request().postDataJSON();
   if(body.action==='override') overrides[body.key]={...(overrides[body.key]||{}),[body.field]:body.value};
   if(body.action==='reset'){delete overrides[body.key]?.[body.field];overrides[body.key]={...(overrides[body.key]||{}),[body.field+'Reset']:true};}
   return route.fulfill({json:{ok:true,records,overrides,syncedAt:new Date().toISOString()}});
  }
  if(url.hostname==='accounts.google.com')return route.fulfill({contentType:'text/javascript',body:`window.google={accounts:{id:{initialize(c){window.testSignIn=()=>c.callback({credential:'a.'+btoa(JSON.stringify({exp:Date.now()/1000+3600}))+'.c'})},renderButton(){},disableAutoSelect(){}}}};`});
  if(url.hostname==='fixture.test'){
   const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
   if(name==='leave-sync-config.js')return route.fulfill({contentType:'text/javascript',body:`window.LEAVE_SYNC_CONFIG={apiUrl:'https://private.test/leave',googleClientId:'test'};`});
   if(fs.existsSync(path.join(root,name)))return route.fulfill({path:path.join(root,name),contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.html')?'text/html':undefined});
  }
  return route.abort();
 });
 await page.goto('https://fixture.test/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.testSignIn);
 await page.evaluate(()=>{
  window.showAppToast=()=>{};
  allEmployees=[{id:'TEST-001',displayId:'TEST-001',name:'Synthetic Employee',company:'TEST',department:'TEST',position:'Tester',status:'Active',joinDate:'2020-01-01',leaves:{available:{},remaining:{}}}];
  selectedDailyCompanies=['TEST']; selectedDailyDepartments=['TEST']; dailySearchQuery='';
  window.isEmploymentVisible=()=>true;window.isDailyDepartmentSelected=()=>true;
  window.warningInlineIndicatorHtml=()=>'';window.staffPhotoImgHtml=()=>'';
  dailyLeaveRecords=[{year:2026,month:'October',day:24,staffId:'TEST-001',isPresent:false,note:'',leaves:{AL:0,SL:0.5,SP:0,UP:0,A:0,Late5m:0,Late3m:0,OT:0,D:0,H:0}}];
  document.getElementById('dailyFilterFrom').value='2026-10-24';document.getElementById('dailyFilterTo').value='2026-10-24';
  document.getElementById('dailyTableBody').closest('section, [id^="view-"]')?.classList.remove('hidden');
  renderDailyAttendance();
 });
 const totals=()=>page.evaluate(()=>JSON.stringify(currentDailyGroupedData.TEST[0].leaves));
 const before=await totals();
 await page.evaluate(()=>testSignIn());
 await page.waitForFunction(()=>document.querySelector('[data-leave-reason]')?.value==='Synthetic private reason');
 assert.equal(await totals(),before);
 await page.evaluate(()=>leaveSync.save('TEST-001_October_24_2026','reason',''));
 records[key].reason='Changed source';
 await page.evaluate(()=>leaveSync.refresh());
 assert.equal(await page.locator('[data-leave-reason]').first().inputValue(),'');
 await page.evaluate(()=>leaveSync.reset('TEST-001_October_24_2026','reason'));
 assert.equal(await page.locator('[data-leave-reason]').first().inputValue(),'Changed source');
 await page.evaluate(()=>leaveSync.save('TEST-001_October_24_2026','note','<img src=x onerror="window.injected=1">'));
 assert.equal(await page.evaluate(()=>window.injected),undefined);
 assert.equal(await totals(),before);
 await page.evaluate(()=>leaveSync.signOut());
 assert.equal(await page.locator('[data-leave-reason]').first().inputValue(),'');
 assert.equal(await page.locator('[data-leave-note]').first().textContent(),'Add Note');
 assert.equal(await page.evaluate(()=>JSON.stringify(localStorage).includes('Changed source')),false);
 console.log('Browser integration passed: private sync, blank override, refresh, reset, XSS escaping, sign-out clearing; attendance totals unchanged.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
