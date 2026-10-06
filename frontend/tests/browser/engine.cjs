const {chromium}=require('playwright')
const assert=require('node:assert/strict')
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
 const select=c4.getByLabel('معاملهٔ C4',{exact:true}),visual=c4.locator('[data-engine-frame]')
 const read=async()=>({frame:Number(await visual.getAttribute('data-engine-frame')),phase:await visual.getAttribute('data-engine-phase')})
 const decode=()=>c4.locator('img').evaluate(img=>img.decode())
 for(const [i,percent,end,prefix] of [[0,0,18,0],[1,50,53,4],[2,85,70,5],[3,100,121,7],[4,90,28,1]]){
  await select.selectOption(`0:${i+1}`)
  await c4.locator(`[data-engine-frame="${end}"]`).waitFor();await decode()
  assert.equal((await read()).phase,'stopped')
  assert.equal(await c4.locator('[data-engine-number]').count(),7)
  assert.equal(await c4.locator('[data-activated="true"]').count(),prefix)
  assert.equal(await c4.locator('[data-engine-stage-label]').evaluateAll(xs=>xs.some(x=>x.style.opacity==='1')),false)
  assert.equal(await c4.getByRole('button').count(),0)
  if(i<4)await c4.screenshot({path:`/workspace/scratch/c4-final-${percent}.png`})
 }
 const clockStart=new Date('2026-10-06T12:00:00Z')
 await page.clock.install({time:clockStart})
 await page.clock.pauseAt(new Date(clockStart.getTime()+1000))
 await page.clock.runFor(15000);assert.deepEqual(await read(),{frame:28,phase:'stopped'})
 const coordinates=[]
 for(const width of [1440,768,390,320]){
  await page.setViewportSize({width,height:1100})
  const positions=await c4.locator('[data-engine-scene]').evaluate(scene=>{
   const rect=scene.getBoundingClientRect()
   return [...scene.querySelectorAll('[data-engine-number]')].map(node=>{const b=node.getBoundingClientRect();return {x:(b.x+b.width/2-rect.x)/rect.width,y:(b.y+b.height/2-rect.y)/rect.height,inside:b.left>=rect.left&&b.right<=rect.right&&b.top>=rect.top&&b.bottom<=rect.bottom,text:node.textContent}})
  })
  assert.ok(positions.every(p=>p.inside));assert.deepEqual(positions.map(p=>p.text),['01','02','03','04','05','06','07'])
  coordinates.push(positions)
  assert.ok(await c4.evaluate(el=>el.scrollWidth<=el.clientWidth+1))
 }
 coordinates.slice(1).forEach(ps=>ps.forEach((p,i)=>{assert.ok(Math.abs(p.x-coordinates[0][i].x)<.02);assert.ok(Math.abs(p.y-coordinates[0][i].y)<.02)}))
 await page.emulateMedia({reducedMotion:'no-preference'})
 await select.selectOption('0:1');await page.clock.runFor(15000)
 assert.deepEqual(await read(),{frame:18,phase:'stopped'})
 for(const [value,end,prefix] of [['0:2',53,4],['0:3',70,5],['0:4',121,7],['0:5',28,1]]){
  await select.selectOption(value);await decode()
  let loops=0,previous=18,holds=0
  await c4.getByRole('button',{name:'توقف پخش',exact:true}).click()
  const initial=await read()
  await page.clock.runFor(5000);assert.deepEqual(await read(),initial)
  await c4.getByRole('button',{name:'ادامهٔ پخش',exact:true}).click()
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))})
  const hiddenState=await read()
  await page.clock.runFor(5000);assert.deepEqual(await read(),hiddenState)
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))})
  for(let step=0;step<650&&loops<2;step++){
   await decode()
   const {frame,phase}=await read()
   assert.ok(frame>=18&&frame<=end)
   assert.ok(await c4.locator('[data-activated="true"]').count()<=prefix)
   if(frame<previous){assert.equal(frame,18);assert.ok(['reset-load','reset-in'].includes(phase));loops++}
   previous=frame
   if(phase==='hold'){
    holds++
    const inside=await c4.locator('[data-engine-scene]').evaluate(scene=>{
     const r=scene.getBoundingClientRect(),label=[...scene.querySelectorAll('[data-engine-stage-label]')].find(x=>x.style.opacity==='1')
     if(!label)return false
     const b=label.getBoundingClientRect();return b.left>=r.left&&b.right<=r.right&&b.top>=r.top&&b.bottom<=r.bottom
    });assert.ok(inside)
    if(holds===1&&value==='0:2')await c4.screenshot({path:'/workspace/scratch/c4-final-mobile-label.png'})
    await page.clock.runFor(1900);assert.equal((await read()).phase,'hold')
    await page.clock.runFor(150);assert.equal((await read()).phase,'fade-out')
   }else if(phase==='final-hold'){
    assert.equal(frame,end)
    await page.clock.runFor(1900);assert.equal((await read()).phase,'final-hold')
    await page.clock.runFor(150);assert.equal((await read()).phase,'reset-out')
   }else await page.clock.runFor(phase==='glow'?150:phase==='attach'?50:phase==='reset-load'?1:300)
  }
  assert.equal(loops,2);assert.equal(holds,prefix*2)
 }
 await select.selectOption('0:1');assert.deepEqual(await read(),{frame:18,phase:'stopped'})
 assert.equal(writes,0);assert.deepEqual(errors,[])
 console.log('PASS: responsive overlays; 0/50/85/100%; gap stop; two bounded loops each; final hold/reset; pause/visibility; reduced motion; zero writes')
 await browser.close()
})().catch(e=>{console.error(e);process.exit(1)})
