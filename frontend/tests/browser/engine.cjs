const {chromium}=require('playwright')
const assert=require('node:assert/strict')
const fs=require('node:fs')
;(async()=>{
 const browser=await chromium.launch({headless:true})
 const page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'reduce'})
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 const keys=['lead','pre','funnel','follow','close','post','fin']
 const deals=[0,4,5,7,6].map((n,i)=>({id:i+1,no:['ZERO','HALF','EIGHTYFIVE','FULL','GAP'][i],name:'آزمایش موتور',stages:i===4?['lead','funnel','follow','close','post','fin']:keys.slice(0,n),amount:'100000000',month:6,funnel:'won',settle:'cash'}))
 const S={weights:{lead:5,pre:10,funnel:20,follow:15,close:35,post:10,fin:5},officialDeduct:10,months:{}}
 const full={fy:'1405',people:[{id:1,name:'آزمایش',S,inv:deals,invY:{1405:deals}}],years:{1405:{}}}
 let writes=0
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}))
 await page.route('**/api/**',r=>{if(r.request().method()==='POST')writes++;return r.fulfill({json:{ok:true,full,order:[]}})})
 await page.goto('http://127.0.0.1:5183/tests/browser/index.html')
 const c4=page.getByRole('region',{name:'مونتاژ موتور و هفت مرحلهٔ فروش'})
 const select=c4.getByLabel('معاملهٔ C4',{exact:true})
 for(const [i,percent,end] of [[0,0,18],[1,50,53],[2,85,70],[3,100,121],[4,90,28]]){
  await select.selectOption(`0:${i+1}`)
  await c4.locator(`[data-engine-frame="${end}"]`).waitFor()
  await c4.locator('img').evaluate(img=>img.decode())
  assert.equal(await c4.locator('ol li').count(),7)
  if(i<4) await c4.screenshot({path:`/workspace/scratch/c4-${percent}.png`})
 }
 await page.setViewportSize({width:390,height:844})
 await select.selectOption('0:3')
 await c4.screenshot({path:'/workspace/scratch/c4-mobile.png'})
 assert.ok(await c4.evaluate(el=>el.scrollWidth<=el.clientWidth+1))
 await page.emulateMedia({reducedMotion:'no-preference'})
 await page.clock.install()
 await select.selectOption('0:2')
 // Drive genuine image loads and virtual playback time; verify assembly->label->hold->fade.
 let previous=18, holds=[]
 for(let step=0;step<140;step++){
  const visual=c4.locator('[data-engine-frame]')
  const frame=Number(await visual.getAttribute('data-engine-frame'))
  assert.ok(frame>=previous && frame<=53);previous=frame
  await c4.locator('img').evaluate(img=>img.decode())
  const phase=await visual.getAttribute('data-engine-phase')
  if(phase==='hold'){
   holds.push(await c4.locator('[data-engine-stage-label]').textContent())
   await page.clock.runFor(1900)
   assert.equal(await visual.getAttribute('data-engine-phase'),'hold')
   await page.clock.runFor(200)
   assert.equal(await visual.getAttribute('data-engine-phase'),'fade-out')
  }else await page.clock.runFor(phase==='fade-in'||phase==='fade-out'?300:50)
  if(phase==='stopped')break
 }
 assert.equal(previous,53);assert.equal(holds.length,4)
 assert.equal(await c4.locator('[data-activated="true"]').count(),4)
 // Revoking a prior stage/data selection must immediately remove the full engine.
 await select.selectOption('0:1')
 assert.equal(await c4.locator('[data-engine-frame]').getAttribute('data-engine-frame'),'18')
 assert.equal(writes,0);assert.deepEqual(errors,[])
 console.log('PASS: 0/50/85/100%, first-gap stop, forward playback, 2s holds/fades, persistent numbers, reduced motion, mobile, zero writes')
 await browser.close()
})().catch(e=>{console.error(e);process.exit(1)})
