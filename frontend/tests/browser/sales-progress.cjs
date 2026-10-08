const {chromium}=require('playwright')
const assert=require('node:assert/strict')
;(async()=>{
 const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1100}})
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 const all=['lead','pre','funnel','follow','close','post','fin']
 let id=0
 const deals=[['start',6],['qualify',0],['advance',12],['won',20],['lost',7]].flatMap(([funnel,n])=>Array.from({length:n},()=>({id:++id,no:String(id),name:'آزمایش',funnel,stages:all,month:6,amount:'10000000',settle:'cash',mgrShare:true})))
 deals[1].finBy='مالی آزمایشی'
 const S={weights:{lead:5,pre:10,funnel:20,follow:15,close:35,post:10,fin:5},officialDeduct:10,months:{}}
 const full={fy:'1405',people:[{id:1,name:'آزمایش',role:'sales',S,inv:deals,invY:{1405:deals}},{id:2,name:'مالی آزمایشی',role:'finance',S,inv:[],invY:{1405:[]}}],years:{1405:{}}}
 const writes=[]
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}))
 await page.route('**/api/**',r=>{if(r.request().method()==='POST')writes.push({url:r.request().url(),data:r.request().postDataJSON()});return r.fulfill({json:{ok:true,full,order:[]}})})
 await page.goto((process.env.TEST_URL || 'http://127.0.0.1:5186')+'/tests/browser/index.html')
 const bar=page.locator('[data-order-row="1:1"] [data-sales-progress]')
 await bar.waitFor()
 assert.equal(await bar.getAttribute('data-sales-progress'),'100')
 const assigned=page.locator('[data-order-row="1:2"] [data-sales-progress]')
 assert.equal(await assigned.getAttribute('data-sales-progress'),'95')
 assert.equal(await assigned.locator('[data-sales-stage="fin"]').getAttribute('data-complete'),'false')
 assert.equal(await page.getByRole('combobox',{name:'انتخاب مرحله قیف فروش'}).count(),0)
 assert.equal(await page.getByText('مدل حقوق و تصویب پاداش',{exact:true}).count(),0)
 assert.equal(await page.getByText('پاداش تصویب‌شدهٔ مدیر',{exact:true}).count(),0)
 // C2: شمارِ هر وضعیت روی خودِ قیف (آیکون + عدد؛ نام در aria-label/tooltip)
 for(const [label,n] of [['آغاز','۶'],['واجد شرایط','۰'],['پیشبرد','۱۲'],['بستن','۲۰'],['شکست','۷']]) assert.equal(await page.locator('[data-tile="C2"]').getByRole('button',{name:label+': '+n,exact:true}).count(),1)
 for(const width of [1440,768,375,320]){
  await page.setViewportSize({width,height:1100}); await page.waitForTimeout(500); await bar.scrollIntoViewIfNeeded(); const pos=await bar.boundingBox(); await page.mouse.move(pos.x+pos.width/2,pos.y+pos.height/2)
  const dialog=page.getByRole('dialog',{name:'مراحل معامله'});await dialog.waitFor()
  assert.equal(await dialog.getByRole('checkbox').count(),8)
  assert.equal(await dialog.getByRole('region',{name:'سندِ مالی و نقش‌ها'}).count(),0)
  const bbox=await dialog.boundingBox();assert.ok(bbox.x>=0 && bbox.x+bbox.width<=width)
  await dialog.getByRole('button',{name:'بستن',exact:true}).click(); await page.mouse.move(0,0); await page.waitForTimeout(550)
 }
 await bar.focus();await page.keyboard.press('Enter');const dialog=page.getByRole('dialog',{name:'مراحل معامله'})
 const fin=dialog.locator('input[id$="-fin"]')
 assert.equal(await fin.isDisabled(),false)
 await dialog.getByRole('combobox',{name:'حسابدار (تأییدکنندهٔ مالی)'}).selectOption('مالی آزمایشی')
 // حسابدار صاحبِ مرحلهٔ مالی می‌شود: تیکِ فروشنده برداشته و قفل، وزن با حسابدار
 assert.equal(await fin.isChecked(),false); assert.equal(await fin.isDisabled(),true)
 assert.match(await fin.getAttribute('aria-label'),/سهمِ این مرحله با «مالی آزمایشی»/)
 const box=await dialog.boundingBox(); console.log('dialog height', Math.round(box.height))
 await dialog.getByRole('button',{name:'ذخیرهٔ نقش‌ها و تأیید مالی'}).click()
 await page.waitForTimeout(300)
 assert.equal(writes.filter(x=>x.url.includes('finance-by')).length,1)
 assert.deepEqual(errors,[])
 console.log('PASS: hover/touch stage selection, accountant takes the finance stage, existing finance API, current counts, removed C8/C3 row, 320–1440px')
 await browser.close()
})().catch(e=>{console.error(e);process.exit(1)})
