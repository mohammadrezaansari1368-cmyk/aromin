const {chromium}=require('playwright')
const assert=require('node:assert/strict')
;(async()=>{
 const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1100}})
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 const all=['lead','pre','funnel','follow','close','post','fin']
 const deals=['start','qualify','advance','won'].map((funnel,i)=>({id:i+1,no:String(i+1),name:'آزمایش',funnel,stages:all,month:6,amount:'10000000',settle:'cash',mgrShare:true}))
 const S={weights:{lead:5,pre:10,funnel:20,follow:15,close:35,post:10,fin:5},officialDeduct:10,months:{}}
 const full={fy:'1405',people:[{id:1,name:'آزمایش',role:'sales',S,inv:deals,invY:{1405:deals}}],years:{1405:{}}}
 let writes=0
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}))
 await page.route('**/api/**',r=>{if(r.request().method()==='POST')writes++;return r.fulfill({json:{ok:true,full,order:[]}})})
 await page.goto('http://127.0.0.1:5184/tests/browser/index.html')
 for(const width of [1440,768,375,320]){
  await page.setViewportSize({width,height:1100})
  for(const [i,p] of [[1,5],[2,15],[3,85],[4,85]]){
   const row=page.locator(`[data-order-row="1:${i}"]`),progress=row.locator('[data-sales-progress]')
   await progress.waitFor();assert.equal(await progress.getAttribute('data-sales-progress'),String(p))
   assert.equal(await progress.locator('[data-sales-stage]').count(),7)
   assert.equal(await progress.getByRole('checkbox').count(),0)
   await progress.click();await progress.dblclick()
   await page.keyboard.press('Enter'); await page.keyboard.press('F2')
   assert.equal(await page.getByRole('region',{name:'سندِ مالی و نقش‌ها'}).count(),0)
  }
 }
 await page.setViewportSize({width:1440,height:1100})
 await page.locator('[data-order-row="1:4"]').getByRole('button',{name:'سند مالی',exact:true}).click()
 await page.getByRole('region',{name:'سندِ مالی و نقش‌ها'}).waitFor()
 assert.equal(writes,0);assert.deepEqual(errors,[])
 console.log('PASS: 5/15/85%, 7 derived indicators, click/double-click do not open approval, explicit financial action remains, 320–1440px, zero writes')
 await browser.close()
})().catch(e=>{console.error(e);process.exit(1)})
